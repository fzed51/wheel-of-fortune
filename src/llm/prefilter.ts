/**
 * Pré-filtre déterministe placé devant l'appel réseau du juge LLM.
 *
 * Une égalité normalisée tranche « correct » sans réseau ; une réponse
 * manifestement trop éloignée tranche « incorrect » sans réseau ; seule la
 * bande ambiguë (faute de frappe, mot manquant, accord approximatif) part au
 * LLM. Le gain est triple : latence, coût, et surtout surface d'injection de
 * prompt réduite — moins de tentatives arrivent jusqu'au prompt du juge.
 */

/**
 * Seuil du ratio de distance d'édition (distance / longueur la plus longue)
 * au-delà duquel une tentative est jugée hors sujet sans appeler le LLM.
 *
 * Trop bas : des tentatives raisonnables (une faute de frappe, un mot oublié
 * sur une réponse courte) seraient rejetées d'office, sans que le LLM ait pu
 * les rattraper. Trop haut : des réponses très éloignées de la solution
 * seraient envoyées au réseau pour rien, coûtant latence et argent sans
 * jamais changer le verdict.
 */
export const LEVENSHTEIN_MAX_RATIO = 0.4

export type PrefilterResult =
  | {
      readonly kind: 'decided'
      readonly correct: boolean
      readonly reason: 'exact' | 'too-far' | 'empty'
    }
  | { readonly kind: 'ask-llm' }

/**
 * Développements des ligatures, appliqués avant le pliage. `normalize('NFD')`
 * décompose les caractères précomposés mais **pas** les ligatures : sans
 * cette étape, `CŒUR` et `COEUR` seraient jugés différents alors que le jeu
 * les révèle avec les mêmes lettres (voir `src/game/puzzle.ts`).
 */
const LIGATURES: readonly (readonly [RegExp, string])[] = [
  [/Œ/g, 'OE'],
  [/Æ/g, 'AE'],
]

/**
 * Forme comparable d'un texte libre : diacritiques et ligatures effacés,
 * majuscules, tout ce qui n'est ni lettre ni chiffre supprimé. Espaces,
 * apostrophes, traits d'union et ponctuation disparaissent donc entièrement,
 * pour que la mise en forme d'une tentative ne pèse jamais dans le verdict.
 */
export function foldForCompare(text: string): string {
  let out = text.toUpperCase()
  for (const [pattern, replacement] of LIGATURES) {
    out = out.replace(pattern, replacement)
  }
  out = out.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  return out.replace(/[^\p{L}\p{N}]/gu, '')
}

/**
 * Distance d'édition de Levenshtein, calculée avec deux tableaux glissants
 * (ligne précédente / ligne courante) plutôt qu'une matrice complète : on ne
 * reconstruit aucun chemin, seule la distance finale compte.
 */
export function levenshtein(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)

  for (let i = 1; i <= a.length; i += 1) {
    const current: number[] = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const charA = a[i - 1]
      const charB = b[j - 1]
      const deletion = (previous[j] ?? 0) + 1
      const insertion = (current[j - 1] ?? 0) + 1
      const substitutionCost = charA === charB ? 0 : 1
      const substitution = (previous[j - 1] ?? 0) + substitutionCost
      current.push(Math.min(deletion, insertion, substitution))
    }
    previous = current
  }

  return previous[b.length] ?? 0
}

/**
 * Tranche localement ce qui peut l'être, renvoie `ask-llm` pour la bande
 * ambiguë. `answer` n'est plié qu'ici : le juge LLM, lui, reçoit toujours le
 * texte d'origine.
 */
export function prefilter(attempt: string, answer: string): PrefilterResult {
  const foldedAttempt = foldForCompare(attempt)
  const foldedAnswer = foldForCompare(answer)

  if (foldedAttempt.length === 0) {
    return { kind: 'decided', correct: false, reason: 'empty' }
  }

  if (foldedAttempt === foldedAnswer) {
    return { kind: 'decided', correct: true, reason: 'exact' }
  }

  const longest = Math.max(foldedAttempt.length, foldedAnswer.length)
  const ratio = levenshtein(foldedAttempt, foldedAnswer) / longest

  if (ratio > LEVENSHTEIN_MAX_RATIO) {
    return { kind: 'decided', correct: false, reason: 'too-far' }
  }

  return { kind: 'ask-llm' }
}
