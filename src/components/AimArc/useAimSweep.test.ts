// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { AIM_SWEEP_MS, useAimSweep } from './useAimSweep'
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
    const { result } = renderHook(() => useAimSweep('fast'))
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
    const { result } = renderHook(() => useAimSweep('fast'))

    expect(result.current.fire()).toBeNull()
  })

  it('cancel() remet la visée à faux', () => {
    const { result } = renderHook(() => useAimSweep('fast'))

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
    // Options passées à chaque appel de `animate()`, dans l'ordre : sert à
    // vérifier la durée réellement demandée sans dépendre d'un détail interne
    // du hook.
    let calls: KeyframeAnimationOptions[]

    beforeEach(() => {
      fakeAnimation = { currentTime: 0, cancel: vi.fn() }
      calls = []
      // jsdom ne connaît pas nativement `Element.prototype.animate` : on pose
      // un faux dont on contrôle `currentTime` à la main, seul champ que
      // `fire()` lit pour reconstruire l'onde triangulaire.
      Element.prototype.animate = vi.fn(
        (_keyframes: unknown, options: KeyframeAnimationOptions) => {
          calls.push(options)
          return fakeAnimation
        },
      ) as unknown as typeof Element.prototype.animate
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
      // Vitesse fixée à `slow` (2400 ms) : les mêmes fractions de la course
      // que le test historique (0, 1/4, 1, 5/4), mises à l'échelle de 2400 ms.
      [0, 0],
      [600, 90],
      // Demi-tour exact : `progress` vaut 1, et `1 × 360` doit sortir `0`,
      // pas `360` — c'est le rôle de `normalizeDegrees`.
      [2400, 0],
      // Sur le retour (sweepMs = 2400, donc un aller-retour dure 4800 ms) :
      // `t = 3000 / 2400 = 1.25`, au-delà de 1 donc sur le deuxième temps,
      // `progress = 2 - 1.25 = 0.75`, angle = 270°.
      [3000, 270],
    ])('rend %i° pour currentTime = %i ms', (currentTime, expectedAngle) => {
      const { result } = renderHook(() => useAimSweep('slow'))
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

    it('demande une durée d’animation conforme à la vitesse choisie', () => {
      // Mutation qui doit faire rougir ce test : inverser les vitesses dans
      // `AIM_SWEEP_MS`, ou faire lire une constante unique par `useAimSweep`
      // quelle que soit la vitesse demandée.
      const { result: slow } = renderHook(() => useAimSweep('slow'))
      act(() => {
        attachArc(slow.current)
        slow.current.start()
      })

      const { result: extreme } = renderHook(() => useAimSweep('extreme'))
      act(() => {
        attachArc(extreme.current)
        extreme.current.start()
      })

      expect(calls).toHaveLength(2)
      expect(calls[0]?.duration).toBe(AIM_SWEEP_MS.slow)
      expect(calls[1]?.duration).toBe(AIM_SWEEP_MS.extreme)
      expect(calls[0]?.duration).not.toBe(calls[1]?.duration)
    })

    it('ralentit sous mouvement réduit, par-dessus la vitesse choisie et non à sa place', () => {
      // Stub local, retiré en fin de test : le stub global de `src/test/setup.ts`
      // renvoie `matches: false` pour tout ce qui n'est pas la préférence de
      // couleur, exactement le cas qu'on veut ici forcer à vrai.
      const original = window.matchMedia
      window.matchMedia = vi.fn(
        (query: string) =>
          ({ matches: query.includes('prefers-reduced-motion') } as MediaQueryList),
      )

      const { result } = renderHook(() => useAimSweep('fast'))
      act(() => {
        attachArc(result.current)
        result.current.start()
      })

      window.matchMedia = original

      // Mutation qui doit faire rougir ce test : appliquer le facteur de
      // mouvement réduit à la place de la vitesse choisie plutôt que par-dessus
      // (le hook lirait alors une constante fixe, indépendante de `speed`).
      expect(calls).toHaveLength(1)
      const duration = calls[0]?.duration
      expect(duration).toBe(AIM_SWEEP_MS.fast * 2.5)
      expect(duration).not.toBe(AIM_SWEEP_MS.fast)
    })
  })

  it('rend l’angle de repli quand l’animation n’a pas pu être mesurée', () => {
    // Aucun faux posé ici : jsdom ne connaît pas `Element.prototype.animate`
    // par défaut, c'est exactement le chemin de repli que ce test vérifie.
    const { result } = renderHook(() => useAimSweep('fast'))

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
