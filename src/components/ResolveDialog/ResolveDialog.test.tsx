// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResolveDialog from './ResolveDialog'

/**
 * jsdom (30.0.1, utilisé ici) réagit à l'attribut `open` mais n'implémente ni
 * `showModal()` ni `close()` sur `HTMLDialogElement` : sans ce stub, tout
 * appel de `showModal()` lève un `TypeError`. Stub minimal, réservé à ce
 * fichier de test — le composant, lui, appelle l'API standard.
 */
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  let previouslyFocused: HTMLElement | null = null

  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement): void {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.open = true
  }

  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement): void {
    this.open = false
    this.dispatchEvent(new Event('close'))
    previouslyFocused?.focus()
    previouslyFocused = null
  }
}

/**
 * Rendu sans `Providers` : `ResolveDialog` ne connaît ni le contexte de jeu,
 * ni le moteur de règles, ni le stockage — la doctrine du projet pour les
 * composants d'affichage, comme `PuzzleForm`.
 */
function champReponse(): HTMLElement {
  return screen.getByLabelText('Votre réponse')
}

function boutonProposer(): HTMLElement {
  return screen.getByRole('button', { name: 'Proposer' })
}

/** Hôte minimal, pour vérifier que le natif rend le focus au déclencheur. */
function Hote() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Résoudre
      </button>
      <ResolveDialog open={open} category="Objet" onSubmit={() => {}} onClose={() => setOpen(false)} />
    </>
  )
}

describe('ResolveDialog', () => {
  it('ouvre la boîte et focalise le champ de réponse', () => {
    render(<ResolveDialog open category="Objet" onSubmit={() => {}} onClose={() => {}} />)

    expect(champReponse()).toHaveFocus()
  })

  it('appelle onSubmit avec la proposition élaguée', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ResolveDialog open category="Objet" onSubmit={onSubmit} onClose={() => {}} />)

    await user.type(champReponse(), '  une chaise ')
    await user.click(boutonProposer())

    expect(onSubmit).toHaveBeenCalledWith('une chaise')
  })

  it("n'appelle pas onSubmit pour une proposition vide et affiche un message", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(<ResolveDialog open category="Objet" onSubmit={onSubmit} onClose={() => {}} />)

    await user.click(boutonProposer())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Tapez une réponse avant de la proposer.')).toBeInTheDocument()
  })

  it('ferme le dialogue à la soumission', async () => {
    // Le verdict est désormais synchrone : que la manche soit gagnée ou que
    // la main passe au joueur suivant, la boîte n'a plus de raison de rester
    // ouverte — contrairement à l'ancien attente du juge, elle se refermait
    // seule à la réception d'un verdict.
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ResolveDialog open category="Objet" onSubmit={() => {}} onClose={onClose} />)

    await user.type(champReponse(), 'une chaise')
    await user.click(boutonProposer())

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ne ferme pas le dialogue pour une proposition vide', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    render(<ResolveDialog open category="Objet" onSubmit={() => {}} onClose={onClose} />)

    await user.click(boutonProposer())

    expect(onClose).not.toHaveBeenCalled()
  })

  it('remonte onClose quand le dialogue natif se ferme', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ResolveDialog open category="Objet" onSubmit={() => {}} onClose={onClose} />,
    )

    // `querySelector('dialog')` plutôt qu'un rôle : on a besoin de l'API
    // impérative native `close()`, pas d'une assertion sur le contenu.
    const dialogue = container.querySelector('dialog')
    expect(dialogue).not.toBeNull()

    act(() => {
      dialogue?.close()
    })

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('passe par le dialogue natif pour ouvrir et fermer, jusqu’au retour du focus', async () => {
    const user = userEvent.setup()
    render(<Hote />)

    const declencheur = screen.getByRole('button', { name: 'Résoudre' })
    await user.click(declencheur)

    expect(champReponse()).toHaveFocus()

    const dialogue = document.querySelector('dialog')
    act(() => {
      dialogue?.close()
    })

    /*
     * Le retour du focus est ici l'œuvre du stub, pas du vrai `<dialog>` :
     * jsdom n'implémente pas le top-layer, aucun test en environnement simulé
     * ne peut donc prouver le comportement natif. Ce que ce test prouve, et
     * c'est déjà l'essentiel, c'est que le composant passe bien par l'API
     * impérative du dialogue — `showModal()` à l'ouverture, l'évènement `close`
     * au retour — plutôt que par un affichage maison. Un remplacement par une
     * `div` casserait ce test, et c'est exactement ce qu'on veut empêcher : la
     * gestion du focus serait alors à réécrire à la main.
     */
    expect(declencheur).toHaveFocus()
  })
})
