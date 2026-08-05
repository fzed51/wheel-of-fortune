import type { Segment, SpinOutcome } from './types'

/**
 * Disposition de la roue, du haut dans le sens horaire.
 * `'B'` = banqueroute, `'P'` = passe, un nombre = un montant.
 *
 * Les montants sont volontairement répétés (250, 300, 400 et 500 apparaissent
 * deux fois) : c'est ce qui rend l'`index` du segment indispensable, sans lui
 * l'animation ne saurait pas quel arc viser.
 */
const LAYOUT = [
  100, 250, 500, 'B', 300, 750, 400, 'P', 600, 350, 900, 'B',
  200, 550, 800, 300, 450, 1000, 'P', 250, 700, 400, 650, 500,
] as const

export const SEGMENT_COUNT = LAYOUT.length
export const SEGMENT_ANGLE = 360 / SEGMENT_COUNT

/** L'index de chaque segment est dérivé de sa position : il ne peut pas se désynchroniser. */
export const WHEEL: readonly Segment[] = LAYOUT.map((slot, index) => {
  if (slot === 'B') return { kind: 'bankrupt', index }
  if (slot === 'P') return { kind: 'pass', index }
  return { kind: 'cash', index, value: slot }
})

/** Marge laissée aux bords du segment pour que l'aiguille reste sans ambiguïté. */
const OFFSET_BOUND = SEGMENT_ANGLE / 2 - 2

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
