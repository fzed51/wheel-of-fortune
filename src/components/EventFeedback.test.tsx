// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { monter } from '../test/app'
import EventFeedback from './EventFeedback'

describe('EventFeedback', () => {
  it('ne rend rien quand aucun évènement n’est à afficher', () => {
    const { container } = monter(<EventFeedback text={null} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('affiche la phrase du dernier évènement', () => {
    monter(<EventFeedback text="Pas de K. À vous de jouer." />)
    expect(screen.getByText('Pas de K. À vous de jouer.')).toBeInTheDocument()
  })

  it('ne crée aucune live region : les deux seules régions vivent dans LiveRegions', () => {
    // Une troisième région dédoublerait l'annonce et rendrait `role="status"`
    // ambigu pour les tests qui l'interrogent au singulier — invariant du
    // projet, pas une préférence : on vérifie donc explicitement son absence.
    monter(<EventFeedback text="Mauvaise réponse." />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})
