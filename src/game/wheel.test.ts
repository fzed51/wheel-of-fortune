import { describe, expect, it } from 'vitest'
import { SEGMENT_ANGLE, SEGMENT_COUNT, WHEEL, pickSpinOutcome, segmentAt } from './wheel'

describe('WHEEL', () => {
  it('compte 24 segments de 15 degrés', () => {
    expect(SEGMENT_COUNT).toBe(24)
    expect(WHEEL).toHaveLength(24)
    expect(SEGMENT_ANGLE).toBe(15)
  })

  it('contient exactement deux banqueroutes et deux passes', () => {
    expect(WHEEL.filter((s) => s.kind === 'bankrupt')).toHaveLength(2)
    expect(WHEEL.filter((s) => s.kind === 'pass')).toHaveLength(2)
  })

  it('donne à chaque segment un index égal à sa position', () => {
    WHEEL.forEach((segment, position) => {
      expect(segment.index).toBe(position)
    })
  })

  it('n’a que des montants strictement positifs sur les segments payants', () => {
    for (const segment of WHEEL) {
      if (segment.kind === 'cash') expect(segment.value).toBeGreaterThan(0)
    }
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
