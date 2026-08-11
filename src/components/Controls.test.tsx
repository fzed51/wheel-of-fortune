// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Controls from './Controls'

/**
 * Props par défaut : tout légal, hors visée. Chaque test ne change que ce
 * qui l'intéresse — ça évite de recopier sept props à chaque fois et fait
 * ressortir la prop réellement testée.
 */
function props(overrides: Partial<Parameters<typeof Controls>[0]> = {}) {
  return {
    canSpin: true,
    canResolve: true,
    canPass: true,
    vowelCost: 250,
    spinning: false,
    aiming: false,
    spinLabel: 'Lancer',
    onSpin: vi.fn(),
    onResolve: vi.fn(),
    onPass: vi.fn(),
    ...overrides,
  }
}

describe('Controls', () => {
  it('affiche le libellé de lancer reçu en prop, tel quel', () => {
    // Le composant ne calcule plus ce libellé (mode de lancer, état de
    // visée) : il se contente de l'afficher, la route en décide.
    const { rerender } = render(<Controls {...props({ spinLabel: 'Tourner' })} />)
    expect(screen.getByRole('button', { name: 'Tourner' })).toBeInTheDocument()

    rerender(<Controls {...props({ spinLabel: 'Stop' })} />)
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tourner' })).not.toBeInTheDocument()
  })

  it('en visée, le bouton de lancer reste actif même quand canSpin est faux', () => {
    // Preuve que l'arrêt de l'arc n'est jamais bloqué : la visée n'a pu
    // démarrer que sur un lancer légal, et `canSpin` peut changer sous elle
    // (par exemple si le tour venait à changer) sans que « Stop » ne se fige.
    render(<Controls {...props({ aiming: true, canSpin: false, spinning: false, spinLabel: 'Stop' })} />)

    expect(screen.getByRole('button', { name: 'Stop' })).toHaveAttribute('aria-disabled', 'false')
  })

  it('au repos, le bouton de lancer est estompé quand spinning ou canSpin est faux', () => {
    render(<Controls {...props({ aiming: false, spinning: true })} />)

    expect(screen.getByRole('button', { name: 'Lancer' })).toHaveAttribute('aria-disabled', 'true')
  })

  it('aucun bouton ne porte l’attribut natif disabled', () => {
    render(<Controls {...props({ aiming: false, canSpin: false, canResolve: false, canPass: false })} />)

    for (const button of screen.getAllByRole('button')) {
      expect(button).not.toHaveAttribute('disabled')
    }
  })

  it('n’appelle pas onSpin quand le bouton de lancer est estompé', async () => {
    const onSpin = vi.fn()
    const user = userEvent.setup()
    render(<Controls {...props({ aiming: false, canSpin: false, onSpin })} />)

    await user.click(screen.getByRole('button', { name: 'Lancer' }))

    expect(onSpin).not.toHaveBeenCalled()
  })
})
