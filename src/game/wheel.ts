import type { Segment, SpinOutcome } from './types'

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

/**
 * Durées de l'animation de rotation, lues à deux endroits qui ne se connaissent
 * pas : l'animation WAAPI de `components/Wheel/useWheelSpin.ts` et le chien de
 * garde de `hooks/useGameEffects.ts`, qui dispatche `wheel/settled` si
 * l'animation ne se termine jamais (onglet en arrière-plan, composant démonté).
 * Deux copies dériveraient, et un chien de garde plus court que l'animation
 * couperait la rotation avant la fin. `game/wheel.ts` est le seul module que
 * les deux peuvent importer sans qu'un `hooks/` dépende d'un `components/`.
 */
export const SPIN_MS = 3500
export const SPIN_LAUNCH_MS = 900

export function segmentAt(index: number): Segment {
  const segment = WHEEL[index]
  if (segment === undefined) {
    throw new Error(`Index de segment hors bornes : ${index}`)
  }
  return segment
}

/**
 * Tire un segment. L'aléa est fourni par l'appelant, jamais par le reducer.
 * `spinId` doit être strictement croissant sur la durée d'une partie.
 */
export function pickSpinOutcome(rng: () => number, spinId: number): SpinOutcome {
  const index = Math.min(SEGMENT_COUNT - 1, Math.floor(rng() * SEGMENT_COUNT))
  const offset = (rng() * 2 - 1) * OFFSET_BOUND
  return { index, offset, spinId }
}
