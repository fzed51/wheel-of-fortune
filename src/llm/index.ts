import { createMistralJudge } from './mistral'
import type { Judge } from './judge'

export type { Judge, JudgeErrorReason, JudgeInput, JudgeResult } from './judge'
export { createMistralJudge, testMistralKey } from './mistral'
export type { KeyTestResult, MistralOptions } from './mistral'

/**
 * Fabrique du juge effectivement utilisé par la partie.
 *
 * Sans clé, il n'y a **aucun repli local** : `null` est ce qui garde le
 * bouton « Résoudre » inactif, pour le joueur comme pour les bots. Un faux
 * juge maison inventerait des verdicts sans le modèle qui les justifie —
 * inacceptable pour un jeu dont l'issue dépend de ce verdict.
 */
export function createJudge(opts: {
  readonly apiKey: string | null
  readonly model: string
  readonly fetchImpl?: typeof fetch
}): Judge | null {
  if (opts.apiKey === null) return null
  const apiKey = opts.apiKey.trim()
  if (apiKey === '') return null
  return createMistralJudge({ apiKey, model: opts.model, fetchImpl: opts.fetchImpl })
}
