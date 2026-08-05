import { formatEuros } from '../../game/announce'
import type { Player } from '../../game/types'
import { CARD } from '../classes'

interface PlayerScoreProps {
  readonly player: Player
  readonly isCurrent: boolean
}

/**
 * Une ligne de score. Le repère du joueur courant ne tient pas qu'à la couleur :
 * une bordure plus épaisse et une pastille visible, en plus de `aria-current`,
 * couvrent aussi le mode `forced-colors` où les teintes du thème s'effacent.
 */
export default function PlayerScore({ player, isCurrent }: PlayerScoreProps) {
  return (
    <li
      aria-current={isCurrent ? 'true' : undefined}
      className={`${CARD} flex items-center justify-between gap-3 ${isCurrent ? 'border-2 border-primary' : ''}`}
    >
      <div className="flex items-center gap-2 min-w-0">
        {isCurrent && (
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary"
          />
        )}
        <span className="truncate font-medium text-fg">{player.name}</span>
      </div>
      <div className="flex shrink-0 flex-col items-end text-sm">
        <span className="text-fg">
          <span className="text-fg-muted">Gains : </span>
          {formatEuros(player.total)}
        </span>
        <span className="text-fg-muted">
          <span>Cagnotte : </span>
          {formatEuros(player.pot)}
        </span>
      </div>
    </li>
  )
}
