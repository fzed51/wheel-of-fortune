// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PuzzleForm from './PuzzleForm'
import { QUESTION_CATEGORY } from '../../game/bonus'
import { asPuzzleId } from '../../game/types'
import type { Puzzle } from '../../game/types'

/**
 * Rendu sans `Providers` : `PuzzleForm` ne connaît aucun contexte, c'est la
 * doctrine du projet — la route fait le câblage contexte → props.
 */
const CATEGORIES = ['Animaux', 'Cinéma', QUESTION_CATEGORY]

// Énoncé valide (10 à 42 caractères, consonnes et voyelles distinctes
// suffisantes, aucun caractère hors de ce que la grille affiche) réutilisé par
// tous les tests de la catégorie « Question » : `AUSTRALIE` en fin de chaîne
// sert aussi de doublure pour vérifier `bonus-in-answer`.
const QUESTION_ANSWER = "QUELLE EST LA CAPITALE DE L'AUSTRALIE"

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

  it('n’affiche aucun champ « Réponse attendue » pour une catégorie ordinaire', () => {
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={() => {}} onCancel={() => {}} />,
    )

    expect(screen.queryByLabelText('Réponse attendue')).not.toBeInTheDocument()
  })

  it('affiche le champ « Réponse attendue » dès que la catégorie Question est choisie', async () => {
    const user = userEvent.setup()
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={() => {}} onCancel={() => {}} />,
    )

    await user.selectOptions(screen.getByLabelText('Catégorie'), QUESTION_CATEGORY)

    expect(screen.getByLabelText('Réponse attendue')).toBeInTheDocument()
  })

  it('soumet une question complète, avec sa réponse attendue dans le brouillon', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={onSubmit} onCancel={() => {}} />,
    )

    await user.type(screen.getByLabelText('Énoncé'), QUESTION_ANSWER)
    await user.selectOptions(screen.getByLabelText('Catégorie'), QUESTION_CATEGORY)
    await user.type(screen.getByLabelText('Réponse attendue'), 'CANBERRA')
    await user.click(ajouterBouton())

    expect(onSubmit).toHaveBeenCalledWith({
      answer: QUESTION_ANSWER,
      category: QUESTION_CATEGORY,
      bonusAnswer: 'CANBERRA',
    })
  })

  it('refuse une question sans réponse attendue et affiche le message correspondant', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={onSubmit} onCancel={() => {}} />,
    )

    await user.type(screen.getByLabelText('Énoncé'), QUESTION_ANSWER)
    await user.selectOptions(screen.getByLabelText('Catégorie'), QUESTION_CATEGORY)
    await user.click(ajouterBouton())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Une question doit avoir une réponse attendue.')).toBeInTheDocument()
  })

  it('signale une réponse attendue qui figure déjà dans l’énoncé', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={onSubmit} onCancel={() => {}} />,
    )

    await user.type(screen.getByLabelText('Énoncé'), QUESTION_ANSWER)
    await user.selectOptions(screen.getByLabelText('Catégorie'), QUESTION_CATEGORY)
    // « AUSTRALIE » termine déjà QUESTION_ANSWER : la grille la révélerait.
    await user.type(screen.getByLabelText('Réponse attendue'), 'AUSTRALIE')
    await user.click(ajouterBouton())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(
      screen.getByText(
        'La réponse attendue ne doit pas figurer dans l’énoncé : la grille la révélerait lettre par lettre.',
      ),
    ).toBeInTheDocument()
  })

  it('retire la réponse attendue du brouillon si l’on rebascule sur une catégorie ordinaire avant de soumettre', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={onSubmit} onCancel={() => {}} />,
    )

    await user.type(screen.getByLabelText('Énoncé'), QUESTION_ANSWER)
    await user.selectOptions(screen.getByLabelText('Catégorie'), QUESTION_CATEGORY)
    await user.type(screen.getByLabelText('Réponse attendue'), 'CANBERRA')
    // Retour à une catégorie ordinaire : la réponse tapée doit disparaître du
    // brouillon, pas seulement de l'écran.
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Animaux')
    await user.click(ajouterBouton())

    expect(onSubmit).toHaveBeenCalledTimes(1)
    const draft = onSubmit.mock.calls[0]?.[0]
    expect(draft).toBeDefined()
    if (draft === undefined) return
    // `Object.hasOwn`, pas une comparaison à `undefined` : seul le premier
    // distingue « absent » de « présent et vide », distinction que
    // `saveCustomPuzzle` exploite pour ne jamais persister de clé fantôme.
    expect(Object.hasOwn(draft, 'bonusAnswer')).toBe(false)
  })

  it('rattache le message d’une réponse attendue manquante au champ « Réponse attendue », pas à la catégorie', async () => {
    const user = userEvent.setup()
    render(
      <PuzzleForm categories={CATEGORIES} initial={null} others={[]} onSubmit={() => {}} onCancel={() => {}} />,
    )

    await user.type(screen.getByLabelText('Énoncé'), QUESTION_ANSWER)
    await user.selectOptions(screen.getByLabelText('Catégorie'), QUESTION_CATEGORY)
    await user.click(ajouterBouton())

    const bonusField = screen.getByLabelText('Réponse attendue')
    const categoryField = screen.getByLabelText('Catégorie')
    const bonusDescribedBy = bonusField.getAttribute('aria-describedby')

    expect(bonusDescribedBy).not.toBeNull()
    if (bonusDescribedBy === null) return
    const bonusErrors = document.getElementById(bonusDescribedBy)
    expect(bonusErrors?.textContent).toContain('Une question doit avoir une réponse attendue.')

    // La catégorie elle-même n'a aucun problème (elle vaut « Question », ce qui
    // est valide) : sans le tri explicite par préfixe `category-`, le problème
    // `bonus-empty` s'y serait glissé et cette assertion tomberait.
    expect(categoryField.getAttribute('aria-describedby')).toBeNull()
  })
})
