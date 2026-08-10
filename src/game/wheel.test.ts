import { describe, expect, it } from 'vitest'
import {
  BANKRUPT_COUNT,
  PASS_COUNT,
  SEGMENT_ANGLE,
  SEGMENT_COUNT,
  WHEEL,
  ZERO_COUNT,
  pickSpinOutcome,
  segmentAt,
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

describe('pickSpinOutcome', () => {
  it('reste dans les bornes de la roue, même aux valeurs extrêmes du générateur', () => {
    for (const value of [0, 0.5, 0.999_999, 1]) {
      const outcome = pickSpinOutcome(() => value, 1)
      expect(outcome.index).toBeGreaterThanOrEqual(0)
      expect(outcome.index).toBeLessThan(SEGMENT_COUNT)
      expect(Math.abs(outcome.offset)).toBeLessThan(SEGMENT_ANGLE / 2)
    }
  })

  it('reporte le spinId reçu', () => {
    expect(pickSpinOutcome(() => 0.5, 42).spinId).toBe(42)
  })

  it('couvre toute la roue sur une séquence uniforme', () => {
    const seen = new Set<number>()
    for (let i = 0; i < SEGMENT_COUNT; i += 1) {
      seen.add(pickSpinOutcome(() => i / SEGMENT_COUNT, i).index)
    }
    expect(seen.size).toBe(SEGMENT_COUNT)
  })
})
