import type { RefObject } from 'react'
import AimArc from '../AimArc'
import WheelPointer from './WheelPointer'
import WheelSegment from './WheelSegment'
import { useWheelSpin } from './useWheelSpin'
import { WHEEL } from '../../game/wheel'
import type { SpinLanding } from '../../game/types'

export interface WheelProps {
  /** Angle de repos courant, dans `[0, 360)` : ce que le modèle sait, hors rotation. */
  readonly angle: number
  /** Tirage en cours d'animation, `null` hors rotation. */
  readonly spin: SpinLanding | null
  /** Index du secteur sur lequel la roue s'est arrêtée, `null` pendant la rotation ou hors manche. */
  readonly highlighted: number | null
  /** Appelé quand l'animation atteint le secteur : le tour peut se poursuivre. */
  readonly onSettled: () => void
  /** L'arc de visée balaie le pourtour : `false` hors visée, et en mode « lancer simple ». */
  readonly aiming: boolean
  readonly aimRef: RefObject<HTMLDivElement | null>
}

/**
 * Roue graphique. Aucune règle de jeu ici : `spin` et `highlighted` viennent
 * déjà décidés du reducer, ce composant ne fait que les dessiner et animer.
 */
export default function Wheel({ angle, spin, highlighted, onSettled, aiming, aimRef }: WheelProps) {
  const rotorRef = useWheelSpin(angle, spin, onSettled)

  return (
    <div className="relative mx-auto aspect-square w-full max-w-xs">
      {/*
       * Frère du rotor, jamais un enfant : un enfant du rotor tournerait avec
       * la roue. Position absolue centrée en haut (`inset-x-0` + `mx-auto` sur
       * une largeur fixe centre un bloc absolu), au-dessus du rotor (`z-10`),
       * taille fixe et petite pour rester une simple aiguille.
       */}
      <div className="absolute inset-x-0 -top-2 z-10 mx-auto h-6 w-6">
        <WheelPointer />
      </div>
      {/*
       * Même raison que l'aiguille ci-dessus, et pour une raison encore plus
       * forte : frère du rotor, jamais un enfant. Un arc qui tournerait avec
       * la roue ne désignerait plus rien du tout — il balaierait le pourtour
       * en même temps que la cible qu'il est censé viser.
       */}
      {aiming && <AimArc arcRef={aimRef} />}
      {/*
       * C'est ce `<div>` qui tourne, jamais un `<g>` interne du SVG : un
       * `transform` sur un `<g>` n'est pas fiablement promu en couche
       * composite, et beaucoup de moteurs repeignent tout le SVG à chaque
       * image. Aucun `style={{ transform: … }}` n'est posé ici en JSX : la
       * rotation est écrite par la Web Animations API dans `useWheelSpin`, et
       * un rendu React qui réécrirait `transform` provoquerait un saut en
       * pleine animation.
       */}
      <div ref={rotorRef} className="wheel-rotor h-full w-full">
        {/*
         * `aria-hidden` + `focusable="false"` : 24 arcs et 24 libellés sont du
         * bruit intégral pour un lecteur d'écran, l'information passe par le
         * bouton « Tourner » et par les live regions déjà montées ailleurs.
         */}
        <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="h-full w-full">
          {WHEEL.map((segment) => (
            <WheelSegment key={segment.index} segment={segment} highlighted={segment.index === highlighted} />
          ))}
          <circle cx={50} cy={50} r={4} className="fill-wheel-ink" />
        </svg>
      </div>
    </div>
  )
}
