import { SEGMENT_ANGLE, SEGMENT_COUNT } from '../../game/wheel'

/** Rayon extérieur du disque, dans le repère `viewBox="0 0 100 100"` centré en (50, 50). */
export const RADIUS = 48
/** Rayon du texte des libellés, à l'intérieur du disque. */
const LABEL_RADIUS = 36
/** Retrait du rotor dans le carré de la roue, en pourcentage de son côté. */
export const ROTOR_INSET_PERCENT = 8
/**
 * Rayon du disque **tel qu'il est rendu**, exprimé dans le repère du carré de
 * la roue — celui de `AimArc`. Le rotor se rentre de `ROTOR_INSET_PERCENT` de
 * chaque côté, donc de deux fois ce pourcentage en tout : le disque qu'il
 * contient rétrécit dans la même proportion, quel que soit son `RADIUS`
 * interne au repère `viewBox="0 0 100 100"` du disque.
 */
export const DISC_RADIUS_ON_BOARD = RADIUS * (1 - (2 * ROTOR_INSET_PERCENT) / 100)

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
