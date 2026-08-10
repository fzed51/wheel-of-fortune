import type { Segment, SpinLanding, WheelThrow } from './types'

/**
 * Disposition de la roue, du haut dans le sens horaire.
 * `'B'` = banqueroute, `'P'` = passe, un nombre = un montant.
 *
 * Plusieurs montants reviennent (50, 100, 150, 200 et 250 apparaissent chacun
 * plusieurs fois) : c'est ce qui rend l'`index` du segment indispensable, sans lui
 * l'animation ne saurait pas quel arc viser.
 */
const LAYOUT = [
  100, 250, 50, 500, 'B', 150, 400, 200, 'P', 250, 100, 600,
   50, 350,  0, 200, 450, 150, 'B', 300, 100, 800, 'P', 250,
] as const

export const SEGMENT_COUNT = LAYOUT.length
export const SEGMENT_ANGLE = 360 / SEGMENT_COUNT

/** L'index de chaque segment est dérivé de sa position : il ne peut pas se désynchroniser. */
export const WHEEL: readonly Segment[] = LAYOUT.map((slot, index) => {
  if (slot === 'B') return { kind: 'bankrupt', index }
  if (slot === 'P') return { kind: 'pass', index }
  return { kind: 'cash', index, value: slot }
})

/**
 * Compteurs dérivés de `WHEEL`, jamais écrits en dur : l'écran de règles
 * (`src/routes/HowToPlayRoute.tsx`) les lit pour annoncer « dont deux Banqueroute
 * et deux Passe » sans figer ces nombres dans sa propre prose, qui mentirait au
 * prochain rééquilibrage du barème.
 */
export const BANKRUPT_COUNT = WHEEL.filter((segment) => segment.kind === 'bankrupt').length
export const PASS_COUNT = WHEEL.filter((segment) => segment.kind === 'pass').length
export const ZERO_COUNT = WHEEL.filter((segment) => segment.kind === 'cash' && segment.value === 0).length

/** Marge laissée aux bords du segment pour que l'aiguille reste sans ambiguïté. */
const OFFSET_BOUND = SEGMENT_ANGLE / 2 - 2

export function segmentAt(index: number): Segment {
  const segment = WHEEL[index]
  if (segment === undefined) {
    throw new Error(`Index de segment hors bornes : ${index}`)
  }
  return segment
}

/** En dessous, un lancer serait trop mou pour paraître réel : deux tours pleins sont le plancher. */
export const MIN_TRAVEL_DEGREES = 720

/** Amplitude ajoutée au plancher par la force du lancer : jusqu'à quatre tours de plus. */
export const TRAVEL_SPAN_DEGREES = 1440

/** Imprécision humaine du lancer : au plus une case en trop ou en moins autour de la cible. */
export const JITTER_DEGREES = SEGMENT_ANGLE

/**
 * Bornes de durée de l'animation de rotation, lues à deux endroits qui ne se
 * connaissent pas : l'animation WAAPI de `components/Wheel/useWheelSpin.ts` et
 * le chien de garde de `hooks/useGameEffects.ts`, qui dispatche `wheel/settled`
 * si l'animation ne se termine jamais (onglet en arrière-plan, composant
 * démonté). Deux copies dériveraient, et un chien de garde plus court que
 * l'animation la plus longue couperait une rotation avant la fin. `game/wheel.ts`
 * est le seul module que les deux peuvent importer sans qu'un `hooks/` dépende
 * d'un `components/`.
 */

/** Durée minimale de l'animation, pour un lancer au ralenti. */
export const SPIN_MIN_MS = 2600

/** Durée maximale de l'animation, pour un lancer à pleine puissance. */
export const SPIN_MAX_MS = 4200

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Angle de rotation qui amène (index, offset) sous l'aiguille. Inverse de la dérivation d'index. */
export function angleForLanding(index: number, offset: number): number {
  return normalizeDegrees(-(index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2 + offset))
}

export function randomForce(rng: () => number): number {
  return rng()
}

export function throwFromForce(force: number, rng: () => number, spinId: number): WheelThrow {
  const clamped = Math.min(1, Math.max(0, force))
  const jitter = (rng() * 2 - 1) * JITTER_DEGREES
  return {
    spinId,
    travel: MIN_TRAVEL_DEGREES + clamped * TRAVEL_SPAN_DEGREES + jitter,
    durationMs: Math.round(SPIN_MIN_MS + clamped * (SPIN_MAX_MS - SPIN_MIN_MS)),
  }
}

/**
 * Déduit l'atterrissage à partir de l'angle de repos précédent et d'un lancer.
 * Une roue arrêtée pile sur une séparation entre deux segments ne peut pas être
 * tranchée à l'œil : `offset` est rabattu dans `[-OFFSET_BOUND, OFFSET_BOUND]`, et
 * `travel` est corrigé du même montant que `offset` pour que l'image animée et le
 * modèle disent la même chose. La correction vaut au plus 2°, la marge laissée par
 * `OFFSET_BOUND` aux bords du segment.
 */
export function resolveThrow(fromAngle: number, thrown: WheelThrow): SpinLanding {
  const under = normalizeDegrees(-normalizeDegrees(fromAngle + thrown.travel))
  const index = Math.min(SEGMENT_COUNT - 1, Math.floor(under / SEGMENT_ANGLE))
  const raw = under - (index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2)
  const offset = Math.max(-OFFSET_BOUND, Math.min(OFFSET_BOUND, raw))
  const travel = thrown.travel + (raw - offset)
  return {
    spinId: thrown.spinId,
    durationMs: thrown.durationMs,
    travel,
    index,
    offset,
    angle: normalizeDegrees(fromAngle + travel),
  }
}

/** Étiquette de force, pour l'annonce vocale. */
export function forceLabel(travel: number): 'faible' | 'moyen' | 'fort' {
  const over = travel - MIN_TRAVEL_DEGREES
  if (over < TRAVEL_SPAN_DEGREES / 3) return 'faible'
  if (over < (TRAVEL_SPAN_DEGREES * 2) / 3) return 'moyen'
  return 'fort'
}
