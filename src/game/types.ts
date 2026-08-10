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
  /**
   * Réponse attendue quand l'énoncé est une question. Absent pour une énigme
   * ordinaire. Porté par le `Puzzle` : il voyage alors gratuitement avec chaque
   * copie par valeur jusqu'au résumé de manche et à l'étape bonus. Optionnel et
   * non obligatoire à dessein : `grep "source: '"` donne dix-huit sites de
   * construction, dont quatorze dans des tests répartis sur toutes les zones du
   * dépôt — un champ obligatoire les casserait tous et rendrait le travail en
   * parallèle impossible.
   */
  readonly bonusAnswer?: string
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

/**
 * Ce qu'un lanceur décide : une distance à parcourir, pas un résultat.
 * L'aléa (la petite imprécision de ±1 case) est déjà inclus dans `travel`.
 */
export interface WheelThrow {
  readonly spinId: number
  readonly travel: number // degrés parcourus, toujours ≥ MIN_TRAVEL_DEGREES − JITTER_DEGREES
  readonly durationMs: number
}

/** Ce que le reducer déduit d'un lancer, à partir de l'angle où la roue était au repos. */
export interface SpinLanding extends SpinOutcome {
  readonly travel: number // corrigé par l'écart aux bords, à animer tel quel
  readonly durationMs: number
  readonly angle: number // angle de repos après le lancer, dans [0, 360)
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
  /**
   * Montant fixe de la question bonus de la manche finale. Jamais multiplié
   * par `multiplierFor` : c'est un forfait, pas un gain de manche.
   */
  readonly bonusPrize: number
  /**
   * Vrai si et seulement si un juge est disponible (une clé d'API Mistral est
   * configurée). Le reducer ne sait rien d'une clé d'API : c'est ce booléen,
   * décidé en amont, qui applique la règle « sans clé, pas d'étape bonus du
   * tout » sans jamais faire entrer la clé elle-même dans l'état de jeu.
   */
  readonly bonusEnabled: boolean
}

export type Phase =
  | { readonly kind: 'awaiting-action' }
  | { readonly kind: 'spinning'; readonly segment: Segment; readonly spin: SpinOutcome }
  | { readonly kind: 'awaiting-consonant'; readonly value: number; readonly segment: Segment }
  | { readonly kind: 'blocked' }

export interface RoundState {
  /** 0-based : le multiplicateur de gains en dérive. */
  readonly index: number
  /** Instantané par valeur, jamais une référence : l'éditeur d'énigmes ne doit rien pouvoir casser. */
  readonly puzzle: Puzzle
  readonly guessed: readonly Letter[]
  readonly phase: Phase
  /**
   * Passes consécutives depuis la dernière action qui a fait avancer la manche.
   * Atteint le nombre de joueurs → manche bloquée.
   *
   * Explicite plutôt qu'émergent : depuis que proposer la réponse est toujours
   * légal, aucun croisement de prédicats ne peut plus décider qu'une manche est
   * ingagnable. Passer, c'est décliner ; chaque joueur a eu son tour.
   */
  readonly passes: number
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

/**
 * Phase de l'étape bonus. `judging` porte `attempt` et `requestId` : le
 * verdict (`bonus/verdict` ou `bonus/failed`) doit pouvoir être rapproché de
 * la tentative qui l'a déclenché, et rejeter un verdict périmé (une réponse
 * déjà retapée entre-temps) sans que le reducer connaisse le transport du juge.
 */
export type BonusPhase =
  | { readonly kind: 'awaiting-answer' }
  | { readonly kind: 'judging'; readonly attempt: string; readonly requestId: string }

export interface BonusState {
  /** Le gagnant de la manche finale, et lui seul : c'est lui qui a la main. */
  readonly by: PlayerId
  readonly question: Puzzle
  /**
   * Dénormalisée hors de `question.bonusAnswer` : l'entrée dans l'étape a déjà
   * prouvé qu'elle existe. Même motif que la phase `awaiting-consonant`, qui
   * porte `value` **et** `segment`.
   */
  readonly expected: string
  readonly phase: BonusPhase
}

export interface BonusResult {
  readonly question: Puzzle
  readonly expected: string
  readonly by: PlayerId
  readonly outcome:
    | { readonly kind: 'won'; readonly amount: number }
    | { readonly kind: 'lost' }
    | { readonly kind: 'skipped' }
}

/** « À qui le tour » n'existe que pendant une manche. */
export type GameProgress =
  | { readonly kind: 'round'; readonly currentPlayer: number; readonly round: RoundState }
  | { readonly kind: 'round-over'; readonly summary: RoundSummary }
  | { readonly kind: 'bonus'; readonly bonus: BonusState }
  | {
      readonly kind: 'game-over'
      readonly winners: readonly PlayerId[]
      /** `null` : partie finie sans étape bonus (juge indisponible, ou dernière manche pas une question). */
      readonly bonus: BonusResult | null
    }

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
