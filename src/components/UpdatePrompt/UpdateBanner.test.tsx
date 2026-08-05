// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import UpdateBanner, { UPDATE_MESSAGE } from './UpdateBanner'

/** Nom accessible du repère, seul moyen de désigner la bannière sans classe CSS. */
const REPERE = 'Mise à jour disponible'

describe('UpdateBanner', () => {
  it('n’affiche rien quand aucune mise à jour n’est en attente', () => {
    render(<UpdateBanner needRefresh={false} onUpdate={() => {}} onDismiss={() => {}} />)

    expect(screen.queryByRole('region', { name: REPERE })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mettre à jour' })).not.toBeInTheDocument()
  })

  it('affiche le message et les deux boutons quand une mise à jour est disponible', () => {
    render(<UpdateBanner needRefresh onUpdate={() => {}} onDismiss={() => {}} />)

    expect(screen.getByRole('region', { name: REPERE })).toHaveTextContent(UPDATE_MESSAGE)
    expect(screen.getByRole('button', { name: 'Mettre à jour' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plus tard' })).toBeInTheDocument()
  })

  // La bannière n'est délibérément pas une live region : l'annonce aux lecteurs
  // d'écran passe par celle du layout, alimentée par `UpdatePrompt`. Ce test
  // affirme donc l'absence de doublon, que trois autres fichiers supposent en
  // interrogeant `role="status"` comme s'il n'y en avait qu'un.
  it('ne crée pas de seconde live region', () => {
    render(<UpdateBanner needRefresh onUpdate={() => {}} onDismiss={() => {}} />)

    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('appelle « onUpdate » une fois au clic sur « Mettre à jour »', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(<UpdateBanner needRefresh onUpdate={onUpdate} onDismiss={() => {}} />)

    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }))

    expect(onUpdate).toHaveBeenCalledTimes(1)
  })

  it('appelle « onDismiss » une fois au clic sur « Plus tard »', async () => {
    const user = userEvent.setup()
    const onDismiss = vi.fn()
    render(<UpdateBanner needRefresh onUpdate={() => {}} onDismiss={onDismiss} />)

    await user.click(screen.getByRole('button', { name: 'Plus tard' }))

    expect(onDismiss).toHaveBeenCalledTimes(1)
  })
})
