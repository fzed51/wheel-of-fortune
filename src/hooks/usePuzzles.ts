import { createContext, useContext } from 'react'
import type { Puzzle } from '../game/types'

/**
 * Énigmes disponibles : le lot embarqué plus celles de l'utilisateur.
 *
 * `pool` est ce que le tirage consomme. Les énigmes perso ne remplacent pas le
 * lot, elles s'y ajoutent : un catalogue perso vidé pendant une partie ne doit pas
 * laisser le tirage sans candidat.
 */
export interface PuzzlesStore {
  readonly custom: readonly Puzzle[]
  readonly pool: readonly Puzzle[]
  readonly replace: (puzzles: readonly Puzzle[]) => void
}

export const PuzzlesContext = createContext<PuzzlesStore | null>(null)

export function usePuzzles(): PuzzlesStore {
  const store = useContext(PuzzlesContext)
  if (store === null) throw new Error('usePuzzles hors de PuzzlesProvider')
  return store
}
