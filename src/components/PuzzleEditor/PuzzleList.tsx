import { useState } from 'react'
import type { Puzzle, PuzzleId } from '../../game/types'
import { BUTTON_GHOST, BUTTON_PRIMARY, CARD } from '../classes'

export interface PuzzleListProps {
  readonly puzzles: readonly Puzzle[]
  readonly onEdit: (puzzle: Puzzle) => void
  readonly onRemove: (id: PuzzleId) => void
}

/**
 * Liste des énigmes perso. La suppression se confirme dans la ligne même
 * (pas de `window.confirm`, non stylable et bloquant ; pas de modale, le
 * `<dialog>` du projet arrive à une autre étape) : un seul identifiant est en
 * attente de confirmation à la fois, porté ici plutôt que par ligne.
 */
export default function PuzzleList({ puzzles, onEdit, onRemove }: PuzzleListProps) {
  const [confirmingId, setConfirmingId] = useState<PuzzleId | null>(null)

  if (puzzles.length === 0) {
    return (
      <p className="text-fg-muted">
        Aucune énigme personnelle pour l’instant. Utilisez le formulaire ci-dessus pour en créer une.
      </p>
    )
  }

  return (
    <ul className="flex flex-col gap-2">
      {puzzles.map((puzzle) => (
        <li key={puzzle.id} className={`${CARD} flex flex-wrap items-center justify-between gap-3`}>
          <div>
            <p className="font-medium text-fg">{puzzle.answer}</p>
            <p className="text-sm text-fg-muted">{puzzle.category}</p>
          </div>
          {confirmingId === puzzle.id ? (
            <div className="flex gap-2">
              <button
                type="button"
                aria-label={`Confirmer la suppression de ${puzzle.answer}`}
                className={`${BUTTON_PRIMARY} min-h-11`}
                onClick={() => {
                  onRemove(puzzle.id)
                  setConfirmingId(null)
                }}
              >
                Confirmer la suppression
              </button>
              <button
                type="button"
                aria-label={`Annuler la suppression de ${puzzle.answer}`}
                className={`${BUTTON_GHOST} min-h-11`}
                onClick={() => setConfirmingId(null)}
              >
                Annuler
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                aria-label={`Modifier ${puzzle.answer}`}
                className={`${BUTTON_GHOST} min-h-11`}
                onClick={() => onEdit(puzzle)}
              >
                Modifier
              </button>
              <button
                type="button"
                aria-label={`Supprimer ${puzzle.answer}`}
                className={`${BUTTON_GHOST} min-h-11`}
                // Ouvrir la confirmation d'une autre ligne écrase l'identifiant
                // en attente : une seule ligne à la fois peut être en confirmation.
                onClick={() => setConfirmingId(puzzle.id)}
              >
                Supprimer
              </button>
            </div>
          )}
        </li>
      ))}
    </ul>
  )
}
