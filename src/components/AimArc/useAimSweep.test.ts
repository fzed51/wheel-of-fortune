// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useAimSweep } from './useAimSweep'
import { AIM_SPAN_DEGREES } from '../../game/wheel'

/**
 * `useAimSweep` ne monte son nœud que via `AimArc`, jamais monté ici puisque
 * ce fichier n'exerce que le hook (`renderHook`, comme ailleurs dans le
 * dépôt — voir `GameProvider.test.tsx`). L'assignation manuelle de
 * `arcRef.current` reproduit ce que ferait le montage conditionnel réel :
 * un vrai nœud DOM, présent avant que l'effet ne s'exécute.
 */
function attachArc<T extends { readonly arcRef: { current: HTMLDivElement | null } }>(hook: T): void {
  hook.arcRef.current = document.createElement('div')
}

describe('useAimSweep', () => {
  it('suit la machine à trois temps : repos, visée, tir', () => {
    const { result } = renderHook(() => useAimSweep())
    expect(result.current.aiming).toBe(false)

    act(() => {
      attachArc(result.current)
      result.current.start()
    })
    expect(result.current.aiming).toBe(true)

    act(() => {
      result.current.fire()
    })
    expect(result.current.aiming).toBe(false)
  })

  it('fire() sans visée en cours rend null', () => {
    const { result } = renderHook(() => useAimSweep())

    expect(result.current.fire()).toBeNull()
  })

  it('cancel() remet la visée à faux', () => {
    const { result } = renderHook(() => useAimSweep())

    act(() => {
      attachArc(result.current)
      result.current.start()
    })
    act(() => {
      result.current.cancel()
    })

    expect(result.current.aiming).toBe(false)
  })

  describe('avec la Web Animations API', () => {
    interface FakeAnimation {
      currentTime: number | null
      readonly cancel: () => void
    }

    let fakeAnimation: FakeAnimation

    beforeEach(() => {
      fakeAnimation = { currentTime: 0, cancel: vi.fn() }
      // jsdom ne connaît pas nativement `Element.prototype.animate` : on pose
      // un faux dont on contrôle `currentTime` à la main, seul champ que
      // `fire()` lit pour reconstruire l'onde triangulaire.
      Element.prototype.animate = vi.fn(() => fakeAnimation) as unknown as typeof Element.prototype.animate
    })

    afterEach(() => {
      // Retire le faux plutôt que de restaurer une référence à
      // `Element.prototype.animate` : y accéder sans l'appeler expose à
      // `typescript/unbound-method`, et jsdom ne le définit de toute façon
      // pas nativement — il n'y a rien à restaurer.
      delete (Element.prototype as { animate?: unknown }).animate
    })

    it.each([
      // [currentTime en ms, angle attendu en degrés]
      [0, 0],
      [450, 90],
      // Demi-tour exact : `progress` vaut 1, et `1 × 360` doit sortir `0`,
      // pas `360` — c'est le rôle de `normalizeDegrees`.
      [1800, 0],
      // Sur le retour (`AIM_SWEEP_MS = 1800`, donc un aller-retour dure
      // 3600 ms) : `t = 2250 / 1800 = 1.25`, au-delà de 1 donc sur le
      // deuxième temps, `progress = 2 - 1.25 = 0.75`, angle = 270°.
      [2250, 270],
    ])('rend %i° pour currentTime = %i ms', (currentTime, expectedAngle) => {
      const { result } = renderHook(() => useAimSweep())
      act(() => {
        attachArc(result.current)
        result.current.start()
      })
      fakeAnimation.currentTime = currentTime

      let angle: number | null = null
      act(() => {
        angle = result.current.fire()
      })

      expect(angle).toBeCloseTo(expectedAngle)
    })
  })

  it('rend l’angle de repli quand l’animation n’a pas pu être mesurée', () => {
    // Aucun faux posé ici : jsdom ne connaît pas `Element.prototype.animate`
    // par défaut, c'est exactement le chemin de repli que ce test vérifie.
    const { result } = renderHook(() => useAimSweep())

    act(() => {
      attachArc(result.current)
      result.current.start()
    })

    let angle: number | null = null
    act(() => {
      angle = result.current.fire()
    })

    expect(angle).toBe(AIM_SPAN_DEGREES / 2)
  })
})
