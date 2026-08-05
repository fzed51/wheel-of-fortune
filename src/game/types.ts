declare const brand: unique symbol
type Brand<T, B extends string> = T & { readonly [brand]: B }

export type PlayerId = Brand<string, 'PlayerId'>
export type PuzzleId = Brand<string, 'PuzzleId'>

export const asPlayerId = (value: string): PlayerId => value as PlayerId
export const asPuzzleId = (value: string): PuzzleId => value as PuzzleId

export type Vowel = 'A' | 'E' | 'I' | 'O' | 'U'

/** Le Y est une consonne : dans la version française, les voyelles achetables sont A E I O U. */
export type Consonant =
  | 'B' | 'C' | 'D' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L' | 'M'
  | 'N' | 'P' | 'Q' | 'R' | 'S' | 'T' | 'V' | 'W' | 'X' | 'Y' | 'Z'

export type Letter = Vowel | Consonant

export interface Puzzle {
  readonly id: PuzzleId
  /** Texte affiché : majuscules accentuées, ponctuation incluse. */
  readonly answer: string
  readonly category: string
  readonly source: 'pack' | 'custom'
}

export type Segment =
  | { readonly kind: 'cash'; readonly index: number; readonly value: number }
  | { readonly kind: 'bankrupt'; readonly index: number }
  | { readonly kind: 'pass'; readonly index: number }

/**
 * Résultat d'un tirage, décidé par l'appelant à partir du générateur injecté.
 * L'animation de la roue ne tire rien : elle exécute un résultat déjà connu.
 */
export interface SpinOutcome {
  /** Index du segment dans WHEEL. */
  readonly index: number
  /** Décalage intra-segment, en degrés, pour que la roue ne s'arrête pas toujours au centre. */
  readonly offset: number
  /** Identifiant monotone : rejoue l'animation même sur deux tirages successifs du même segment. */
  readonly spinId: number
}

export type PlayerKind =
  | { readonly type: 'human' }
  | { readonly type: 'bot'; readonly level: 'easy' | 'normal' }

export interface Player {
  readonly id: PlayerId
  readonly name: string
  readonly kind: PlayerKind
  /** Banque : ne décroît jamais. */
  readonly total: number
  /** Cagnotte de la manche en cours : remise à zéro à chaque manche et sur banqueroute. */
  readonly pot: number
}

/** Fige les règles chiffrées, ce qui rend le reducer testable sans mock. */
export interface GameConfig {
  readonly roundCount: number
  readonly vowelCost: number
  /** Évite qu'une manche gagnée par des voyelles payées ne rapporte rien. */
  readonly minRoundPrize: number
  /** Vrai si et seulement si un juge LLM est disponible. Le reducer ignore tout du juge. */
  readonly resolveEnabled: boolean
}

export type Phase =
  | { readonly kind: 'awaiting-action' }
  | { readonly kind: 'spinning'; readonly segment: Segment; readonly spin: SpinOutcome }
  | { readonly kind: 'awaiting-consonant'; readonly value: number; readonly segment: Segment }
  | { readonly kind: 'resolving'; readonly attempt: string; readonly requestId: string }
  | { readonly kind: 'blocked' }

export interface RoundState {
  /** 0-based : le multiplicateur de gains en dérive. */
  readonly index: number
  /** Instantané par valeur, jamais une référence : l'éditeur d'énigmes ne doit rien pouvoir casser. */
  readonly puzzle: Puzzle
  readonly guessed: readonly Letter[]
  readonly phase: Phase
}

export interface RoundSummary {
  readonly index: number
  readonly puzzle: Puzzle
  readonly outcome:
    | {
        readonly kind: 'solved'
        readonly by: PlayerId
        readonly amount: number
        readonly how: 'last-letter' | 'resolve'
      }
    | { readonly kind: 'void'; readonly reason: 'blocked' }
}

/** « À qui le tour » n'existe que pendant une manche. */
export type GameProgress =
  | { readonly kind: 'round'; readonly currentPlayer: number; readonly round: RoundState }
  | { readonly kind: 'round-over'; readonly summary: RoundSummary }
  | { readonly kind: 'game-over'; readonly winners: readonly PlayerId[] }

export interface Game {
  readonly config: GameConfig
  /** L'ordre du tableau est l'ordre de passage. */
  readonly players: readonly Player[]
  readonly history: readonly RoundSummary[]
  readonly playedPuzzleIds: readonly PuzzleId[]
  readonly progress: GameProgress
}

export type GameState =
  | { readonly kind: 'no-game' }
  | { readonly kind: 'playing'; readonly game: Game }
