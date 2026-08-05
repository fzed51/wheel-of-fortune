import type { Puzzle } from '../../game/types'
import { asPuzzleId } from '../../game/types'
import type { Category } from '../categories'

/**
 * Une énigme du catalogue : identifiant **écrit à la main**, puis énoncé.
 *
 * L'identifiant n'est jamais dérivé de la position : il sert de clé à
 * `playedPuzzleIds`, et une numérotation calculée décalerait toutes les suivantes
 * dès qu'une énigme est insérée au milieu — les parties en cours changeraient
 * d'énigme sous les pieds du joueur.
 */
export type Entry = readonly [id: string, answer: string]

export function pack(category: Category, entries: readonly Entry[]): readonly Puzzle[] {
  return entries.map(([id, answer]) => ({
    id: asPuzzleId(id),
    answer,
    category,
    source: 'pack',
  }))
}
