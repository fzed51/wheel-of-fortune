// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import LiveRegions from './LiveRegions'
import { AnnouncerProvider } from '../context/AnnouncerProvider'
import { useAnnouncer } from '../hooks/useAnnouncer'

/**
 * `AnnouncerProvider` ne touche à aucun stockage : rien à nettoyer en `beforeEach`
 * ici, contrairement aux tests qui passent par `persist.ts`.
 */

/** Sonde : déclenche `say`/`warn`/`clearAlert` depuis des boutons de test. */
function Sonde() {
  const { say, warn, clearAlert } = useAnnouncer()
  return (
    <>
      <button type="button" onClick={() => say('Au tour de Bot 1.')}>
        dire
      </button>
      <button type="button" onClick={() => warn('La clé Mistral est invalide.')}>
        avertir
      </button>
      <button type="button" onClick={clearAlert}>
        effacer l'alerte
      </button>
    </>
  )
}

function monterLesRegions() {
  return render(
    <AnnouncerProvider>
      <LiveRegions />
      <Sonde />
    </AnnouncerProvider>,
  )
}

describe('LiveRegions', () => {
  it('monte la région de statut dès le départ, avant tout message', () => {
    monterLesRegions()

    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('affiche le message de « say » dans le statut, pas dans l’alerte', async () => {
    const user = userEvent.setup()
    monterLesRegions()

    await user.click(screen.getByRole('button', { name: 'dire' }))

    expect(screen.getByRole('status')).toHaveTextContent('Au tour de Bot 1.')
    expect(screen.getByRole('alert')).toHaveTextContent('')
  })

  it('affiche le message de « warn » dans l’alerte', async () => {
    const user = userEvent.setup()
    monterLesRegions()

    await user.click(screen.getByRole('button', { name: 'avertir' }))

    expect(screen.getByRole('alert')).toHaveTextContent('La clé Mistral est invalide.')
  })

  it('remonte le nœud interne quand le même texte est annoncé deux fois de suite', async () => {
    const user = userEvent.setup()
    monterLesRegions()

    const bouton = screen.getByRole('button', { name: 'dire' })
    await user.click(bouton)

    // Deux annonces identiques d'affilée : une live region ne rediffuse pas un texte
    // inchangé, donc le nœud interne doit se remonter (identité DOM différente) pour
    // que le lecteur d'écran relise le message.
    const noeudAvant = screen.getByRole('status').firstElementChild
    await user.click(bouton)
    const noeudApres = screen.getByRole('status').firstElementChild

    expect(noeudAvant).not.toBeNull()
    expect(noeudApres).not.toBeNull()
    expect(noeudApres).not.toBe(noeudAvant)
    expect(screen.getByRole('status')).toHaveTextContent('Au tour de Bot 1.')
  })

  it('vide l’alerte sur « clearAlert » sans démonter la région', async () => {
    const user = userEvent.setup()
    monterLesRegions()

    await user.click(screen.getByRole('button', { name: 'avertir' }))
    expect(screen.getByRole('alert')).toHaveTextContent('La clé Mistral est invalide.')

    await user.click(screen.getByRole('button', { name: "effacer l'alerte" }))

    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('')
  })
})
