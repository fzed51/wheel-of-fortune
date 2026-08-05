import type { GameAction } from './actions'
import { countOccurrences, isConsonant, isSolved, isVowel } from './puzzle'
import { canBuyVowel, canPlayerAct, canResolve, canSpin, isStuck, multiplierFor } from './rules'
import type {
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
  return {
    id: puzzle.id,
    answer: puzzle.answer,
    category: puzzle.category,
    source: puzzle.source,
  }
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
 * Donne la main au premier siège de `seats` capable de jouer, et passe la manche
 * en `blocked` si aucun ne l'est.
 *
 * **Frontière `blocked` / `round-over{void}`** : `blocked` est une phase de la
 * manche en cours, pas une fin de manche. La manche ne devient `void` qu'au
 * `round/next` suivant. C'est ce qui laisse l'interface afficher « personne ne
 * peut plus jouer » avec la solution, avant d'enchaîner — et ça garde une action
 * légale (`round/next`) en toute circonstance, donc aucun interblocage possible.
 *
 * Conséquence assumée : quand la main doit passer mais qu'aucun autre joueur ne
 * peut agir, elle **revient** au joueur de départ s'il est le seul à pouvoir
 * jouer. Sans cette règle, une partie solo sans juge LLM se figerait dès le
 * premier « Passe ».
 */
function settle(game: Game, round: RoundState, seats: readonly number[]): GameState {
  const ready: RoundState = { ...round, phase: AWAITING }
  for (const seat of seats) {
    const player = game.players[seat]
    if (player !== undefined && canPlayerAct(game.config, ready, player)) {
      return playing({ ...game, progress: { kind: 'round', currentPlayer: seat, round: ready } })
    }
  }
  return playing({
    ...game,
    progress: {
      kind: 'round',
      currentPlayer: seats[0] ?? 0,
      round: { ...round, phase: { kind: 'blocked' } },
    },
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

export function reduce(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'game/start': {
      const puzzle = snapshotPuzzle(action.puzzle)
      return playing({
        config: action.config,
        players: action.players,
        history: [],
        playedPuzzleIds: [puzzle.id],
        progress: {
          kind: 'round',
          currentPlayer: seatOf(action.firstPlayer, action.players.length),
          round: { index: 0, puzzle, guessed: [], phase: AWAITING },
        },
      })
    }

    case 'wheel/spin': {
      const turn = turnOf(state, action.by)
      if (turn === null || !canSpin(turn.game)) return state

      // Un index hors bornes est une action malformée : on l'ignore plutôt que
      // de faire lever le reducer, qui casserait le rendu.
      const segment = WHEEL[action.spin.index]
      if (segment === undefined) return state

      return playing({
        ...turn.game,
        progress: {
          kind: 'round',
          currentPlayer: turn.seat,
          round: { ...turn.round, phase: { kind: 'spinning', segment, spin: action.spin } },
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
            turn.round,
            rotation(turn.seat + 1, count),
          )
        case 'pass':
          return settle(turn.game, turn.round, rotation(turn.seat + 1, count))
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
      if (hits === 0) return settle(turn.game, revealed, rotation(turn.seat + 1, count))

      const gain = phase.value * hits * multiplierFor(turn.round.index)
      const game: Game = {
        ...turn.game,
        players: withPot(turn.game.players, turn.seat, turn.player.pot + gain),
      }
      // Résolution testée dans la même transition : la manche ne repasse pas par
      // `awaiting-action` quand la dernière lettre vient d'être révélée.
      if (isSolved(revealed)) return finishRound(game, revealed, turn.seat, 'last-letter')
      return settle(game, revealed, rotation(turn.seat, count))
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
      return settle(game, revealed, seats)
    }

    case 'turn/pass': {
      const turn = turnOf(state, action.by)
      if (turn === null || !isStuck(turn.game)) return state
      return settle(turn.game, turn.round, rotation(turn.seat + 1, turn.game.players.length))
    }

    case 'resolve/start': {
      const turn = turnOf(state, action.by)
      if (turn === null || !canResolve(turn.game)) return state
      return playing({
        ...turn.game,
        progress: {
          kind: 'round',
          currentPlayer: turn.seat,
          round: {
            ...turn.round,
            phase: { kind: 'resolving', attempt: action.attempt, requestId: action.requestId },
          },
        },
      })
    }

    case 'resolve/verdict': {
      if (state.kind !== 'playing') return state
      const game = state.game
      if (game.progress.kind !== 'round') return state
      const round = game.progress.round
      if (round.phase.kind !== 'resolving' || round.phase.requestId !== action.requestId) {
        return state
      }

      const seat = game.progress.currentPlayer
      if (action.correct) return finishRound(game, round, seat, 'resolve')
      // Réponse fausse : la main passe, mais la cagnotte est conservée.
      return settle(game, round, rotation(seat + 1, game.players.length))
    }

    case 'resolve/failed': {
      if (state.kind !== 'playing') return state
      const game = state.game
      if (game.progress.kind !== 'round') return state
      const round = game.progress.round
      if (round.phase.kind !== 'resolving' || round.phase.requestId !== action.requestId) {
        return state
      }
      // Un juge injoignable n'est pas une mauvaise réponse : aucune pénalité.
      return settle(game, round, rotation(game.progress.currentPlayer, game.players.length))
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

      if (summary.index + 1 >= game.config.roundCount) {
        return playing({
          ...game,
          players,
          history,
          progress: { kind: 'game-over', winners: winnersOf(players) },
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
          round: { index: summary.index + 1, puzzle, guessed: [], phase: AWAITING },
        },
      })
    }

    case 'config/set-resolve-enabled': {
      if (state.kind !== 'playing') return state
      if (state.game.config.resolveEnabled === action.enabled) return state
      // La phase n'est pas recalculée : une manche déjà `blocked` le reste, seule
      // la manche suivante bénéficie du juge.
      return playing({
        ...state.game,
        config: { ...state.game.config, resolveEnabled: action.enabled },
      })
    }
  }
}
