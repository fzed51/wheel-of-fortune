import { describe, expect, it } from 'vitest'
import {
  BANKRUPT_COUNT,
  MIN_TRAVEL_DEGREES,
  PASS_COUNT,
  SEGMENT_ANGLE,
  SEGMENT_COUNT,
  SPIN_MAX_MS,
  SPIN_MIN_MS,
  TRAVEL_SPAN_DEGREES,
  WHEEL,
  ZERO_COUNT,
  angleForLanding,
  forceLabel,
  normalizeDegrees,
  resolveThrow,
  segmentAt,
  throwFromForce,
} from './wheel'

describe('WHEEL', () => {
  it('compte 24 segments de 15 degrés', () => {
    expect(SEGMENT_COUNT).toBe(24)
    expect(WHEEL).toHaveLength(24)
    expect(SEGMENT_ANGLE).toBe(15)
  })

  it('contient exactement deux banqueroutes, deux passes et une case à 0', () => {
    // Les compteurs sont dérivés de WHEEL : comparer BANKRUPT_COUNT/PASS_COUNT/ZERO_COUNT
    // aux valeurs attendues vaut mieux que recompter WHEEL nous-mêmes, ce qui ne
    // vérifierait rien de plus que l'implémentation des compteurs.
    expect(BANKRUPT_COUNT).toBe(2)
    expect(PASS_COUNT).toBe(2)
    expect(ZERO_COUNT).toBe(1)
    expect(WHEEL.filter((s) => s.kind === 'bankrupt')).toHaveLength(BANKRUPT_COUNT)
    expect(WHEEL.filter((s) => s.kind === 'pass')).toHaveLength(PASS_COUNT)
  })

  it('donne à chaque segment un index égal à sa position', () => {
    WHEEL.forEach((segment, position) => {
      expect(segment.index).toBe(position)
    })
  })

  it('n’a qu’une seule case à 0, toutes les autres cases payantes étant strictement positives et multiples de 50', () => {
    const cashSegments = WHEEL.filter((segment) => segment.kind === 'cash')
    const zeroSegments = cashSegments.filter((segment) => segment.value === 0)
    expect(zeroSegments).toHaveLength(1)
    for (const segment of cashSegments) {
      expect(segment.value).toBeGreaterThanOrEqual(0)
      expect(segment.value % 50).toBe(0)
      if (segment.value !== 0) expect(segment.value).toBeGreaterThan(0)
    }
  })

  it('représente la case à 0 comme un segment cash, pas comme une variante à part', () => {
    // C'est ce qui garantit le comportement voulu au reducer : gain = value × occurrences
    // × multiplicateur = 0, la lettre est révélée et la main reste au joueur — contrairement
    // à un segment 'pass', qui ferait passer la main sans révéler la lettre.
    const zeroSegment = WHEEL.find((segment) => segment.kind === 'cash' && segment.value === 0)
    expect(zeroSegment).toBeDefined()
    expect(zeroSegment?.kind).toBe('cash')
  })
})

describe('segmentAt', () => {
  it('rend le segment à l’index demandé', () => {
    expect(segmentAt(0)).toEqual(WHEEL[0])
    expect(segmentAt(SEGMENT_COUNT - 1)).toEqual(WHEEL[SEGMENT_COUNT - 1])
  })

  it('lève sur un index hors bornes plutôt que de rendre undefined', () => {
    expect(() => segmentAt(-1)).toThrow()
    expect(() => segmentAt(SEGMENT_COUNT)).toThrow()
  })
})

const START_ANGLES = [0, 37, 111, 250, 359]
/** Marge laissée aux bords du segment (SEGMENT_ANGLE / 2 - 2), recopiée ici : le module ne l'exporte pas. */
const OFFSET_BOUND = 5.5

describe('resolveThrow', () => {
  it('retombe sur l’index visé, quel que soit l’angle de départ : le garde-fou central', () => {
    // Si ce roundtrip casse, l'animation de la roue et l'index révélé au joueur
    // divergent : la case affichée à l'écran ne serait plus celle qui paie.
    for (const fromAngle of START_ANGLES) {
      for (let index = 0; index < SEGMENT_COUNT; index += 1) {
        const travel = normalizeDegrees(angleForLanding(index, 0) - fromAngle) + 720
        const landing = resolveThrow(fromAngle, { spinId: 1, travel, durationMs: 3000 })
        expect(landing.index).toBe(index)
      }
    }
  })

  it('rend un offset nul quand la cible est le centre exact d’un segment', () => {
    for (const fromAngle of START_ANGLES) {
      const travel = normalizeDegrees(angleForLanding(5, 0) - fromAngle) + 720
      const landing = resolveThrow(fromAngle, { spinId: 1, travel, durationMs: 3000 })
      expect(Math.abs(landing.offset)).toBeLessThan(1e-9)
    }
  })

  it('ne dépasse jamais la marge autorisée aux bords du segment', () => {
    // Sans le rabattage aux bords, un lancer visant pile une séparation rendrait
    // un offset à ±7,5°, une aiguille que rien ne permettrait de trancher à l'œil.
    for (let i = 0; i < 2000; i += 1) {
      const fromAngle = (i * 137) % 360
      const force = (i % 101) / 100
      const travel = MIN_TRAVEL_DEGREES + force * TRAVEL_SPAN_DEGREES + ((i % 17) - 8)
      const landing = resolveThrow(fromAngle, { spinId: i, travel, durationMs: 3000 })
      expect(Math.abs(landing.offset)).toBeLessThanOrEqual(OFFSET_BOUND + 1e-9)
    }
  })

  it('ne corrige la course que de la marge autorisée, jamais plus', () => {
    for (let i = 0; i < 500; i += 1) {
      const fromAngle = (i * 53) % 360
      const travel = MIN_TRAVEL_DEGREES + ((i * 31) % TRAVEL_SPAN_DEGREES)
      const thrown = { spinId: i, travel, durationMs: 3000 }
      const landing = resolveThrow(fromAngle, thrown)
      expect(Math.abs(landing.travel - thrown.travel)).toBeLessThanOrEqual(2)
    }
  })
})

