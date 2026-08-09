import type { Consonant, GameConfig, PlayerId, Player, Puzzle, SpinOutcome, Vowel } from './types'

/**
 * Toute action de joueur porte `by`. Le reducer rejette celles qui ne viennent
 * pas du joueur courant : c'est la parade au double effet de StrictMode et aux
 * minuteries de bot devenues obsolètes.
 *
 * L'aléa et les identifiants sont fournis par l'appelant, jamais tirés dans le
 * reducer, qui est double-invoqué en développement.
 */
export type GameAction =
  | {
      readonly type: 'game/start'
      readonly config: GameConfig
      readonly players: readonly Player[]
      readonly puzzle: Puzzle
      readonly firstPlayer: number
    }
  | { readonly type: 'wheel/spin'; readonly by: PlayerId; readonly spin: SpinOutcome }
  | { readonly type: 'wheel/settled'; readonly by: PlayerId; readonly spinId: number }
  | { readonly type: 'letter/consonant'; readonly by: PlayerId; readonly letter: Consonant }
  | { readonly type: 'letter/buy-vowel'; readonly by: PlayerId; readonly letter: Vowel }
  | { readonly type: 'turn/pass'; readonly by: PlayerId }
  | { readonly type: 'resolve/attempt'; readonly by: PlayerId; readonly attempt: string }
  | { readonly type: 'round/next'; readonly puzzle: Puzzle; readonly firstPlayer: number }
