// @vitest-environment jsdom
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Controls from './Controls'

/**
 * Props par défaut : tout légal, hors charge. Chaque test ne change que ce
 * qui l'intéresse — ça évite de recopier huit props à chaque fois et fait
 * ressortir la prop réellement testée.
 */
function props(overrides: Partial<Parameters<typeof Controls>[0]> = {}) {
  return {
    canSpin: true,
    canResolve: true,
    canPass: true,
    vowelCost: 250,
    spinning: false,
    charging: false,
    markerRef: createRef<HTMLDivElement | null>(),
    onSpin: vi.fn(),
    onResolve: vi.fn(),
    onPass: vi.fn(),
    ...overrides,
  }
}

describe('Controls', () => {
  it('affiche « Lancer » au repos et « Stop » en charge', () => {
    const { rerender } = render(<Controls {...props({ charging: false })} />)
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()

    rerender(<Controls {...props({ charging: true })} />)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lancer' })).not.toBeInTheDocument()
  })

  it('en charge, le bouton de lancer reste actif même quand canSpin est faux', () => {
    // Preuve que l'arrêt de la jauge n'est jamais bloqué : la charge n'a pu
    // démarrer que sur un lancer légal, et `canSpin` peut changer sous elle
    // (par exemple si le tour venait à changer) sans que « Stop » ne se fige.
    render(<Controls {...props({ charging: true, canSpin: false, spinning: false })} />)

    expect(screen.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-disabled', 'false')
  })

  it('au repos, le bouton de lancer est estompé quand spinning ou canSpin est faux', () => {
    render(<Controls {...props({ charging: false, spinning: true })} />)

    expect(screen.getByRole('button', { name: 'Lancer' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('aucun bouton ne porte l’attribut natif disabled', () => {
    render(<Controls {...props({ charging: false, canSpin: false, canResolve: false, canPass: false })} />)

    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveAttribute('disabled')
    }
  })

  it('n’appelle pas onSpin quand le bouton de lancer est estompé', async () => {
    const onSpin = vi.fn()
    const user = userEvent.setup()
    render(<Controls {...props({ charging: false, canSpin: false, onSpin })} />)

    await user.click(screen.getByRole('button', { name: 'Lancer' }))

    expect(onSpin).not.toHaveBeenCalled()
  })
})
