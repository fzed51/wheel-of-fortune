/**
 * Ce module sert exclusivement à juger la réponse à la question bonus de la
 * manche finale. « Résoudre » ne l'utilise plus : c'est devenu une simple
 * comparaison de chaînes (`src/game/compare.ts`), déterministe, qui ne
 * consulte aucun juge. `SettingsRoute` l'utilise aussi, pour « Tester la clé »,
 * mais sans jamais appeler `judgeBonus`.
 */
import { createMistralJudge } from './mistral'
import type { Judge } from './judge'

export type { BonusJudgeInput, Judge, JudgeErrorReason, JudgeResult } from './judge'
export { createMistralJudge, testMistralKey } from './mistral'
export type { KeyTestResult, MistralOptions } from './mistral'

/**
 * Fabrique du juge effectivement utilisé par la partie.
 *
 * Sans clé, il n'y a **aucun repli local** : `null` est ce qui supprime
 * l'étape bonus entière (pas seulement le verdict), pour le joueur comme pour
 * les bots. Un faux juge maison inventerait des verdicts sans le modèle qui
 * les justifie — inacceptable pour un jeu dont l'issue dépend de ce verdict.
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
