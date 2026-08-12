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
  /** Libellé du bouton central : « Lancer », « Stop » ou « Tourner » selon le mode et l'état de visée — décidé par l'appelant. */
  readonly spinLabel: string
  /**
   * Légalité du lancer. Sur le bouton de la barre d'actions (`Controls.tsx`),
   * elle estompe (`aria-disabled`, toujours monté — c'est lui qui porte
   * l'accessibilité clavier du lancer). Ici, sur le bouton central, elle
   * pilote le montage : `true` retire le bouton du DOM au lieu de l'estomper.
   * Calculée une seule fois par `GameRoute` et passée aux deux, pour que la
   * barre s'estompe et le centre s'efface au même instant.
   */
  readonly spinDisabled: boolean
  readonly onSpin: () => void
}

/**
 * Roue graphique. Aucune règle de jeu ici : `spin` et `highlighted` viennent
 * déjà décidés du reducer, ce composant ne fait que les dessiner et animer.
 */
export default function Wheel({
  angle,
  spin,
  highlighted,
  onSettled,
  aiming,
  aimRef,
  spinLabel,
  spinDisabled,
  onSpin,
}: WheelProps) {
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
      {/*
       * Frère du rotor, jamais un enfant, même raison que l'aiguille et l'arc
       * ci-dessus : un bouton enfant du rotor tournerait avec la roue et
       * deviendrait illisible et impossible à viser. Sur un écran court, la
       * roue et le bouton « Lancer » de la barre d'actions ne tiennent pas
       * ensemble à l'écran — ce second bouton, posé sur le disque, garantit
       * que la roue reste visible au moment même où on lance.
       *
       * `aria-label` distinct du texte visible : sans lui, ce bouton et celui
       * de la barre d'actions porteraient tous deux le nom accessible
       * « Lancer », et toute requête `getByRole('button', { name: 'Lancer' })`
       * du dépôt deviendrait ambiguë. Le nom accessible contient le libellé
       * visible, ce qu'exige le critère d'accessibilité « Label in Name ».
       *
       * Pas d'`aria-disabled` ici, contrairement au bouton de la barre
       * d'actions : quand le lancer est illégal, ce bouton n'existe plus du
       * tout, la roue reste nue. Un `opacity-0` resterait dans l'ordre de
       * tabulation et serait quand même annoncé par un lecteur d'écran ; un
       * `visibility:hidden` perdrait le focus tout en gardant sa place dans
       * la mise en page. Ce bouton central n'est qu'un raccourci pointeur
       * redondant avec celui de la barre d'actions — qui reste toujours monté
       * et `aria-disabled`, lui, et porte seul l'accessibilité clavier du
       * lancer — son absence ne prive donc personne d'une commande. Coût
       * assumé : si le focus est sur ce bouton au moment où il se démonte (on
       * vient de le cliquer), il part sur `<body>`. Les deux live regions de
       * `LiveRegions.tsx` annoncent le tirage de toute façon, le lecteur
       * d'écran ne reste pas muet.
       *
       * `h-24 w-24` (96 px) : largement au-delà de la cible tactile minimale
       * de 44 px, et loin des montants écrits à 72 % du rayon du disque
       * (`LABEL_RADIUS` dans `geometry.ts`) — le bouton ne les recouvre pas.
       * `ring-surface` le détache visuellement de la couleur du secteur sous
       * lui, par un token de thème et non une couleur en dur.
       */}
      {!spinDisabled && (
        <button
          type="button"
          aria-label={`${spinLabel} au centre de la roue`}
          className="absolute top-1/2 left-1/2 z-20 h-24 w-24 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary font-semibold text-on-primary shadow-lg ring-4 ring-surface"
          onClick={onSpin}
        >
          {spinLabel}
        </button>
      )}
    </div>
  )
}
