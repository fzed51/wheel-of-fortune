import type { RefObject } from 'react'
import { AIM_ARC_DEGREES } from '../../game/wheel'

/**
 * Rayon et libellés du disque de la roue, dans le même repère
 * `viewBox="0 0 100 100"` (voir `src/components/Wheel/geometry.ts` : disque à
 * `RADIUS = 48`, libellés à `LABEL_RADIUS = 36`). L'arc de visée se pose entre
 * `44` et `48` : il touche le bord extérieur du disque sans le dépasser, et
 * reste largement au-delà du rayon des libellés, donc ne masque ni les
 * couleurs ni les montants des secteurs.
 */
const RADIUS = 46
const STROKE_WIDTH = 4

/** Arrondit à 3 décimales pour une chaîne de chemin stable et lisible. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/**
 * Convertit un angle mesuré depuis midi, sens horaire, en coordonnées du
 * viewBox SVG — même formule que `src/components/Wheel/geometry.ts` : en SVG
 * `y` croît vers le bas, donc `x = cx + r·sin(a)` et `y = cy − r·cos(a)`.
 */
function point(angleDeg: number): { readonly x: number; readonly y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: round3(50 + RADIUS * Math.sin(rad)), y: round3(50 - RADIUS * Math.cos(rad)) }
}

// Calculée au niveau du module, une fois pour toutes : l'arc va de
// `-AIM_ARC_DEGREES / 2` à `+AIM_ARC_DEGREES / 2` autour de midi. Drapeau de
// balayage à `1` (sens horaire), grand-arc à `0` (30° reste un petit arc).
// `AIM_ARC_DEGREES` vient de `game/wheel.ts` : sa largeur *est* l'erreur du
// lancer, deux copies dériveraient au prochain réglage de `JITTER_DEGREES` et
// l'arc mentirait alors au joueur sans qu'aucun test ne rougisse.
const START = point(-AIM_ARC_DEGREES / 2)
const END = point(AIM_ARC_DEGREES / 2)
const ARC_PATH = `M ${START.x} ${START.y} A ${RADIUS} ${RADIUS} 0 0 1 ${END.x} ${END.y}`

export interface AimArcProps {
  readonly arcRef: RefObject<HTMLDivElement | null>
}

/**
 * Arc de visée, purement présentationnel : `useAimSweep` porte toute la
 * logique, ce composant ne fait que le dessiner. `aria-hidden` sur la racine
 * + `focusable="false"` sur le SVG, comme le disque de la roue
 * (`src/components/Wheel/Wheel.tsx`) : l'information ne passe ni par ce
 * dessin ni par une annonce — le joueur reste dans le doute jusqu'à l'arrêt
 * de la roue. Volontairement aucun rôle `progressbar`, `meter` ni `slider`, et
 * aucun `aria-valuenow` : l'angle change une soixantaine de fois par seconde
 * pendant la visée, et l'exposer noierait un lecteur d'écran sous des
 * annonces inutilisables.
 *
 * C'est la rotation du `<div ref={arcRef}>` (écrite par la Web Animations API
 * dans `useAimSweep`) qui déplace l'arc autour de la roue ; le tracé SVG
 * lui-même reste fixe, dessiné en haut, centré sur midi.
 *
 * `pointer-events-none` : la racine couvre toute la roue en `inset-0`, elle ne
 * doit intercepter aucun clic. Jamais la classe `wheel-rotor` sur cette racine
 * non plus : `scripts/browser-check/check.mjs` filtre les animations sur ce
 * nom pour distinguer la rotation de la roue de celle de la visée, et les
 * confondre casserait ce contrôle sans qu'aucun test ne le voie.
 */
export default function AimArc({ arcRef }: AimArcProps) {
  return (
    <div ref={arcRef} aria-hidden="true" className="pointer-events-none absolute inset-0 z-10">
      <svg viewBox="0 0 100 100" focusable="false" className="h-full w-full">
        <path
          d={ARC_PATH}
          fill="none"
          strokeWidth={STROKE_WIDTH}
          // `butt`, jamais `round` : une extrémité arrondie dépasse le tracé de
          // la moitié de l'épaisseur, soit ici 2 unités de chaque côté — à un
          // rayon de 46, `2 / 46` radian ≈ 2,5° par bout, donc un arc peint de
          // ~35° au lieu de 30°. L'arc surestimerait alors l'erreur du lancer de
          // 17 %, et aucun test ne le verrait : ils vérifient les extrémités du
          // chemin, pas la peinture.
          strokeLinecap="butt"
          className="stroke-primary forced-colors:stroke-[CanvasText]"
        />
      </svg>
    </div>
  )
}
