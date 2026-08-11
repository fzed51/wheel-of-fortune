import type { GameAction } from './actions'
import { isFinalRound, isQuestion } from './bonus'
import { matchesAnswer } from './compare'
import { countOccurrences, isConsonant, isSolved, isVowel } from './puzzle'
import { canBuyVowel, canResolve, canSpin, isStuck, multiplierFor } from './rules'
import { INITIAL_WHEEL_ANGLE } from './setup'
import { resolveThrow } from './wheel'
import type {
  BonusResult,
  BonusState,
  Game,
  GameState,
  Phase,
  Player,
  PlayerId,
  Puzzle,
  RoundState,
  RoundSummary,
} from './types'
import { WHEEL } from './wheel'

/**
 * Reducer **strictement pur** : aucun `Math.random`, aucun `Date.now`, aucun
 * identifiant tiré, aucune écriture de stockage, aucun journal. StrictMode le
 * double-invoque en développement, donc tout effet de bord s'y verrait deux
 * fois. L'aléa et les identifiants arrivent déjà décidés dans les actions.
 *
 * Une action illégale renvoie **la même référence** d'état : c'est ce qui permet
 * à l'appelant de constater qu'il a tenté un coup interdit sans que le reducer
 * ait à porter un canal d'erreur.
 */
export const initialState: GameState = { kind: 'no-game' }

const AWAITING: Phase = { kind: 'awaiting-action' }

function playing(game: Game): GameState {
  return { kind: 'playing', game }
}

/** Copie par valeur : l'éditeur d'énigmes ne doit rien pouvoir muter sous la partie. */
function snapshotPuzzle(puzzle: Puzzle): Puzzle {
  const base = {
    id: puzzle.id,
    answer: puzzle.answer,
    category: puzzle.category,
    source: puzzle.source,
  }
  // Copie conditionnelle plutôt qu'une clé posée à `undefined` : c'est le prix
  // d'un champ optionnel, et une clé fantôme se retrouverait dans les
  // comparaisons d'objets des tests (`toEqual` distingue `{ x: undefined }` de `{}`).
  return puzzle.bonusAnswer === undefined ? base : { ...base, bonusAnswer: puzzle.bonusAnswer }
}

function seatOf(index: number, count: number): number {
  if (count <= 0) return 0
  return ((Math.trunc(index) % count) + count) % count
}

/** Sièges à examiner, dans l'ordre, en partant de `start`. */
function rotation(start: number, count: number): readonly number[] {
  if (count <= 0) return []
  return Array.from({ length: count }, (_, step) => seatOf(start + step, count))
}

function withPot(players: readonly Player[], seat: number, pot: number): readonly Player[] {
  return players.map((player, index) => (index === seat ? { ...player, pot } : player))
}

/**
 * Donne la main au premier siège de `seats`, et passe la manche en `blocked`
 * quand tout le monde a décliné à la suite.
 *
 * **Frontière `blocked` / `round-over{void}`** : `blocked` est une phase de la
 * manche en cours, pas une fin de manche. La manche ne devient `void` qu'au
 * `round/next` suivant. C'est ce qui laisse l'interface afficher « personne ne
 * peut plus jouer » avec la solution, avant d'enchaîner — et ça garde une action
 * légale (`round/next`) en toute circonstance, donc aucun interblocage possible.
 *
 * Le critère est le compteur de passes et non un croisement de prédicats :
 * proposer la réponse est toujours légal, donc « ce joueur ne peut rien faire »
 * n'existe plus. Ce qui reste observable, c'est que chacun a renoncé à son tour.
 */
function settle(game: Game, round: RoundState, seats: readonly number[]): GameState {
  const seat = seats[0] ?? 0
  if (round.passes >= game.players.length) {
    return playing({
      ...game,
      progress: { kind: 'round', currentPlayer: seat, round: { ...round, phase: { kind: 'blocked' } } },
    })
  }
  return playing({
    ...game,
    progress: { kind: 'round', currentPlayer: seat, round: { ...round, phase: AWAITING } },
  })
}

/** Le `pot` du gagnant doit déjà être crédité : c'est lui qui fixe le gain. */
function finishRound(
  game: Game,
  round: RoundState,
  seat: number,
  how: 'last-letter' | 'resolve',
): GameState {
  const winner = game.players[seat]
  if (winner === undefined) return playing(game)

  const amount = Math.max(winner.pot, game.config.minRoundPrize)
  const players = game.players.map((player, index) =>
    index === seat ? { ...player, total: player.total + amount } : player,
  )
  const summary: RoundSummary = {
    index: round.index,
    puzzle: round.puzzle,
    outcome: { kind: 'solved', by: winner.id, amount, how },
  }
  return playing({ ...game, players, progress: { kind: 'round-over', summary } })
}