describe('throwFromForce', () => {
  it('reste dans les bornes de course et de durée, en recopiant le spinId', () => {
    for (const force of [0, 0.25, 0.5, 0.75, 1]) {
      const thrown = throwFromForce(force, () => 0.5, 7)
      expect(thrown.travel).toBeGreaterThanOrEqual(705)
      expect(thrown.travel).toBeLessThanOrEqual(2175)
      expect(thrown.durationMs).toBeGreaterThanOrEqual(SPIN_MIN_MS)
      expect(thrown.durationMs).toBeLessThanOrEqual(SPIN_MAX_MS)
      expect(thrown.spinId).toBe(7)
    }
  })

  it('allonge la course et la durée avec la force, à générateur constant', () => {
    const weak = throwFromForce(0, () => 0.5, 1)
    const strong = throwFromForce(1, () => 0.5, 1)
    expect(strong.travel).toBeGreaterThan(weak.travel)
    expect(strong.durationMs).toBeGreaterThan(weak.durationMs)
  })

  it('ne consomme le générateur qu’une seule fois', () => {
    let calls = 0
    const rng = () => {
      calls += 1
      return 0.5
    }
    throwFromForce(0.4, rng, 1)
    expect(calls).toBe(1)
  })

  it('ignore une force hors de [0, 1] en la ramenant aux bornes', () => {
    const under = throwFromForce(-1, () => 0.5, 1)
    const over = throwFromForce(2, () => 0.5, 1)
    const zero = throwFromForce(0, () => 0.5, 1)
    const one = throwFromForce(1, () => 0.5, 1)
    expect(under.travel).toBe(zero.travel)
    expect(over.travel).toBe(one.travel)
  })
})

describe('couverture des lancers', () => {
  it('atteint les 24 cases depuis chaque angle de départ, sur un éventail de forces', () => {
    for (const fromAngle of START_ANGLES) {
      const seen = new Set<number>()
      for (let i = 0; i < 500; i += 1) {
        const force = i / 499
        const thrown = throwFromForce(force, () => (i % 7) / 7, i)
        seen.add(resolveThrow(fromAngle, thrown).index)
      }
      expect(seen.size).toBe(SEGMENT_COUNT)
    }
  })
})

describe('forceLabel', () => {
  it('rend faible, moyen puis fort selon la course parcourue, bornes comprises', () => {
    expect(forceLabel(MIN_TRAVEL_DEGREES)).toBe('faible')
    expect(forceLabel(MIN_TRAVEL_DEGREES + TRAVEL_SPAN_DEGREES / 3 - 1)).toBe('faible')
    expect(forceLabel(MIN_TRAVEL_DEGREES + TRAVEL_SPAN_DEGREES / 3)).toBe('moyen')
    expect(forceLabel(MIN_TRAVEL_DEGREES + (TRAVEL_SPAN_DEGREES * 2) / 3 - 1)).toBe('moyen')
    expect(forceLabel(MIN_TRAVEL_DEGREES + (TRAVEL_SPAN_DEGREES * 2) / 3)).toBe('fort')
    expect(forceLabel(MIN_TRAVEL_DEGREES + TRAVEL_SPAN_DEGREES)).toBe('fort')
  })
})

describe('normalizeDegrees', () => {
  it('ramène tout angle dans [0, 360), y compris les négatifs', () => {
    expect(normalizeDegrees(0)).toBe(0)
    expect(normalizeDegrees(360)).toBe(0)
    expect(normalizeDegrees(-15)).toBe(345)
    expect(normalizeDegrees(725)).toBe(5)
  })
})

describe('angleForLanding', () => {
  it('est l’inverse de resolveThrow : viser (index, offset) puis lancer d’exactement ce compte y ramène', () => {
    for (const index of [0, 5, 12, 23]) {
      for (const offset of [-4, 0, 4]) {
        const angle = angleForLanding(index, offset)
        const landing = resolveThrow(0, { spinId: 1, travel: angle + 720, durationMs: 3000 })
        expect(landing.index).toBe(index)
        expect(landing.offset).toBeCloseTo(offset, 6)
      }
    }
  })
})
