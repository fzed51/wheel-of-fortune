import { SEGMENT_ANGLE, SEGMENT_COUNT } from '../../game/wheel'
import type { SpinOutcome } from '../../game/types'

/** Rayon extérieur du disque, dans le repère `viewBox="0 0 100 100"` centré en (50, 50). */
const RADIUS = 48
/** Rayon du texte des libellés, à l'intérieur du disque. */
const LABEL_RADIUS = 36

/** Normalise un angle en degrés dans `[0, 360)`, sans boucle `while`. */
function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/**
 * Angle de rotation horaire, dans `[0, 360)`, qui amène le point de tirage du
 * segment sous l'aiguille. `offset` décale à l'intérieur du segment.
 */
export function seatAngle(out: SpinOutcome): number {
  const center = out.index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2
  return normalizeDegrees(-(center + out.offset))
}

/**
 * Prochaine rotation **absolue**. Toujours strictement croissante et congruente
 * à `seatAngle(out)` modulo 360.
 */
export function nextRotation(current: number, out: SpinOutcome, turns = 4): number {
  const base = current + turns * 360
  const target = seatAngle(out)
  // Plus petit delta positif ou nul qui rend `base + delta` congruent à `target` (mod 360) :
  // c'est ce qui garantit la stricte croissance même quand le tirage retombe sur le même segment.
  const delta = normalizeDegrees(target - base)
  return base + delta
}

/**
 * Convertit un angle mesuré depuis midi, sens horaire, en coordonnées du
 * viewBox SVG. Piège classique : en SVG `y` croît vers le bas, donc l'angle
 * horaire depuis midi donne `x = cx + r·sin(a)` et `y = cy − r·cos(a)` — pas
 * l'inverse, sous peine de voir la roue tourner dans le mauvais sens.
 */
function polar(angleDeg: number, radius: number): { readonly x: number; readonly y: number } {
  const rad = (angleDeg * Math.PI) / 180
  return { x: 50 + radius * Math.sin(rad), y: 50 - radius * Math.cos(rad) }
}

/** Arrondit à 3 décimales pour une chaîne de chemin stable et lisible. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** Vérifie que `index` désigne un segment existant, à l'image de `segmentAt` dans `game/wheel.ts`. */
function assertValidIndex(index: number): void {
  if (index < 0 || index >= SEGMENT_COUNT) {
    throw new Error(`Index de segment hors bornes : ${index}`)
  }
}

/** Chemin SVG de l'arc du segment `index`, dans un `viewBox="0 0 100 100"`. */
export function arcPath(index: number): string {
  assertValidIndex(index)
  const start = index * SEGMENT_ANGLE
  const end = start + SEGMENT_ANGLE
  const from = polar(start, RADIUS)
  const to = polar(end, RADIUS)
  // Grand arc jamais nécessaire : chaque segment fait 15°, largement sous 180°.
  const largeArc = 0
  return [
    `M 50 50`,
    `L ${round3(from.x)} ${round3(from.y)}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${round3(to.x)} ${round3(to.y)}`,
    'Z',
  ].join(' ')
}

/**
 * Point et inclinaison du libellé du segment `index`, dans le même repère.
 *
 * `angle` vaut le centre du segment **plus 90°** : le texte suit alors le rayon
 * au lieu de la tangente. Le quart de tour est indispensable, pas cosmétique —
 * à ce rayon un secteur de 15° n'offre qu'environ 9 unités de largeur d'arc,
 * où « 1000 » ne tient pas, contre une trentaine le long du rayon. Orientation
 * choisie de façon que le texte se lise du bord vers le centre.
 */
export function labelAnchor(index: number): { readonly x: number; readonly y: number; readonly angle: number } {
  assertValidIndex(index)
  const center = index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2
  const { x, y } = polar(center, LABEL_RADIUS)
  return { x: round3(x), y: round3(y), angle: round3(center + 90) }
}
