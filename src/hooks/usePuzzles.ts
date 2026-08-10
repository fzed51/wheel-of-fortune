import { createContext, useContext } from 'react'
import type { Puzzle } from '../game/types'

/**
 * Énigmes disponibles : le lot embarqué plus celles de l'utilisateur, réparties
 * dans deux réservoirs distincts.
 *
 * `pool` est ce que le tirage d'une manche **ordinaire** consomme. `questions`
 * est ce que le tirage de la manche **finale** consomme (voir `isFinalRound`
 * dans `game/bonus.ts`). Les énigmes perso ne remplacent aucun des deux lots
 * embarqués, elles s'y ajoutent selon leur nature (`isQuestion`) : un catalogue
 * perso vidé pendant une partie ne doit pas laisser le tirage sans candidat.
 *
 * `all` est l'union des deux réservoirs — tout ce que l'application connaît,
 * quelle que soit la manche. Il sert à ce qui doit raisonner sur l'ensemble
 * plutôt que sur une seule manche : `nextCustomId` pour qu'un identifiant perso
 * ne soit jamais réattribué à deux énigmes de nature différente, et la
 * détection de doublon d'énoncé dans l'éditeur, qui doit repérer un énoncé déjà
 * pris même s'il vient d'une question de manche finale. Il ne sert **jamais**
 * au tirage — c'est `pool` ou `questions` selon l'index de la manche en cours,
 * jamais `all`, sinon une question pourrait tomber en manche 1, où rien ne
 * permet d'y répondre. Ce champ existe précisément parce que la répartition en
 * deux réservoirs a fait perdre à `pool` seul son ancien sens d'« ensemble
 * complet » : laisser chaque appelant recalculer l'union à la main aurait
 * rendu l'oubli invisible à la relecture, exactement le bug que ce champ
 * corrige.
 */
export interface PuzzlesStore {
  readonly custom: readonly Puzzle[]
  readonly pool: readonly Puzzle[]
  readonly questions: readonly Puzzle[]
  readonly all: readonly Puzzle[]
  readonly replace: (puzzles: readonly Puzzle[]) => void
}

export const PuzzlesContext = createContext<PuzzlesStore | null>(null)

export function usePuzzles(): PuzzlesStore {
  const store = useContext(PuzzlesContext)
  if (store === null) throw new Error('usePuzzles hors de PuzzlesProvider')
  return store
}
