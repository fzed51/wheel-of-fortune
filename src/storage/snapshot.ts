import { reduce } from '../game/engine'
import type {
  Game,
  GameConfig,
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
 * **Jamais persisté** : angle de rotation, `spinId`, texte en cours de frappe,
 * toast, minuterie, état du générateur aléatoire. Tout cela n'a de sens que
 * dans l'onglet qui l'a produit ; le relire ferait rejouer une animation.
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

export type PersistedProgress =
  | { readonly kind: 'round'; readonly currentPlayer: number; readonly round: PersistedRound }
  | { readonly kind: 'round-over'; readonly summary: RoundSummary }
  | { readonly kind: 'game-over'; readonly winners: readonly PlayerId[] }

export interface PersistedGame {
  readonly config: GameConfig
  readonly players: readonly Player[]
  readonly history: readonly RoundSummary[]
  readonly playedPuzzleIds: readonly PuzzleId[]
  readonly progress: PersistedProgress
}

/** Copies par valeur : rien de ce qui sort d'un `JSON.parse` ne doit rester partagé. */
function copyPuzzle(puzzle: Puzzle): Puzzle {
  return {
    id: puzzle.id,
    answer: puzzle.answer,
    category: puzzle.category,
    source: puzzle.source,
  }
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

/**
 * Élargit un enregistrement validé en partie jouable.
 *
 * Presque une identité — c'est voulu : toute la réduction se fait à l'écriture,
 * la lecture ne reconstruit rien qu'elle pourrait se tromper à reconstruire. Elle
 * recopie en revanche tout : l'objet reçu sort d'un `JSON.parse`, le garder
 * partagé laisserait une mutation extérieure atteindre l'état du jeu.
 */
export function fromPersisted(persisted: PersistedGame): Game {
  const progress = persisted.progress
  return {
    config: { ...persisted.config },
    players: persisted.players.map(copyPlayer),
    history: persisted.history.map(copySummary),
    playedPuzzleIds: [...persisted.playedPuzzleIds],
    progress:
      progress.kind === 'round'
        ? {
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
        : progress.kind === 'round-over'
          ? { kind: 'round-over', summary: copySummary(progress.summary) }
          : { kind: 'game-over', winners: [...progress.winners] },
  }
}
