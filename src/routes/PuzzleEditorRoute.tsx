import { CARD } from '../components/classes'
import { usePuzzles } from '../hooks/usePuzzles'
import { PACK_PUZZLES } from '../data/puzzles'

/** Éditeur d'énigmes. Coquille : la saisie et l'import / export arrivent plus tard. */
export default function PuzzleEditorRoute() {
  const { custom } = usePuzzles()

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="font-semibold text-fg">Catalogue</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {PACK_PUZZLES.length} énigmes embarquées, {custom.length} énigme
          {custom.length === 1 ? '' : 's'} à vous.
        </p>
      </section>

      {custom.length > 0 && (
        <ul className="flex flex-col gap-2">
          {custom.map((puzzle) => (
            <li key={puzzle.id} className={CARD}>
              <p className="text-fg">{puzzle.answer}</p>
              <p className="text-sm text-fg-muted">{puzzle.category}</p>
            </li>
          ))}
        </ul>
      )}

      <p className="text-fg-muted">L’éditeur arrive à une étape ultérieure.</p>
    </div>
  )
}
