// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearAllData, saveGame } from '../storage/persist'
import { avecPhase, cash, demarrer, jeu, joueur, resoudre } from '../test/game'
import { monterApp } from '../test/app'

/**
 * Écran de jeu. Aucune assertion ne dépend de l'énigme tirée ni du segment de
 * roue obtenu : l'aléa est semé sur l'horloge, ce serait un test instable.
 */
beforeEach(() => {
  // `persist.ts` garde un repli en mémoire que `localStorage.clear()` seul
  // n'atteint pas : sans les deux, la sauvegarde d'un test précédent réapparaît.
  clearAllData()
  localStorage.clear()
})

describe('GameRoute', () => {
  it('affiche le plateau, les 26 touches, les scores et les commandes', () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice'), joueur('Bob')] })))
    monterApp('/jeu')

    expect(screen.getByText('Catégorie : Test')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Clavier des lettres' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Lettre /u })).toHaveLength(26)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tourner' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Résoudre' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Passer la main' })).toBeInTheDocument()
  })

  /**
   * `avecPhase` place la manche en `awaiting-consonant` : sans ce tirage déjà
   * fait, une frappe de consonne serait illégale (`locked`) et ne prouverait
   * rien. « LE VENT » contient un T, donc la lettre est bien jouée et pas
   * seulement tentée.
   */
  it('la frappe d’une consonne au clavier physique la marque comme jouée sur le clavier virtuel', () => {
    const enManche = avecPhase(demarrer({ players: [joueur('Alice')] }), {
      kind: 'awaiting-consonant',
      value: 300,
      segment: { kind: 'cash', index: cash(300), value: 300 },
    })
    saveGame(jeu(enManche))
    monterApp('/jeu')

    const toucheVirtuelle = screen.getByRole('button', { name: 'Lettre T' })
    expect(toucheVirtuelle).toHaveAttribute('aria-disabled', 'false')

    // Clavier physique : `usePhysicalKeyboard` écoute `document`, pas un champ
    // précis — un `fireEvent` global est l'exception prévue à `user-event`.
    fireEvent.keyDown(document, { key: 't' })

    expect(screen.getByRole('button', { name: 'Lettre T, déjà proposée' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    // La preuve que clavier physique et clavier virtuel passent par la même
    // commande : la même touche s'éteint, quel que soit le chemin emprunté.
    expect(screen.getByRole('status')).not.toHaveTextContent('')
  })

  it('« Tourner » fait sortir la phase de spinning et ne fige pas la partie', async () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const user = userEvent.setup()
    monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Tourner' }))

    // Sans le chien de garde provisoire de `useGameEffects`, le statut resterait
    // bloqué sur l'annonce de lancement : la phase serait toujours `spinning`.
    expect(await screen.findByRole('status')).not.toHaveTextContent('La roue tourne…')
  })

  it('affiche le panneau de fin de manche et enchaîne sur la manche suivante', async () => {
    saveGame(jeu(resoudre(demarrer({ players: [joueur('Alice')] }), true)))
    const user = userEvent.setup()
    monterApp('/jeu')

    expect(screen.getByRole('heading', { name: 'Manche terminée' })).toBeInTheDocument()
    const boutonSuivant = screen.getByRole('button', { name: 'Manche suivante' })
    expect(boutonSuivant).toBeInTheDocument()

    await user.click(boutonSuivant)

    expect(screen.getByRole('heading', { name: /^Manche 2 sur 3/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Manche terminée' })).not.toBeInTheDocument()
  })
})
