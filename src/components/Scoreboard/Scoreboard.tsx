import type { Player, PlayerId } from '../../game/types'
import PlayerScore from './PlayerScore'

export interface ScoreboardProps {
  readonly players: readonly Player[]
  /** Joueur dont c'est le tour, `null` hors manche. */
  readonly currentPlayerId: PlayerId | null
}

/**
 * Liste des scores, purement présentationnelle. `<ul>` et non un tableau :
 * ce ne sont pas des données tabulaires, et la mise en page reste correcte
 * qu'il y ait un seul joueur (solo) ou plusieurs.
 */
export default function Scoreboard({ players, currentPlayerId }: ScoreboardProps) {
  return (
    <ul className="flex flex-col gap-2">
      {players.map((player) => (
        <PlayerScore key={player.id} player={player} isCurrent={player.id === currentPlayerId} />
      ))}
    </ul>
  )
}
