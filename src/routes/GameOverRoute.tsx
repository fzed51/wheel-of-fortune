import { Link, Navigate } from 'react-router'
import { BUTTON_PRIMARY, CARD } from '../components/classes'
import { useGame } from '../context/selectors'
import { formatEuros } from '../game/announce'
import type { BonusResult, Player } from '../game/types'

/**
 * Phrase de la question bonus sur l'écran de résultats. Simple mise en forme
 * d'un `BonusResult` déjà tranché — aucune règle de jeu n'y est recalculée.
 *
 * La réponse attendue (`bonus.expected`) est révélée pour `lost` et `skipped` :
 * la partie est finie, la retenir n'a plus aucun sens, et c'est justement ce
 * que le joueur veut savoir. Elle reste absente du cas `won`, sans intérêt une
 * fois la question déjà trouvée.
 */
function bonusMessage(bonus: BonusResult, players: readonly Player[]): string {
  const player = players.find((candidate) => candidate.id === bonus.by)
  const name = player?.name ?? ''
  // `answer`, pas `bonusAnswer` : voir la même remarque dans `GameRoute`, le
  // champ affiché d'un `Puzzle`-question porte déjà l'énoncé de la question.
  const question = bonus.question.answer
  switch (bonus.outcome.kind) {
    case 'won':
      return `${name} a trouvé la question bonus (« ${question} ») et remporte ${formatEuros(bonus.outcome.amount)}.`
    case 'lost':
      return `${name} n'a pas trouvé la question bonus (« ${question} »). Réponse attendue : ${bonus.expected}.`
    case 'skipped':
      return `${name} a renoncé à la question bonus (« ${question} »). Réponse attendue : ${bonus.expected}.`
  }
}

/**
 * Résultats. Renvoie vers `/jeu` tant que la partie n'est pas finie : sans ça,
 * l'URL des résultats afficherait un classement provisoire présenté comme final.
 */
export default function GameOverRoute() {
  const game = useGame()
  if (game === null) return null
  if (game.progress.kind !== 'game-over') return <Navigate to="/jeu" replace />

  const winners = game.progress.winners
  const bonus = game.progress.bonus
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

      {/* `bonus === null` : juge indisponible, manche finale annulée, ou
          dernière manche pas une question — aucune mention, aucun encart
          vide. Un « pas de question bonus » serait un reproche déguisé pour
          un joueur qui n'a simplement pas de clé d'API. */}
      {bonus !== null && (
        <section className={CARD}>
          <h3 className="font-semibold text-fg">Question bonus</h3>
          <p className="mt-1 text-fg-muted">{bonusMessage(bonus, game.players)}</p>
        </section>
      )}

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
