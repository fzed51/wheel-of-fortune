import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { PACK_PUZZLES, PACK_QUESTIONS } from '../data/puzzles'
import { isQuestion } from '../game/bonus'
import type { Puzzle } from '../game/types'
import { PuzzlesContext } from '../hooks/usePuzzles'
import type { PuzzlesStore } from '../hooks/usePuzzles'
import { loadCustomPuzzles, saveCustomPuzzles } from '../storage/persist'

export function PuzzlesProvider({ children }: { readonly children: ReactNode }) {
  const [custom, setCustom] = useState<readonly Puzzle[]>(() => {
    const decoded = loadCustomPuzzles()
    // `decodePuzzles` garde les entrées valides et jette les autres : un
    // enregistrement abîmé coûte au pire quelques énigmes, jamais l'écran.
    return decoded.ok ? decoded.value : []
  })

  const replace = useCallback((puzzles: readonly Puzzle[]) => {
    saveCustomPuzzles(puzzles)
    setCustom(puzzles)
  }, [])

  // Le filtre n'est pas une précaution, c'est la règle : sans lui, une question
  // perso serait tirée en manche ordinaire, où rien ne permet de répondre à un
  // énoncé interrogatif. Symétriquement, une énigme perso ordinaire n'a rien à
  // faire dans le réservoir de la manche finale.
  const pool = useMemo<readonly Puzzle[]>(
    () => [...PACK_PUZZLES, ...custom.filter((puzzle) => !isQuestion(puzzle))],
    [custom],
  )
  const questions = useMemo<readonly Puzzle[]>(
    () => [...PACK_QUESTIONS, ...custom.filter(isQuestion)],
    [custom],
  )

  // `pool` et `questions` partitionnent `custom` par `isQuestion` — une
  // énigme perso tombe dans l'un ou l'autre, jamais les deux — et les deux
  // lots embarqués sont disjoints par construction. L'union est donc exacte
  // et sans doublon, sans qu'il soit nécessaire de la dédupliquer.
  const all = useMemo<readonly Puzzle[]>(() => [...pool, ...questions], [pool, questions])

  const store = useMemo<PuzzlesStore>(
    () => ({ custom, pool, questions, all, replace }),
    [custom, pool, questions, all, replace],
  )

  return <PuzzlesContext value={store}>{children}</PuzzlesContext>
}
