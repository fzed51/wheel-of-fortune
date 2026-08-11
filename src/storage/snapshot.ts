import { reduce } from '../game/engine'
import { INITIAL_WHEEL_ANGLE } from '../game/setup'
import type {
  BonusResult,
  BonusState,
  Game,
  GameConfig,
  GameProgress,
  Letter,
  Player,
  PlayerId,
  Puzzle,
  PuzzleId,
  RoundSummary,
  Segment,
} from '../game/types'

/**
 * Frontière entre ce qui mérite d'être écrit et ce qui ne doit jamais l'être.
 *
 * **Jamais persisté** : angle de rotation (`Game.wheelAngle`), `spinId`, texte en
 * cours de frappe, toast, minuterie, état du générateur aléatoire. Tout cela n'a
 * de sens que dans l'onglet qui l'a produit ; le relire ferait rejouer une animation.
 */
export type PersistedPhase =
  | { readonly kind: 'awaiting-action' }
  | { readonly kind: 'awaiting-consonant'; readonly value: number; readonly segment: Segment }
  | { readonly kind: 'blocked' }

export interface PersistedRound {
  readonly index: number
  readonly puzzle: Puzzle
  readonly guessed: readonly Letter[]
  readonly phase: PersistedPhase
  /**
   * Compteur de règle, pas un état éphémère : sans lui, un rechargement en
   * cours de tour de table redonnerait un tour gratuit à chaque joueur déjà
   * passé, et une manche pourrait ne plus jamais se bloquer.
   */
  readonly passes: number
}

/**
 * Forme persistée de l'étape bonus, **sans `phase`** : un verdict en vol (le
 * juge d'IA en train de répondre) ne survit pas au rechargement, exactement
 * comme l'ancienne phase `resolving` avant que « Résoudre » ne devienne
 * synchrone. Un rechargement pendant l'appel réseau ne doit **rien coûter**
 * au joueur : `fromPersisted` reconstruit toujours `{ kind: 'awaiting-answer' }`,
 * il retape sa réponse, la question bonus reste entière à gagner.
 */
export interface PersistedBonus {
  readonly by: PlayerId
  readonly question: Puzzle
  readonly expected: string
}

/**
 * Alias plutôt que type distinct : `BonusResult` ne porte aucun champ
 * éphémère (ni `phase`, ni `requestId`, ni `attempt` — le verdict est déjà
 * tranché quand ce type existe). Le dupliquer créerait deux formes à faire
 * évoluer ensemble pour rien.
 */
export type PersistedBonusResult = BonusResult

export type PersistedProgress =
  | { readonly kind: 'round'; readonly currentPlayer: number; readonly round: PersistedRound }
  | { readonly kind: 'round-over'; readonly summary: RoundSummary }
  | { readonly kind: 'bonus'; readonly bonus: PersistedBonus }
  | {
      readonly kind: 'game-over'
      readonly winners: readonly PlayerId[]
      /** `null` : partie finie sans étape bonus. */
      readonly bonus: PersistedBonusResult | null
    }

export interface PersistedGame {
  readonly config: GameConfig
  readonly players: readonly Player[]
  readonly history: readonly RoundSummary[]
  readonly playedPuzzleIds: readonly PuzzleId[]
  readonly progress: PersistedProgress
}

/**
 * Copies par valeur : rien de ce qui sort d'un `JSON.parse` ne doit rester partagé.
 *
 * Copie conditionnelle de `bonusAnswer`, comme dans `snapshotPuzzle` côté moteur :
 * poser la clé à `undefined` la ferait apparaître dans l'objet (`toEqual` distingue
 * `{ x: undefined }` de `{}`), et un champ oublié ici ferait disparaître la réponse
 * attendue de la manche finale au premier rechargement, sans le moindre message d'erreur.
 */
function copyPuzzle(puzzle: Puzzle): Puzzle {
  const base = {
    id: puzzle.id,
    answer: puzzle.answer,
    category: puzzle.category,
    source: puzzle.source,
  }
  return puzzle.bonusAnswer === undefined ? base : { ...base, bonusAnswer: puzzle.bonusAnswer }
}

function copyPlayer(player: Player): Player {
  return {
    id: player.id,
    name: player.name,
    kind:
      player.kind.type === 'bot' ? { type: 'bot', level: player.kind.level } : { type: 'human' },
    total: player.total,
    pot: player.pot,
  }
}

function copySummary(summary: RoundSummary): RoundSummary {
  return {
    index: summary.index,
    puzzle: copyPuzzle(summary.puzzle),
    outcome:
      summary.outcome.kind === 'solved'
        ? {
            kind: 'solved',
            by: summary.outcome.by,
            amount: summary.outcome.amount,
            how: summary.outcome.how,
          }
        : { kind: 'void', reason: summary.outcome.reason },
  }
}

function copySegment(segment: Segment): Segment {
  if (segment.kind === 'cash') return { kind: 'cash', index: segment.index, value: segment.value }
  if (segment.kind === 'bankrupt') return { kind: 'bankrupt', index: segment.index }
  return { kind: 'pass', index: segment.index }
}

function copyPhase(phase: PersistedPhase): PersistedPhase {
  if (phase.kind === 'awaiting-consonant') {
    return { kind: 'awaiting-consonant', value: phase.value, segment: copySegment(phase.segment) }
  }
  return { kind: phase.kind }
}

/** Ne recopie que `by`, `question` et `expected` : `phase` s'arrête ici, elle n'est jamais persistée. */
function copyBonus(bonus: BonusState): PersistedBonus {
  return { by: bonus.by, question: copyPuzzle(bonus.question), expected: bonus.expected }
}

