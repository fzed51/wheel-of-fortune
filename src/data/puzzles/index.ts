import { pick, type Rng } from '../../game/rng'
import type { Puzzle, PuzzleId } from '../../game/types'
import { CINEMA } from './cinema'
import { CUISINE } from './cuisine'
import { EXPRESSIONS } from './expressions'
import { LIEUX } from './lieux'
import { NATURE } from './nature'

/**
 * Catalogue embarqué. `puzzles.test.ts` en contrôle l'intégralité — unicité des
 * identifiants, forme canonique des énoncés, jouabilité — et le test existe
 * depuis avant la première énigme.
 */
export const PACK_PUZZLES: readonly Puzzle[] = [
  ...EXPRESSIONS,
  ...CINEMA,
  ...CUISINE,
  ...LIEUX,
  ...NATURE,
]

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
