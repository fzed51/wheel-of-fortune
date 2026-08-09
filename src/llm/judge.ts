/**
 * Verdict d'un juge, **typé et sans exception**.
 *
 * La distinction entre `verdict` et `error` est une règle de jeu, pas un détail
 * technique : une réponse fausse fait passer la main, un juge injoignable ne
 * doit rien coûter au joueur.
 */
/**
 * Cause d'un verdict indisponible. Nommée plutôt que laissée en union anonyme :
 * l'écran de jeu doit en afficher une phrase et les réglages une autre, et deux
 * unions recopiées finiraient par diverger d'un membre — celui-là même qu'on
 * oublierait alors de traduire.
 *
 * Ces quatre valeurs sont exactement celles de `JudgeFailureReason`, dans
 * `game/announce.ts` : le moteur ne pouvant pas importer `llm/`, la liste y est
 * recopiée, et les deux doivent rester identiques membre pour membre — sans quoi
 * le driver aurait à traduire l'une vers l'autre.
 */
export type JudgeErrorReason = 'network' | 'timeout' | 'bad-response' | 'unauthorized'

export type JudgeResult =
  | { readonly kind: 'verdict'; readonly correct: boolean; readonly reason?: string }
  | { readonly kind: 'error'; readonly reason: JudgeErrorReason }

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
