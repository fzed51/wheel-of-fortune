import type { RefObject } from 'react'
import AimArc from '../AimArc'
import WheelPointer from './WheelPointer'
import WheelSegment from './WheelSegment'
import { useWheelSpin } from './useWheelSpin'
import { WHEEL } from '../../game/wheel'
import { ROTOR_INSET_PERCENT } from './geometry'
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
    // `max-w-sm` (24rem) et non `max-w-xs` (20rem) : le rotor se rentre de
    // `ROTOR_INSET_PERCENT` sur ce carré, donc le disque qu'il porte rend à
    // 24 × 0,84 ≈ 20,16rem — la taille d'avant le retrait. Cette classe et le
    // retrait ci-dessous forment une paire : changer l'un sans l'autre fait
    // rétrécir ou grossir le disque visible.
    <div className="relative mx-auto aspect-square w-full max-w-sm">
      {/*
       * Frère du rotor, jamais un enfant : un enfant du rotor tournerait avec
       * la roue. Position absolue centrée en haut (`inset-x-0` + `mx-auto` sur
       * une largeur fixe centre un bloc absolu), au-dessus du rotor et de l'arc
       * (`z-20` : l'arc balaie sa couronne en `z-10`, et l'aiguille reste le
       * repère de lecture — c'est elle qui doit passer devant).
       *
       * `h-9` et non `h-6` : depuis que le rotor se rentre de
       * `ROTOR_INSET_PERCENT`, le bord du disque n'est plus au bord du carré
       * mais 8 % plus bas. Une aiguille de 6 flotterait à une quinzaine de
       * pixels du disque, séparée de lui par la couronne vide de l'arc ; en 9
       * elle la traverse et s'arrête juste au-dessus du disque. Le rapport 6/9
       * de la boîte est celui du `viewBox` de `WheelPointer`, faute de quoi son
       * triangle serait centré dans le vide au lieu d'être allongé.
       */}
      <div className="absolute inset-x-0 -top-2 z-20 mx-auto h-9 w-6">
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
      {/*
       * `inset` en style inline, pas une classe `inset-[8%]` : Tailwind ne
       * peut pas interpoler `ROTOR_INSET_PERCENT`, et deux copies du chiffre
       * (une en TS, une en classe) dériveraient sans qu'aucun test ne
       * rougisse. Ce retrait libère la couronne extérieure où se pose
       * `AimArc`, sans conflit avec la Web Animations API : elle n'écrit que
       * `transform` sur ce même nœud, jamais `inset`.
       */}
      <div
        ref={rotorRef}
        className="wheel-rotor absolute"
        style={{ inset: `${ROTOR_INSET_PERCENT}%` }}
      >
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
