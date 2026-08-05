/**
 * Générateur pseudo-aléatoire semé (mulberry32).
 *
 * Le moteur n'a le droit de tirer aucun nombre lui-même : l'aléa entre dans le
 * jeu par les actions. Un générateur reproductible permet de rejouer à
 * l'identique un fuzz qui a trouvé un bug, et donne au bot un comportement
 * testable.
 */
export type Rng = () => number

export function createRng(seed: number): Rng {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** Élément tiré au hasard. Renvoie `undefined` sur un tableau vide. */
export function pick<T>(rng: () => number, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.min(items.length - 1, Math.floor(rng() * items.length))]
}
