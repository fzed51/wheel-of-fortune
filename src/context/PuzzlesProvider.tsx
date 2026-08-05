import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { PACK_PUZZLES } from '../data/puzzles'
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

  const pool = useMemo<readonly Puzzle[]>(() => [...PACK_PUZZLES, ...custom], [custom])

  const store = useMemo<PuzzlesStore>(() => ({ custom, pool, replace }), [custom, pool, replace])

  return <PuzzlesContext value={store}>{children}</PuzzlesContext>
}
