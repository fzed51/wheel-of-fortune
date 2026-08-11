// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import BonusQuestion from './BonusQuestion'

/**
 * Rendu sans `Providers` : `BonusQuestion` ne connaît ni le contexte de jeu,
 * ni le moteur de règles — purement piloté par les props, comme `ResolveDialog`.
 */
function champReponse(): HTMLElement {
  return screen.getByLabelText('Votre réponse')
}

function boutonRepondre(): HTMLElement {
  return screen.getByRole('button', { name: 'Répondre' })
}

function boutonPasser(): HTMLElement {
  return screen.getByRole('button', { name: 'Passer' })
}

describe('BonusQuestion', () => {
  it('affiche la question et le montant, jamais la réponse attendue', () => {
    render(
      <BonusQuestion
        question="Quel est le plus long fleuve de France ?"
        playerName="Alice"
        prize="500 €"
        pending={false}
        failure={null}
        botTurn={false}
        onSubmit={() => {}}
        onSkip={() => {}}
      />,
    )

    // La réponse attendue (« la Loire », par exemple) n'est reçue par aucune
    // prop : ce test échouerait si une future évolution ajoutait une prop
    // `expected` affichée quelque part sur cet écran.
    expect(screen.getByText('Quel est le plus long fleuve de France ?')).toBeInTheDocument()
    expect(screen.getByText(/500 €/)).toBeInTheDocument()
    expect(screen.queryByText(/loire/i)).not.toBeInTheDocument()
  })

  it('appelle onSubmit avec la réponse élaguée', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <BonusQuestion
        question="Une question"
        playerName="Alice"
        prize="500 €"
        pending={false}
        failure={null}
        botTurn={false}
        onSubmit={onSubmit}
        onSkip={() => {}}
      />,
    )

    await user.type(champReponse(), '  la loire ')
    await user.click(boutonRepondre())

    expect(onSubmit).toHaveBeenCalledWith('la loire')
  })

  it("n'appelle pas onSubmit pour une réponse vide et affiche un message lié au champ", async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    render(
      <BonusQuestion
        question="Une question"
        playerName="Alice"
        prize="500 €"
        pending={false}
        failure={null}
        botTurn={false}
        onSubmit={onSubmit}
        onSkip={() => {}}
      />,
    )

    await user.click(boutonRepondre())

    expect(onSubmit).not.toHaveBeenCalled()
    const erreur = screen.getByText('Tapez une réponse avant de la proposer.')
    expect(erreur).toBeInTheDocument()
    expect(champReponse().getAttribute('aria-describedby')).toContain(erreur.id)
  })

  it('« Passer » appelle onSkip', async () => {
    const user = userEvent.setup()
    const onSkip = vi.fn()
    render(
      <BonusQuestion
        question="Une question"
        playerName="Alice"
        prize="500 €"
        pending={false}
        failure={null}
        botTurn={false}
        onSubmit={() => {}}
        onSkip={onSkip}
      />,
    )

    await user.click(boutonPasser())

    expect(onSkip).toHaveBeenCalledTimes(1)
  })

  it('pendant le verdict, les boutons sont aria-disabled, un clic ne fait rien et la frappe reste affichée', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onSkip = vi.fn()
    render(
      <BonusQuestion
        question="Une question"
        playerName="Alice"
        prize="500 €"
        pending
        failure={null}
        botTurn={false}
        onSubmit={onSubmit}
        onSkip={onSkip}
      />,
    )

    expect(boutonRepondre()).toHaveAttribute('aria-disabled', 'true')
    expect(boutonRepondre()).not.toHaveAttribute('disabled')
    expect(boutonPasser()).toHaveAttribute('aria-disabled', 'true')
    expect(boutonPasser()).not.toHaveAttribute('disabled')

    await user.click(boutonRepondre())
    await user.click(boutonPasser())

    expect(onSubmit).not.toHaveBeenCalled()
    expect(onSkip).not.toHaveBeenCalled()
    expect(screen.getByText('Le juge examine votre réponse…')).toBeInTheDocument()
  })

  it('le champ de réponse passe en lecture seule pendant le verdict, redevient modifiable sinon', () => {
    const { rerender } = render(
      <BonusQuestion
        question="Une question"
        playerName="Alice"
        prize="500 €"
        pending={false}
        failure={null}
        botTurn={false}
        onSubmit={() => {}}
        onSkip={() => {}}
      />,
    )

    expect(champReponse()).not.toHaveAttribute('readonly')

    rerender(
      <BonusQuestion
        question="Une question"
        playerName="Alice"
        prize="500 €"
        pending
        failure={null}
        botTurn={false}
        onSubmit={() => {}}
        onSkip={() => {}}
      />,
    )

    expect(champReponse()).toHaveAttribute('readonly')
  })

  it('garde la frappe déjà saisie pendant le verdict', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <BonusQuestion
        question="Une question"
        playerName="Alice"
        prize="500 €"
        pending={false}
        failure={null}
        botTurn={false}
        onSubmit={() => {}}
        onSkip={() => {}}
      />,
    )

    await user.type(champReponse(), 'la loire')

    // Même instance de composant, seul `pending` change : le champ garde son
    // état interne. Si le juge échoue après coup, le joueur retrouve sa
    // frappe au lieu d'avoir à la retaper — contrairement à `ResolveDialog`,
    // qui repart de zéro à la fermeture.
    rerender(
      <BonusQuestion
        question="Une question"
        playerName="Alice"
        prize="500 €"
        pending
        failure={null}
        botTurn={false}
        onSubmit={() => {}}
        onSkip={() => {}}
      />,
    )

    expect((champReponse() as HTMLInputElement).value).toBe('la loire')
  })

  it('affiche la phrase d’échec du juge correspondant à la raison', () => {
    render(
      <BonusQuestion
        question="Une question"
        playerName="Alice"
        prize="500 €"
        pending={false}
        failure="unauthorized"
        botTurn={false}
        onSubmit={() => {}}
        onSkip={() => {}}
      />,
    )

    expect(screen.getByText("Clé d'API refusée. Vérifiez-la dans les Réglages.")).toBeInTheDocument()
  })

  it("pendant le tour d'un bot, aucun champ ni bouton « Répondre », seulement son nom", () => {
    render(
      <BonusQuestion
        question="Une question"
        playerName="Bob"
        prize="500 €"
        pending={false}
        failure={null}
        botTurn
        onSubmit={() => {}}
        onSkip={() => {}}
      />,
    )

    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Répondre' })).not.toBeInTheDocument()
    expect(screen.getByText('Bob répond à la question bonus.')).toBeInTheDocument()
  })
})
