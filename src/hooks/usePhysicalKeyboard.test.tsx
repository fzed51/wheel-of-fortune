// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, renderHook } from '@testing-library/react'
import { usePhysicalKeyboard } from './usePhysicalKeyboard'
import type { PhysicalKeyboardActions } from './usePhysicalKeyboard'

/**
 * `user-event` combine mal avec les minuteurs factices (nécessaires pour le
 * test d'extinction de la lettre) : les événements clavier sont donc dispatchés
 * directement avec `fireEvent` dans tout ce fichier, par exception à la règle
 * du projet qui préfère `user-event`.
 */
function actions(patch: Partial<PhysicalKeyboardActions> = {}): PhysicalKeyboardActions {
  return {
    onLetter: vi.fn(),
    onSpin: vi.fn(),
    onResolve: vi.fn(),
    ...patch,
  }
}

// Éléments ajoutés directement au document (hors du rendu de `renderHook`),
// à retirer même si un test échoue avant son propre nettoyage.
let ajouts: readonly HTMLElement[] = []

function ajouter<T extends HTMLElement>(element: T): T {
  document.body.append(element)
  ajouts = [...ajouts, element]
  return element
}

afterEach(() => {
  for (const element of ajouts) element.remove()
  ajouts = []
  vi.useRealTimers()
})

describe('usePhysicalKeyboard', () => {
  it('appelle onLetter et allume la lettre pour une frappe normale', () => {
    const onLetter = vi.fn()
    const { result } = renderHook(() => usePhysicalKeyboard(actions({ onLetter })))

    fireEvent.keyDown(document.body, { key: 'a' })

    expect(onLetter).toHaveBeenCalledWith('A')
    expect(result.current).toBe('A')
  })

  it("n'appelle pas onLetter quand un input a le focus", () => {
    const input = ajouter(document.createElement('input'))
    const onLetter = vi.fn()
    renderHook(() => usePhysicalKeyboard(actions({ onLetter })))

    fireEvent.keyDown(input, { key: 'a' })

    expect(onLetter).not.toHaveBeenCalled()
  })

  it("n'appelle pas onLetter quand un dialog est ouvert", () => {
    const dialog = ajouter(document.createElement('dialog'))
    dialog.setAttribute('open', '')
    const onLetter = vi.fn()
    renderHook(() => usePhysicalKeyboard(actions({ onLetter })))

    fireEvent.keyDown(document.body, { key: 'a' })

    expect(onLetter).not.toHaveBeenCalled()
  })

  it('ignore une frappe accompagnée d’un modificateur', () => {
    const onLetter = vi.fn()
    renderHook(() => usePhysicalKeyboard(actions({ onLetter })))

    fireEvent.keyDown(document.body, { key: 'a', ctrlKey: true })
    fireEvent.keyDown(document.body, { key: 'a', altKey: true })
    fireEvent.keyDown(document.body, { key: 'a', metaKey: true })

    expect(onLetter).not.toHaveBeenCalled()
  })

  it('ignore une frappe répétée (touche maintenue)', () => {
    const onLetter = vi.fn()
    renderHook(() => usePhysicalKeyboard(actions({ onLetter })))

    fireEvent.keyDown(document.body, { key: 'a', repeat: true })

    expect(onLetter).not.toHaveBeenCalled()
  })

  it("Espace ne déclenche onSpin que si la cible est document.body, et empêche le défilement", () => {
    const onSpin = vi.fn()
    renderHook(() => usePhysicalKeyboard(actions({ onSpin })))
    const bouton = ajouter(document.createElement('button'))

    fireEvent.keyDown(bouton, { key: ' ' })
    expect(onSpin).not.toHaveBeenCalled()

    // `dispatchEvent` renvoie `false` quand `preventDefault` a été appelé.
    const nonAnnule = fireEvent.keyDown(document.body, { key: ' ' })
    expect(onSpin).toHaveBeenCalledTimes(1)
    expect(nonAnnule).toBe(false)
  })

  it("Entrée ne déclenche onResolve que si la cible est document.body", () => {
    const onResolve = vi.fn()
    renderHook(() => usePhysicalKeyboard(actions({ onResolve })))
    const bouton = ajouter(document.createElement('button'))

    fireEvent.keyDown(bouton, { key: 'Enter' })
    expect(onResolve).not.toHaveBeenCalled()

    fireEvent.keyDown(document.body, { key: 'Enter' })
    expect(onResolve).toHaveBeenCalledTimes(1)
  })

  it('efface la lettre allumée environ 200 ms après la frappe', () => {
    vi.useFakeTimers()
    const { result } = renderHook(() => usePhysicalKeyboard(actions()))

    fireEvent.keyDown(document.body, { key: 'a' })
    expect(result.current).toBe('A')

    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBeNull()
  })
})
