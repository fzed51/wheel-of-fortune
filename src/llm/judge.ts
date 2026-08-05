/**
 * Verdict d'un juge, **typé et sans exception**.
 *
 * La distinction entre `verdict` et `error` est une règle de jeu, pas un détail
 * technique : une réponse fausse fait passer la main, un juge injoignable ne
 * doit rien coûter au joueur.
 */
export type JudgeResult =
  | { readonly kind: 'verdict'; readonly correct: boolean; readonly reason?: string }
  | {
      readonly kind: 'error'
      readonly reason: 'network' | 'timeout' | 'bad-response' | 'unauthorized'
    }

export interface JudgeInput {
  /** Ce que le joueur a tapé. Contenu non fiable. */
  readonly attempt: string
  /** La solution attendue. Contenu non fiable : l'éditeur d'énigmes est libre. */
  readonly answer: string
  readonly category: string
}

export interface Judge {
  judge(input: JudgeInput): Promise<JudgeResult>
}
