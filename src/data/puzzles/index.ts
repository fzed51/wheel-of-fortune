import { pick, type Rng } from '../../game/rng'
import type { Puzzle, PuzzleId } from '../../game/types'
import { CINEMA } from './cinema'
import { CUISINE } from './cuisine'
import { EXPRESSIONS } from './expressions'
import { HISTOIRE } from './histoire'
import { LIEUX } from './lieux'
import { MUSIQUE } from './musique'
import { NATURE } from './nature'
import { QUESTIONS } from './questions'

/**
 * Catalogue embarqué. `puzzles.test.ts` en contrôle l'intégralité — unicité des
 * identifiants, forme canonique des énoncés, jouabilité — et le test existe
 * depuis avant la première énigme.
 *
 * **Les questions n'en font pas partie**, et c'est structurel : ce tableau est
 * ce que le tirage d'une manche ordinaire consomme. Une question qui s'y
 * glisserait tomberait en manche 1, où rien ne permet d'y répondre, et
 * `puzzles.test.ts` le vérifie en exigeant qu'aucune entrée d'ici ne porte de
 * `bonusAnswer`.
 */
export const PACK_PUZZLES: readonly Puzzle[] = [
  ...EXPRESSIONS,
  ...CINEMA,
  ...CUISINE,
  ...LIEUX,
  ...NATURE,
  ...MUSIQUE,
  ...HISTOIRE,
]

/**
 * Questions embarquées, tirées **uniquement** pour la manche finale. Réservoir
 * distinct de `PACK_PUZZLES` plutôt qu'un filtre sur la catégorie : c'est
 * l'appelant du tirage qui choisit son réservoir selon l'index de la manche
 * (voir `GameProvider`), et deux tableaux séparés rendent cette décision
 * impossible à oublier.
 */
export const PACK_QUESTIONS: readonly Puzzle[] = QUESTIONS

/**
 * Tirage sans répétition, aléa injecté.
 *
 * `excluded` vient de `playedPuzzleIds` : les énigmes déjà vues sont écartées
 * tant qu'il reste autre chose, puis **le catalogue entier redevient éligible**.
 * Sans cette remise à zéro, une partie plus longue que le catalogue n'aurait plus
 * rien à proposer — et le seul recours serait de figer la manche.
 *
 * Les énigmes perso entrent dans le même tirage : il suffit de les concaténer au
 * `pool`, elles ne demandent aucun traitement particulier.
 */
export function pickPuzzle(
  rng: Rng,
  pool: readonly Puzzle[],
  excluded: readonly PuzzleId[],
): Puzzle | null {
  const vues = new Set<string>(excluded)
  const fraiches = pool.filter((puzzle) => !vues.has(puzzle.id))
  return pick(rng, fraiches.length > 0 ? fraiches : pool) ?? null
}
