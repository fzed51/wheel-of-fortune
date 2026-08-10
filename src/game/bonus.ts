import { foldForCompare } from './compare'
import type { Puzzle } from './types'

/**
 * Catégorie qui marque une énigme comme question de la manche finale.
 *
 * Vit ici et pas dans `src/data/categories.ts`, où toutes les autres
 * catégories vivent : `src/game/validate.ts` en a besoin, et `game/` ne peut
 * pas importer `data/` — `src/data/puzzles/pack.ts` importe déjà `game/types`,
 * l'inverse ferait un cycle entre les deux dossiers. C'est `data/categories.ts`
 * qui importera cette constante depuis ici.
 */
export const QUESTION_CATEGORY = 'Question'

/**
 * Une énigme est jouable comme question bonus quand elle porte une réponse
 * attendue exploitable — jamais d'après sa catégorie, qui est du texte libre
 * qu'un fichier importé peut écrire n'importe comment (fautes de casse,
 * variantes). La présence d'une réponse attendue est ce qui rend l'étape
 * bonus possible, donc c'est elle qui tranche.
 *
 * Une réponse attendue qui se plie sur la chaîne vide (« ??? », qui ne
 * contient aucune lettre ni chiffre) ne pourrait jamais être trouvée par
 * `matchesAnswer` : l'énoncé qui la porte n'est alors pas une question
 * jouable, même s'il a techniquement un `bonusAnswer`.
 */
export function isQuestion(puzzle: Puzzle): boolean {
  const expected = puzzle.bonusAnswer
  return expected !== undefined && foldForCompare(expected).length > 0
}

/**
 * `index` est-il celui de la dernière manche d'une partie de `roundCount`
 * manches ?
 *
 * `>=` plutôt que `===` : un index débordant ne doit pas faire disparaître la
 * manche finale en silence, il doit au contraire la garder. Cette fonction est
 * partagée entre le démarrage d'une partie (index 0) et le passage de manche,
 * ce qui est exactement ce qui fait marcher `roundCount === 1` sans cas
 * particulier — la première manche est alors aussi la dernière.
 */
export function isFinalRound(index: number, roundCount: number): boolean {
  return index >= roundCount - 1
}