function copyBonusOutcome(outcome: BonusResult['outcome']): BonusResult['outcome'] {
  return outcome.kind === 'won' ? { kind: 'won', amount: outcome.amount } : { kind: outcome.kind }
}

function copyBonusResult(result: BonusResult): BonusResult {
  return {
    question: copyPuzzle(result.question),
    expected: result.expected,
    by: result.by,
    outcome: copyBonusOutcome(result.outcome),
  }
}

function shell(game: Game, progress: PersistedProgress): PersistedGame {
  return {
    config: { ...game.config },
    players: game.players.map(copyPlayer),
    history: game.history.map(copySummary),
    playedPuzzleIds: [...game.playedPuzzleIds],
    progress,
  }
}

/**
 * Réduit une partie à ce qui doit survivre à un rechargement.
 *
 * Une seule phase n'a pas d'équivalent persistable : `spinning`. Le tirage
 * **a eu lieu**, et « Résoudre » est un verdict synchrone du reducer, qui ne
 * laisse jamais la manche dans un état intermédiaire à sauvegarder — il ne
 * reste donc que le tirage à traiter. L'escamoter rendrait au joueur un tour
 * gratuit après une banqueroute, donc l'issue est appliquée avant écriture —
 * en repassant par le reducer, pour qu'il n'existe qu'un seul code qui sache
 * ce qu'un segment fait.
 */
export function toPersisted(game: Game): PersistedGame {
  const progress = game.progress
  // Traitée avant le filtre générique ci-dessous : `BonusState` porte `phase`,
  // que `shell` ne doit jamais écrire telle quelle (elle contiendrait `attempt`
  // et `requestId` en cours de jugement).
  if (progress.kind === 'bonus') {
    return shell(game, { kind: 'bonus', bonus: copyBonus(progress.bonus) })
  }
  if (progress.kind !== 'round') return shell(game, progress)

  const round = progress.round
  const phase = round.phase

  if (phase.kind === 'spinning') {
    const player = game.players[progress.currentPlayer]
    const settled =
      player === undefined
        ? null
        : reduce(
            { kind: 'playing', game },
            { type: 'wheel/settled', by: player.id, spinId: phase.spin.spinId },
          )
    // `wheel/settled` ne produit jamais de `spinning` : la récursion s'arrête au
    // premier tour. La comparaison de référence couvre le cas d'une action
    // refusée, qui sinon bouclerait — le reducer renvoie alors le même état.
    if (settled !== null && settled.kind === 'playing' && settled.game !== game) {
      return toPersisted(settled.game)
    }
    return shell(game, {
      kind: 'round',
      currentPlayer: progress.currentPlayer,
      round: {
        index: round.index,
        puzzle: copyPuzzle(round.puzzle),
        guessed: [...round.guessed],
        phase: { kind: 'awaiting-action' },
        passes: round.passes,
      },
    })
  }

  return shell(game, {
    kind: 'round',
    currentPlayer: progress.currentPlayer,
    round: {
      index: round.index,
      puzzle: copyPuzzle(round.puzzle),
      guessed: [...round.guessed],
      phase: copyPhase(phase),
      passes: round.passes,
    },
  })
}

/** Un `switch` exhaustif plutôt qu'une chaîne de ternaires : la 4ᵉ forme l'aurait rendue illisible. */
function reviveProgress(progress: PersistedProgress): GameProgress {
  switch (progress.kind) {
    case 'round':
      return {
        kind: 'round',
        currentPlayer: progress.currentPlayer,
        round: {
          index: progress.round.index,
          puzzle: copyPuzzle(progress.round.puzzle),
          guessed: [...progress.round.guessed],
          phase: copyPhase(progress.round.phase),
          passes: progress.round.passes,
        },
      }
    case 'round-over':
      return { kind: 'round-over', summary: copySummary(progress.summary) }
    case 'bonus':
      // La phase relue est toujours `awaiting-answer` : voir le docblock de `PersistedBonus`.
      return {
        kind: 'bonus',
        bonus: {
          by: progress.bonus.by,
          question: copyPuzzle(progress.bonus.question),
          expected: progress.bonus.expected,
          phase: { kind: 'awaiting-answer' },
        },
      }
    case 'game-over':
      return {
        kind: 'game-over',
        winners: [...progress.winners],
        bonus: progress.bonus === null ? null : copyBonusResult(progress.bonus),
      }
  }
}

/**
 * Élargit un enregistrement validé en partie jouable.
 *
 * Presque une identité — c'est voulu : toute la réduction se fait à l'écriture,
 * la lecture ne reconstruit rien qu'elle pourrait se tromper à reconstruire. Elle
 * recopie en revanche tout : l'objet reçu sort d'un `JSON.parse`, le garder
 * partagé laisserait une mutation extérieure atteindre l'état du jeu.
 */
export function fromPersisted(persisted: PersistedGame): Game {
  return {
    config: { ...persisted.config },
    players: persisted.players.map(copyPlayer),
    history: persisted.history.map(copySummary),
    playedPuzzleIds: [...persisted.playedPuzzleIds],
    progress: reviveProgress(persisted.progress),
    // Jamais écrit (voir le docblock plus haut) : il n'y a donc rien à relire, la
    // roue reprend toujours au repos de montage plutôt qu'à son dernier angle.
    wheelAngle: INITIAL_WHEEL_ANGLE,
  }
}
