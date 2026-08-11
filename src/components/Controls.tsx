import type { RefObject } from 'react'
import { formatEuros } from '../game/announce'
import PowerGauge from './PowerGauge'
import { BUTTON_GHOST, BUTTON_PRIMARY } from './classes'

export interface ControlsProps {
  readonly canSpin: boolean
  readonly canResolve: boolean
  readonly canPass: boolean
  /** Prix d'une voyelle, affiché en indice — l'achat se fait sur le clavier. */
  readonly vowelCost: number
  /** La roue tourne : les commandes sont gelées le temps de l'animation. */
  readonly spinning: boolean
  /** La jauge de puissance est en charge : le bouton de lancer devient le bouton d'arrêt. */
  readonly charging: boolean
  readonly markerRef: RefObject<HTMLDivElement | null>
  readonly onSpin: () => void
  readonly onResolve: () => void
  readonly onPass: () => void
}

/**
 * Barre d'actions. `aria-disabled`, jamais `disabled` : un bouton `disabled`
 * qui porte le focus le perd au profit de `<body>`, et le lecteur d'écran se
 * tait au moment précis où le joueur attend une explication. Les gestionnaires
 * sortent tôt quand l'action est illégale, plutôt que de compter sur l'attribut
 * natif pour bloquer le clic.
 */
export default function Controls({
  canSpin,
  canResolve,
  canPass,
  vowelCost,
  spinning,
  charging,
  markerRef,
  onSpin,
  onResolve,
  onPass,
}: ControlsProps) {
  // En charge, le bouton devient « Stop » et reste toujours actif : la charge
  // n'a pu démarrer que sur un lancer légal, et l'arrêter doit toujours être
  // possible, quoi qu'il arrive par ailleurs à `canSpin`.
  const spinDisabled = charging ? false : spinning || !canSpin
  const resolveDisabled = spinning || !canResolve
  const passDisabled = spinning || !canPass

  return (
    <div className="flex flex-col gap-2">
      {charging && <PowerGauge markerRef={markerRef} />}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          aria-disabled={spinDisabled}
          className={`${BUTTON_PRIMARY} min-h-11 flex-1`}
          onClick={() => {
            if (spinDisabled) return
            onSpin()
          }}
        >
          {charging ? 'Stop' : 'Lancer'}
        </button>
        <button
          type="button"
          aria-disabled={resolveDisabled}
          className={`${BUTTON_GHOST} min-h-11 flex-1`}
          onClick={() => {
            if (resolveDisabled) return
            onResolve()
          }}
        >
          Résoudre
        </button>
        <button
          type="button"
          aria-disabled={passDisabled}
          className={`${BUTTON_GHOST} min-h-11 flex-1`}
          onClick={() => {
            if (passDisabled) return
            onPass()
          }}
        >
          Passer la main
        </button>
      </div>
      <p className="text-sm text-fg-muted">Voyelle : {formatEuros(vowelCost)}</p>
    </div>
  )
}