/** Tableau : l'égalité est fréquente contre des bots. */
function winnersOf(players: readonly Player[]): readonly PlayerId[] {
  const best = players.reduce((max, player) => Math.max(max, player.total), Number.NEGATIVE_INFINITY)
  return players.filter((player) => player.total === best).map((player) => player.id)
}

interface Turn {
  readonly game: Game
  readonly round: RoundState
  readonly seat: number
  readonly player: Player
}

/**
 * Résout une action de joueur, ou `null` si elle ne vient pas du joueur courant.
 * C'est la parade au double effet de StrictMode et aux minuteries de bot
 * devenues obsolètes.
 */
function turnOf(state: GameState, by: PlayerId): Turn | null {
  if (state.kind !== 'playing') return null
  const game = state.game
  if (game.progress.kind !== 'round') return null

  const seat = game.progress.currentPlayer
  const player = game.players[seat]
  if (player === undefined || player.id !== by) return null
  return { game, round: game.progress.round, seat, player }
}

interface Bonus {
  readonly game: Game
  readonly bonus: BonusState
  readonly player: Player
}

/** Pendant de `turnOf` pour l'étape bonus : `null` hors de cette étape, ou si son joueur a disparu. */
function bonusOf(state: GameState): Bonus | null {
  if (state.kind !== 'playing') return null
  const game = state.game
  if (game.progress.kind !== 'bonus') return null

  const bonus = game.progress.bonus
  const player = game.players.find((candidate) => candidate.id === bonus.by)
  if (player === undefined) return null
  return { game, bonus, player }
}

/**
 * Construction partagée des trois sorties de l'étape bonus vers `game-over`.
 * `winnersOf` n'est calculé **qu'ici**, jamais dans `round/next` en entrant en
 * bonus : c'est ce qui permet au verdict de créer ou de casser une égalité
 * entre les totaux figés à la fin de la dernière manche.
 */
function finishBonus(
  game: Game,
  players: readonly Player[],
  bonus: BonusState,
  outcome: BonusResult['outcome'],
): GameState {
  const result: BonusResult = { question: bonus.question, expected: bonus.expected, by: bonus.by, outcome }
  return playing({
    ...game,
    players,
    progress: { kind: 'game-over', winners: winnersOf(players), bonus: result },
  })
}

