import { describe, expect, it } from 'vitest'
import {
  AIM_ARC_DEGREES,
  AIM_SPAN_DEGREES,
  BANKRUPT_COUNT,
  JITTER_DEGREES,
  MIN_TRAVEL_DEGREES,
  PASS_COUNT,
  SEGMENT_ANGLE,
  SEGMENT_COUNT,
  SPIN_MAX_MS,
  SPIN_MIN_MS,
  WHEEL,
  ZERO_COUNT,
  angleForLanding,
  normalizeDegrees,
  randomAim,
  resolveThrow,
  segmentAt,
  throwFromAim,
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
      const travel = MIN_TRAVEL_DEGREES + ((i * 293) % 2000) + ((i % 17) - 8)
      const landing = resolveThrow(fromAngle, { spinId: i, travel, durationMs: 3000 })
      expect(Math.abs(landing.offset)).toBeLessThanOrEqual(OFFSET_BOUND + 1e-9)
    }
  })

  it('ne corrige la course que de la marge autorisée, jamais plus', () => {
    for (let i = 0; i < 500; i += 1) {
      const fromAngle = (i * 53) % 360
      const travel = MIN_TRAVEL_DEGREES + ((i * 31) % 1440)
      const thrown = { spinId: i, travel, durationMs: 3000 }
      const landing = resolveThrow(fromAngle, thrown)
      expect(Math.abs(landing.travel - thrown.travel)).toBeLessThanOrEqual(2)
    }
  })
})

describe('randomAim', () => {
  it('reste dans [0, 360) aux deux extrêmes de rng', () => {
    expect(randomAim(() => 0)).toBe(0)
    // Un générateur réel rend des valeurs dans [0, 1), jamais 1 pile : on
    // s'approche de la borne haute sans jamais l'atteindre.
    const proche = randomAim(() => 1 - 1e-9)
    expect(proche).toBeGreaterThanOrEqual(0)
    expect(proche).toBeLessThan(AIM_SPAN_DEGREES)
  })
})

