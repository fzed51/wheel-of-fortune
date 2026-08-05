import type { Cell } from '../../game/puzzle'

/**
 * Découpe les cases en mots, sur les espaces (`char === ' '`) uniquement.
 *
 * Ne fait volontairement pas de découpage en rangées à largeur fixe : une
 * largeur en dur casserait sur les petits écrans et n'a pas de bonne valeur.
 * Le retour à la ligne est laissé à `flex-wrap` sur des groupes de mots en
 * `inline-flex` côté `PuzzleBoard` — un mot ne peut alors physiquement pas
 * être coupé, et la seule logique qui reste à tester ici est ce découpage.
 *
 * Aucun mot vide dans le résultat, même sur des espaces consécutifs.
 */
export function wordsOf(cells: readonly Cell[]): readonly (readonly Cell[])[] {
  const words: (readonly Cell[])[] = []
  let current: Cell[] = []

  for (const cell of cells) {
    if (cell.char === ' ') {
      if (current.length > 0) {
        words.push(current)
        current = []
      }
      continue
    }
    current.push(cell)
  }
  if (current.length > 0) words.push(current)

  return words
}