export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'game/start': {
      const puzzle = snapshotPuzzle(action.puzzle)
      return playing({
        config: action.config,
        players: action.players,
        history: [],
        playedPuzzleIds: [puzzle.id],
        wheelAngle: INITIAL_WHEEL_ANGLE,
        progress: {
          kind: 'round',
          currentPlayer: seatOf(action.firstPlayer, action.players.length),
          round: { index: 0, puzzle, guessed: [], phase: AWAITING, passes: 0 },
        },
      })
    }

    case 'wheel/spin': {
      const turn = turnOf(state, action.by)
      if (turn === null || !canSpin(turn.game)) return state

      // La case n'est plus choisie par l'appelant : elle est déduite de l'angle
      // de repos précédent et du lancer reçu. `wheelAngle` avance dès ce lancer,
      // pas au règlement (`wheel/settled`) — l'issue est déjà tranchée ici, et
      // `toPersisted` s'appuie sur ce fait pour régler une phase `spinning`
      // avant d'écrire l'état sur le disque.
      const spin = resolveThrow(turn.game.wheelAngle, action.thrown)
      // Un index hors bornes est une action malformée : on l'ignore plutôt que
      // de faire lever le reducer, qui casserait le rendu.
      const segment = WHEEL[spin.index]
      if (segment === undefined) return state

      return playing({
        ...turn.game,
        wheelAngle: spin.angle,
        progress: {
          kind: 'round',
          currentPlayer: turn.seat,
          round: { ...turn.round, phase: { kind: 'spinning', segment, spin } },
        },
      })
    }

    case 'wheel/settled': {
      const turn = turnOf(state, action.by)
      if (turn === null) return state
      const phase = turn.round.phase
      // Un `spinId` périmé vient d'une animation précédente : sans cette garde,
      // deux tirages rapprochés appliqueraient deux fois le même segment.
      if (phase.kind !== 'spinning' || phase.spin.spinId !== action.spinId) return state

      const count = turn.game.players.length
      switch (phase.segment.kind) {
        case 'bankrupt':
          return settle(
            { ...turn.game, players: withPot(turn.game.players, turn.seat, 0) },
            { ...turn.round, passes: 0 },
            rotation(turn.seat + 1, count),
          )
        case 'pass':
          return settle(turn.game, { ...turn.round, passes: 0 }, rotation(turn.seat + 1, count))
        case 'cash':
          return playing({
            ...turn.game,
            progress: {
              kind: 'round',
              currentPlayer: turn.seat,
              round: {
                ...turn.round,
                phase: {
                  kind: 'awaiting-consonant',
                  value: phase.segment.value,
                  segment: phase.segment,
                },
              },
            },
          })
      }
    }

    case 'letter/consonant': {
      const turn = turnOf(state, action.by)
      if (turn === null) return state
      const phase = turn.round.phase
      if (phase.kind !== 'awaiting-consonant') return state
      if (!isConsonant(action.letter) || turn.round.guessed.includes(action.letter)) return state

      const revealed: RoundState = {
        ...turn.round,
        guessed: [...turn.round.guessed, action.letter],
        phase: AWAITING,
      }
      const count = turn.game.players.length
      const hits = countOccurrences(turn.round.puzzle.answer, action.letter)
      if (hits === 0) {
        return settle(turn.game, { ...revealed, passes: 0 }, rotation(turn.seat + 1, count))
      }

      const gain = phase.value * hits * multiplierFor(turn.round.index)
      const game: Game = {
        ...turn.game,
        players: withPot(turn.game.players, turn.seat, turn.player.pot + gain),
      }
      // Résolution testée dans la même transition : la manche ne repasse pas par
      // `awaiting-action` quand la dernière lettre vient d'être révélée.
      if (isSolved(revealed)) return finishRound(game, revealed, turn.seat, 'last-letter')
      return settle(game, { ...revealed, passes: 0 }, rotation(turn.seat, count))
    }

    case 'letter/buy-vowel': {
      const turn = turnOf(state, action.by)
      if (turn === null || !canBuyVowel(turn.game)) return state
      if (!isVowel(action.letter) || turn.round.guessed.includes(action.letter)) return state

      const revealed: RoundState = {
        ...turn.round,
        guessed: [...turn.round.guessed, action.letter],
        phase: AWAITING,
      }
      // Transition atomique : la voyelle est débitée qu'elle soit présente ou non.
      const game: Game = {
        ...turn.game,
        players: withPot(
          turn.game.players,
          turn.seat,
          turn.player.pot - turn.game.config.vowelCost,
        ),
      }
      if (isSolved(revealed)) return finishRound(game, revealed, turn.seat, 'last-letter')

      const count = turn.game.players.length
      const hits = countOccurrences(turn.round.puzzle.answer, action.letter)
      const seats = hits > 0 ? rotation(turn.seat, count) : rotation(turn.seat + 1, count)
      return settle(game, { ...revealed, passes: 0 }, seats)
    }

    case 'turn/pass': {
      const turn = turnOf(state, action.by)
      if (turn === null || !isStuck(turn.game)) return state
      return settle(
        turn.game,
        { ...turn.round, passes: turn.round.passes + 1 },
        rotation(turn.seat + 1, turn.game.players.length),
      )
    }

    case 'resolve/attempt': {
      const turn = turnOf(state, action.by)
      if (turn === null || !canResolve(turn.game)) return state
      if (matchesAnswer(action.attempt, turn.round.puzzle.answer)) {
        return finishRound(turn.game, turn.round, turn.seat, 'resolve')
      }
      // Réponse fausse : la main passe, la cagnotte est conservée, `passes`
      // repart de zéro — une tentative n'est pas un renoncement.
      return settle(
        turn.game,
        { ...turn.round, passes: 0 },
        rotation(turn.seat + 1, turn.game.players.length),
      )
    }

    case 'round/next': {
      if (state.kind !== 'playing') return state
      const game = state.game
      const progress = game.progress

      let summary: RoundSummary
      if (progress.kind === 'round-over') {
        summary = progress.summary
      } else if (progress.kind === 'round' && progress.round.phase.kind === 'blocked') {
        summary = {
          index: progress.round.index,
          puzzle: progress.round.puzzle,
          outcome: { kind: 'void', reason: 'blocked' },
        }
      } else {
        return state
      }

      const history = [...game.history, summary]
      // Les cagnottes repartent à zéro, les banques sont acquises.
      const players = game.players.map((player) => ({ ...player, pot: 0 }))

      // `isFinalRound` plutôt que `summary.index + 1 >= game.config.roundCount` :
      // strictement équivalent (`index >= roundCount - 1`), mais met le reducer
      // et le tirage d'énigme de `GameProvider` sur la même définition de
      // « manche finale ».
      if (isFinalRound(summary.index, game.config.roundCount)) {
        const expected = summary.puzzle.bonusAnswer
        // `isQuestion` revérifie qu'`expected` ne se plie pas sur la chaîne vide
        // (« ??? ») ; `expected !== undefined` reste la garde qui resserre le
        // type à `string` pour la construction de `BonusState` ci-dessous.
        if (
          game.config.bonusEnabled &&
          summary.outcome.kind === 'solved' &&
          isQuestion(summary.puzzle) &&
          expected !== undefined
        ) {
          // `winnersOf` n'est volontairement pas calculé ici : voir `finishBonus`.
          return playing({
            ...game,
            players,
            history,
            progress: {
              kind: 'bonus',
              bonus: {
                by: summary.outcome.by,
                question: snapshotPuzzle(summary.puzzle),
                expected,
                phase: { kind: 'awaiting-answer' },
              },
            },
          })
        }
        return playing({
          ...game,
          players,
          history,
          progress: { kind: 'game-over', winners: winnersOf(players), bonus: null },
        })
      }

      const puzzle = snapshotPuzzle(action.puzzle)
      return playing({
        ...game,
        players,
        history,
        playedPuzzleIds: [...game.playedPuzzleIds, puzzle.id],
        progress: {
          kind: 'round',
          currentPlayer: seatOf(action.firstPlayer, players.length),
          round: { index: summary.index + 1, puzzle, guessed: [], phase: AWAITING, passes: 0 },
        },
      })
    }

    case 'bonus/answer': {
      const context = bonusOf(state)
      if (context === null) return state
      if (action.by !== context.bonus.by) return state
      if (context.bonus.phase.kind !== 'awaiting-answer') return state
      if (action.attempt.trim() === '') return state
      return playing({
        ...context.game,
        progress: {
          kind: 'bonus',
          bonus: {
            ...context.bonus,
            phase: { kind: 'judging', attempt: action.attempt, requestId: action.requestId },
          },
        },
      })
    }

    case 'bonus/verdict': {
      const context = bonusOf(state)
      if (context === null) return state
      const phase = context.bonus.phase
      // Un `requestId` périmé vient d'une tentative précédente (le joueur a
      // retapé après un `bonus/failed`) : sans cette garde, un verdict qui
      // arriverait en retard trancherait la partie sur une réponse abandonnée.
      if (phase.kind !== 'judging' || phase.requestId !== action.requestId) return state

      if (!action.correct) {
        return finishBonus(context.game, context.game.players, context.bonus, { kind: 'lost' })
      }
      // Forfait, jamais multiplié par `multiplierFor` : ce n'est pas un gain de manche.
      const amount = context.game.config.bonusPrize
      const players = context.game.players.map((player) =>
        player.id === context.bonus.by ? { ...player, total: player.total + amount } : player,
      )
      return finishBonus(context.game, players, context.bonus, { kind: 'won', amount })
    }

    case 'bonus/failed': {
      const context = bonusOf(state)
      if (context === null) return state
      const phase = context.bonus.phase
      if (phase.kind !== 'judging' || phase.requestId !== action.requestId) return state
      // Aucune pénalité, aucun crédit, la partie ne se termine pas : un juge
      // injoignable n'est pas une mauvaise réponse, le joueur retape.
      return playing({
        ...context.game,
        progress: {
          kind: 'bonus',
          bonus: { ...context.bonus, phase: { kind: 'awaiting-answer' } },
        },
      })
    }

    case 'bonus/skip': {
      const context = bonusOf(state)
      if (context === null) return state
      if (action.by !== context.bonus.by) return state
      // Légale dans les deux phases : c'est l'invariant de terminaison qui
      // garantit qu'un juge cassé n'empêche jamais la partie de finir.
      return finishBonus(context.game, context.game.players, context.bonus, { kind: 'skipped' })
    }

    case 'config/set-bonus-enabled': {
      if (state.kind !== 'playing') return state
      if (state.game.config.bonusEnabled === action.enabled) return state
      // La phase n'est pas recalculée : une étape bonus déjà ouverte le reste
      // (le juge a pu disparaître entre-temps — c'est `bonus/skip` et
      // `bonus/failed` qui traitent ce cas, pas cette action).
      return playing({
        ...state.game,
        config: { ...state.game.config, bonusEnabled: action.enabled },
      })
    }
  }
}
