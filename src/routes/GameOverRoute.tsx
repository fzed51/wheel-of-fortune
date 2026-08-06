import { Link, Navigate } from 'react-router'
import { BUTTON_PRIMARY, CARD } from '../components/classes'
import { useGame } from '../context/selectors'
import { formatEuros } from '../game/announce'

/**
 * Résultats. Renvoie vers `/jeu` tant que la partie n'est pas finie : sans ça,
 * l'URL des résultats afficherait un classement provisoire présenté comme final.
 */
export default function GameOverRoute() {
  const game = useGame()
  if (game === null) return null
  if (game.progress.kind !== 'game-over') return <Navigate to="/jeu" replace />

  const winners = game.progress.winners
  const classement = [...game.players].sort((left, right) => right.total - left.total)

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="text-xl font-semibold text-fg">
          {winners.length > 1 ? 'Égalité' : 'Vainqueur'}
        </h2>
        <p className="mt-1 text-fg-muted">
          {game.players
            .filter((player) => winners.includes(player.id))
            .map((player) => player.name)
            .join(', ')}
        </p>
      </section>

      <ol className="flex flex-col gap-2">
        {classement.map((player) => (
          <li key={player.id} className={`${CARD} flex justify-between`}>
            <span className="text-fg">{player.name}</span>
            {/* `formatEuros` et non `{total} €` : c'est la seule écriture des montants
                du projet, elle groupe les milliers en espace insécable et accorde
                l'unité. Un `3000 €` isolé ici contredisait le tableau des scores,
                qui affiche « 3 000 euros » pour la même valeur. */}
            <span className="text-fg-muted">{formatEuros(player.total)}</span>
          </li>
        ))}
      </ol>

      <Link to="/" className={`${BUTTON_PRIMARY} self-start`}>
        Retour à l’accueil
      </Link>
    </div>
  )
}
