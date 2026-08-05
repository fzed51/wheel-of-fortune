import { Navigate } from 'react-router'
import { CARD } from '../components/classes'
import { useCurrentPlayer, useGame, useRound } from '../context/selectors'
import { multiplierFor } from '../game/rules'

/**
 * Écran de jeu. Coquille : le plateau, le clavier et les commandes arrivent à
 * l'étape suivante. La redirection vers les résultats est rendue en JSX, comme
 * toutes les autres.
 */
export default function GameRoute() {
  const game = useGame()
  const round = useRound()
  const player = useCurrentPlayer()

  if (game === null) return null
  if (game.progress.kind === 'game-over') return <Navigate to="/resultats" replace />

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="font-semibold text-fg">
          Manche {game.history.length + 1} sur {game.config.roundCount}
          {round !== null && ` — gains ×${multiplierFor(round.index)}`}
        </h2>
        {round !== null && (
          <p className="mt-1 text-sm text-fg-muted">Catégorie : {round.puzzle.category}</p>
        )}
        {player !== null && (
          <p className="mt-1 text-sm text-fg-muted">
            Au tour de {player.name} — cagnotte {player.pot} €
          </p>
        )}
      </section>

      <p className="text-fg-muted">
        Plateau, clavier et commandes arrivent à l’étape suivante.
      </p>
    </div>
  )
}
