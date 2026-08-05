// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PuzzleForm from './PuzzleForm'
import { asPuzzleId } from '../../game/types'
import type { Puzzle } from '../../game/types'

/**
 * Rendu sans `Providers` : `PuzzleForm` ne connaît aucun contexte, c'est la
 * doctrine du projet — la route fait le câblage contexte → props.
 */
const CATEGORIES = ['Animaux', 'Cinéma']

function puzzle(answer: string, category = 'Animaux'): Puzzle {
  return { id: asPuzzleId('perso-000'), answer, category, source: 'custom' }
}

function ajouterBouton(): HTMLElement {
  return screen.getByRole('button', { name: "Ajouter l'énigme" })
}

describe('PuzzleForm', () => {
  it('appelle onSubmit avec l’énoncé normalisé pour un ajout valide', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={onSubmit} onCancel={() => {}} />,
    )

    await user.type(screen.getByLabelText('Énoncé'), 'le chat noir')
    await user.click(ajouterBouton())

    expect(onSubmit).toHaveBeenCalledWith({ answer: 'LE CHAT NOIR', category: 'Animaux' })
  })

  it('n’appelle pas onSubmit pour un ajout invalide et affiche le message correspondant', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={onSubmit} onCancel={() => {}} />,
    )

    await user.type(screen.getByLabelText('Énoncé'), 'chat')
    await user.click(ajouterBouton())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Au moins 10 caractères.')).toBeInTheDocument()
  })

  it('n’affiche aucun message avant que le champ ait été quitté', async () => {
    const user = userEvent.setup()
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={() => {}} onCancel={() => {}} />,
    )

    await user.type(screen.getByLabelText('Énoncé'), 'chat')

    expect(screen.queryByText('Au moins 10 caractères.')).not.toBeInTheDocument()

    await user.tab()

    expect(screen.getByText('Au moins 10 caractères.')).toBeInTheDocument()
  })

  it('affiche un aperçu normalisé quand la frappe en diffère', async () => {
    const user = userEvent.setup()
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={() => {}} onCancel={() => {}} />,
    )

    await user.type(screen.getByLabelText('Énoncé'), 'le chat noir')

    expect(screen.getByText('Sera enregistré : LE CHAT NOIR')).toBeInTheDocument()
  })

  it('propose Enregistrer et Annuler quand le formulaire est prérempli pour une modification', () => {
    render(
      <PuzzleForm
        categories={CATEGORIES}
        initial={puzzle('LE CHAT NOIR')}
        others={[]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeInTheDocument()
    expect(screen.getByLabelText('Énoncé')).toHaveValue('LE CHAT NOIR')
  })

  it('remplace les valeurs des champs quand l’énigme à modifier change', () => {
    const { rerender } = render(
      <PuzzleForm
        categories={CATEGORIES}
        initial={puzzle('LE CHAT NOIR', 'Animaux')}
        others={[]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByLabelText('Énoncé')).toHaveValue('LE CHAT NOIR')

    rerender(
      <PuzzleForm
        categories={CATEGORIES}
        initial={puzzle('LE CHIEN BLANC', 'Cinéma')}
        others={[]}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    )

    expect(screen.getByLabelText('Énoncé')).toHaveValue('LE CHIEN BLANC')
    expect(screen.getByLabelText('Catégorie')).toHaveValue('Cinéma')
  })
})
