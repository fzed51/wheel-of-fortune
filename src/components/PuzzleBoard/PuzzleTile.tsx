import type { Cell } from '../../game/puzzle'
import type { Letter } from '../../game/types'

interface PuzzleTileProps {
  readonly cell: Cell
  readonly revealed: ReadonlySet<Letter>
}

/**
 * Une case du plateau, une seule responsabilité : afficher un `Cell`.
 *
 * Trois apparences : ponctuation (`letter === null`) toujours affichée, sans
 * cadre — elle ne se devine jamais et ne doit pas se lire comme une case à
 * trouver ; lettre non révélée, cadre visible mais vide ; lettre révélée, le
 * `char` d'origine (accentué : `É`, pas `E`).
 *
 * Taille mobile-first pensée pour tenir sur 360 px de large même sur un mot
 * long : la case s'agrandit à partir de `sm`.
 */
export default function PuzzleTile({ cell, revealed }: PuzzleTileProps) {
  if (cell.letter === null) {
    return (
      <span
        aria-hidden
        className="flex h-8 w-5 items-center justify-center text-lg font-bold text-fg sm:h-11 sm:w-7 sm:text-2xl"
      >
        {cell.char}
      </span>
    )
  }

  const isRevealed = revealed.has(cell.letter)

  return (
    <span
      aria-hidden
      className="flex h-8 w-6 items-center justify-center rounded border border-border bg-surface text-lg font-bold text-fg sm:h-11 sm:w-8 sm:text-2xl"
    >
      {isRevealed ? cell.char : ''}
    </span>
  )
}
