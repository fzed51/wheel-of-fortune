import { cellsOf } from '../../game/puzzle'
import type { Letter } from '../../game/types'
import { wordsOf } from './layout'
import PuzzleCategory from './PuzzleCategory'
import PuzzleTile from './PuzzleTile'

export interface PuzzleBoardProps {
  /** Réponse normalisée de l'énigme. */
  readonly answer: string
  readonly revealed: ReadonlySet<Letter>
  readonly category: string
  /** Chaîne épelée qui remplace les cases pour le lecteur d'écran, fournie par la route. */
  readonly description: string
}

/**
 * Plateau de l'énigme : purement présentationnel, tout arrive par props.
 *
 * Ni `role="table"` ni `role="grid"` : ce n'est pas un tableau de données, et
 * `grid` imposerait une navigation aux flèches qui n'existe pas ici. Les cases
 * sont `aria-hidden` et remplacées, pour le lecteur d'écran, par `description` —
 * sans ça `LACLÉ` se prononcerait comme un mot et les cases vides seraient
 * sautées. Ce n'est pas une live region : elle change à chaque révélation,
 * mais l'annonce vocale est portée ailleurs, montée une seule fois.
 */
export default function PuzzleBoard({ answer, revealed, category, description }: PuzzleBoardProps) {
  const words = wordsOf(cellsOf(answer))

  return (
    <div>
      <PuzzleCategory category={category} />
      <p className="sr-only">{description}</p>
      <div aria-hidden className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
        {words.map((word, wordIndex) => (
          <div key={wordIndex} className="inline-flex gap-1">
            {word.map((cell, cellIndex) => (
              <PuzzleTile key={cellIndex} cell={cell} revealed={revealed} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
