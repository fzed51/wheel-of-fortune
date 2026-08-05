// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ResolveDialog from './ResolveDialog'
import { announceJudgeFailure } from '../../game/announce'
import type { JudgeErrorReason } from '../../llm/judge'

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
 * ni le juge, ni le stockage — la doctrine du projet pour les composants
 * d'affichage, comme `PuzzleForm`.
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
      <ResolveDialog
        open={open}
        pending={false}
        failure={null}
        category="Objet"
        onSubmit={() => {}}
        onClose={() => setOpen(false)}
      />
    </>
  )
}

describe('ResolveDialog', () => {
  it('ouvre la boîte et focalise le champ de réponse', () => {
    render(
      <ResolveDialog open pending={false} failure={null} category="Objet" onSubmit={() => {}} onClose={() => {}} />,
    )

    expect(champReponse()).toHaveFocus()
  })

  it('appelle onSubmit avec la proposition élaguée', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ResolveDialog open pending={false} failure={null} category="Objet" onSubmit={onSubmit} onClose={() => {}} />,
    )

    await user.type(champReponse(), '  une chaise ')
    await user.click(boutonProposer())

    expect(onSubmit).toHaveBeenCalledWith('une chaise')
  })

  it("n'appelle pas onSubmit pour une proposition vide et affiche un message", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ResolveDialog open pending={false} failure={null} category="Objet" onSubmit={onSubmit} onClose={() => {}} />,
    )

    await user.click(boutonProposer())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByText('Tapez une réponse avant de la proposer.')).toBeInTheDocument()
  })

  it("verrouille le formulaire pendant l'attente et n'appelle plus onSubmit", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <ResolveDialog open pending failure={null} category="Objet" onSubmit={onSubmit} onClose={() => {}} />,
    )

    const formulaire = champReponse().closest('form')
    expect(formulaire).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByText(/Le juge examine votre réponse/u)).toBeInTheDocument()
    // Pas de bouton « Annuler » pendant l'attente : rien pour esquiver le verdict.
    expect(screen.queryByRole('button', { name: 'Annuler' })).not.toBeInTheDocument()

    await user.type(champReponse(), 'une chaise')
    await user.click(boutonProposer())

    expect(onSubmit).not.toHaveBeenCalled()
  })

  /*
   * Les quatre raisons doivent produire quatre phrases distinctes : « le juge
   * est injoignable » et « votre clé est refusée » n'appellent pas la même
   * action du joueur, et une phrase générique lui ferait chercher au mauvais
   * endroit. Les phrases elles-mêmes viennent de `announceJudgeFailure`, on ne
   * les recopie donc pas ici — c'est la source unique qui est vérifiée.
   */
  const RAISONS: readonly JudgeErrorReason[] = ['network', 'timeout', 'bad-response', 'unauthorized']

  for (const raison of RAISONS) {
    it(`affiche la phrase de l'échec « ${raison} », liée au champ`, () => {
      render(
        <ResolveDialog
          open
          pending={false}
          failure={raison}
          category="Objet"
          onSubmit={() => {}}
          onClose={() => {}}
        />,
      )

      const message = screen.getByText(announceJudgeFailure(raison))
      // Le message ne porte volontairement pas de live region : c'est ce lien
      // qui le fait lire, et sans lui il serait muet pour le lecteur d'écran.
      expect(champReponse()).toHaveAttribute('aria-describedby', message.id)
    })
  }

  it('donne quatre phrases différentes aux quatre raisons', () => {
    const phrases = new Set(RAISONS.map((raison) => announceJudgeFailure(raison)))
    expect(phrases.size).toBe(RAISONS.length)
  })

  it('remonte onClose quand le dialogue natif se ferme', () => {
    const onClose = vi.fn()
    const { container } = render(
      <ResolveDialog open pending={false} failure={null} category="Objet" onSubmit={() => {}} onClose={onClose} />,
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