describe('throwFromAim', () => {
  it('amène sous l’aiguille le segment qui se trouvait à l’angle visé, quel que soit l’angle de repos', () => {
    // rng constant à 0,5 ⇒ jitter nul (voir la formule de throwFromAim) : le
    // lancer doit alors être exact, sans l'imprécision humaine. L'attendu est
    // calculé ici à partir de la géométrie de l'énoncé, sans jamais rappeler
    // throwFromAim — sinon le test ne prouverait rien.
    const rng = () => 0.5
    const aims = [0, 7, 44.9, 90, 179.9, 268, 340]
    for (const fromAngle of START_ANGLES) {
      for (const aim of aims) {
        const expectedIndex = Math.floor(normalizeDegrees(aim - fromAngle) / SEGMENT_ANGLE)
        const thrown = throwFromAim(aim, rng, 1)
        const landing = resolveThrow(fromAngle, thrown)
        expect(landing.index).toBe(expectedIndex)
      }
    }
  })

  it('borne l’erreur du lancer à une case, aux deux extrêmes de l’imprécision humaine', () => {
    for (let aim = 0; aim < 360; aim += 11) {
      for (const rng of [() => 0, () => 1]) {
        const thrown = throwFromAim(aim, rng, 1)
        // Repère fixe (fromAngle = 0) : la démonstration du module montre que
        // l'angle de repos n'entre pas dans le résultat, inutile de le varier ici.
        const achieved = normalizeDegrees(-normalizeDegrees(thrown.travel))
        const target = normalizeDegrees(aim)
        const ecart = normalizeDegrees(achieved - target)
        const repli = ecart > 180 ? ecart - 360 : ecart
        expect(Math.abs(repli)).toBeLessThanOrEqual(JITTER_DEGREES + 1e-9)
      }
    }
  })

  it('AIM_ARC_DEGREES vaut deux fois l’erreur maximale, et couvre donc tout l’éventail des atterrissages', () => {
    expect(AIM_ARC_DEGREES).toBe(2 * JITTER_DEGREES)
    // Les deux bornes de rng doivent produire l'erreur maximale de part et
    // d'autre de la cible : si l'arc dessiné était plus étroit que ça, il
    // mentirait sur ce que le joueur peut espérer.
    const aim = 123
    const target = normalizeDegrees(aim)
    const bas = throwFromAim(aim, () => 0, 1)
    const haut = throwFromAim(aim, () => 1, 1)
    const achieveBas = normalizeDegrees(-normalizeDegrees(bas.travel))
    const achieveHaut = normalizeDegrees(-normalizeDegrees(haut.travel))
    const replier = (v: number): number => {
      const ecart = normalizeDegrees(v - target)
      return ecart > 180 ? ecart - 360 : ecart
    }
    const total = Math.abs(replier(achieveBas)) + Math.abs(replier(achieveHaut))
    expect(total).toBeCloseTo(AIM_ARC_DEGREES, 6)
  })

  it('respecte les bornes de durée pour tout angle visé et tout tirage', () => {
    for (let aim = 0; aim < 360; aim += 7) {
      for (const rng of [() => 0, () => 0.5, () => 1]) {
        const thrown = throwFromAim(aim, rng, 1)
        expect(thrown.durationMs).toBeGreaterThanOrEqual(SPIN_MIN_MS)
        expect(thrown.durationMs).toBeLessThanOrEqual(SPIN_MAX_MS)
      }
    }
  })

  it('ne descend jamais sous le plancher moins l’erreur, quel que soit l’angle visé', () => {
    for (let aim = 0; aim < 360; aim += 7) {
      for (const rng of [() => 0, () => 0.5, () => 1]) {
        const thrown = throwFromAim(aim, rng, 1)
        expect(thrown.travel).toBeGreaterThanOrEqual(MIN_TRAVEL_DEGREES - JITTER_DEGREES - 1e-9)
      }
    }
  })

  it('normalise son entrée : -90, 270 et 630 rendent le même lancer', () => {
    const rng = () => 0.5
    const a = throwFromAim(-90, rng, 1)
    const b = throwFromAim(270, rng, 1)
    const c = throwFromAim(630, rng, 1)
    expect(b.travel).toBeCloseTo(a.travel, 9)
    expect(c.travel).toBeCloseTo(a.travel, 9)
    expect(b.durationMs).toBe(a.durationMs)
    expect(c.durationMs).toBe(a.durationMs)
  })

  it('recopie le spinId reçu, et ne consomme le générateur qu’une seule fois', () => {
    let calls = 0
    const rng = () => {
      calls += 1
      return 0.5
    }
    const thrown = throwFromAim(42, rng, 9)
    expect(thrown.spinId).toBe(9)
    expect(calls).toBe(1)
  })
})

describe('couverture des lancers', () => {
  it('atteint les 24 cases depuis chaque angle de départ, en balayant les angles visés', () => {
    for (const fromAngle of START_ANGLES) {
      const seen = new Set<number>()
      for (let i = 0; i < 500; i += 1) {
        const aim = (i / 500) * 360
        const thrown = throwFromAim(aim, () => (i % 7) / 7, i)
        seen.add(resolveThrow(fromAngle, thrown).index)
      }
      expect(seen.size).toBe(SEGMENT_COUNT)
    }
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

  it('reste dans [0, 360) pour les 24 segments, aux deux bornes du décalage', () => {
    for (let index = 0; index < SEGMENT_COUNT; index += 1) {
      for (const offset of [6.5, -6.5]) {
        const angle = angleForLanding(index, offset)
        expect(angle).toBeGreaterThanOrEqual(0)
        expect(angle).toBeLessThan(360)
      }
    }
  })

  it('vaut la valeur attendue pour le segment 0 et le segment 6 sans décalage', () => {
    expect(angleForLanding(0, 0)).toBeCloseTo(352.5)
    expect(angleForLanding(6, 0)).toBeCloseTo(262.5)
  })
})
