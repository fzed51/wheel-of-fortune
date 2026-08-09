/**
 * Règle de jeu : le verdict de « Résoudre ».
 *
 * Comparer deux chaînes ne dépend d'aucun modèle : ce module a fait ses
 * preuves comme pré-filtre déterministe devant un juge LLM, il en devient la
 * seule règle. Aucune bande ambiguë ne subsiste, donc aucun arbitrage n'est
 * plus délégué au réseau.
 */

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
 * Verdict de « Résoudre » : égalité après pliage, aucune tolérance de faute de
 * frappe. Volontairement plus sévère que ne l'était le juge LLM — `LA CLÉ`,
 * `la cle` et `LACLE` sont acceptés, `LES CLÉS` est refusé. Une chaîne vide ne
 * peut jamais valoir une réponse.
 */
export function matchesAnswer(attempt: string, answer: string): boolean {
  const folded = foldForCompare(attempt)
  return folded.length > 0 && folded === foldForCompare(answer)
}
