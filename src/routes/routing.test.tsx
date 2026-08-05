// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearAllData, saveGame } from '../storage/persist'
import { demarrer, jeu, partieTerminee } from '../test/game'
import { monterApp } from '../test/app'

/**
 * Navigation. Chaque test part d'un stockage vide, puis y écrit la partie voulue
 * **avant** le montage : c'est exactement ce que voit l'application au chargement
 * d'une URL, F5 comprise.
 */
beforeEach(() => {
  // `clearAllData` **et** `localStorage.clear()` : `persist` garde un repli en
  // mémoire, que vider le stockage du navigateur ne touche pas. Sans les deux, la
  // partie d'un test précédent réapparaît dans le suivant.
  clearAllData()
  localStorage.clear()
})

describe('gardes de route', () => {
  it('renvoie /jeu vers l’accueil quand aucune partie n’est en cours', () => {
    monterApp('/jeu')
    expect(screen.getByRole('heading', { name: 'Nouvelle partie' })).toBeInTheDocument()
  })

  it('reste sur /jeu quand une partie est enregistrée', () => {
    // Cas du F5 en pleine partie : l'hydratation est synchrone, donc la garde ne
    // voit jamais `no-game` et ne redirige pas.
    saveGame(jeu(demarrer()))
    monterApp('/jeu')
    expect(screen.getByRole('heading', { name: /^Manche 1 sur 3/ })).toBeInTheDocument()
  })

  it('renvoie /resultats vers /jeu tant que la partie n’est pas finie', () => {
    saveGame(jeu(demarrer()))
    monterApp('/resultats')
    expect(screen.getByRole('heading', { name: /^Manche 1 sur 3/ })).toBeInTheDocument()
  })

  it('affiche les résultats quand la partie est finie', () => {
    saveGame(jeu(partieTerminee()))
    monterApp('/resultats')
    expect(screen.getByRole('heading', { name: /Vainqueur|Égalité/ })).toBeInTheDocument()
  })

  it('renvoie /jeu vers les résultats quand la partie est finie', () => {
    // Symétrique du précédent : sans ça, une partie finie laisserait un écran de
    // jeu sans manche en cours, donc sans rien à afficher.
    saveGame(jeu(partieTerminee()))
    monterApp('/jeu')
    expect(screen.getByRole('heading', { name: /Vainqueur|Égalité/ })).toBeInTheDocument()
  })
})

describe('écrans accessibles sans partie', () => {
  it.each([
    ['/', 'Nouvelle partie'],
    ['/regles', 'En bref'],
    ['/enigmes', 'Catalogue'],
    ['/reglages', 'Apparence'],
  ])('affiche %s à froid', (path, heading) => {
    monterApp(path)
    expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument()
  })

  it('garde l’en-tête sur une adresse inconnue', () => {
    // La route attrape-tout est enfant du layout : une PWA rechargée sur une URL
    // périmée ne doit pas laisser l'utilisateur dans un cul-de-sac.
    monterApp('/nawak')
    expect(screen.getByRole('heading', { name: 'Écran introuvable' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'La Roue de la Fortune' })).toBeInTheDocument()
  })
})

describe('accueil', () => {
  it('ne redirige pas quand une partie est en cours, mais propose de la reprendre', () => {
    // Rediriger interdirait de lancer une autre partie.
    saveGame(jeu(demarrer()))
    monterApp('/')
    expect(screen.getByRole('heading', { name: 'Partie en cours' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reprendre' })).toBeInTheDocument()
  })

  it('mène à l’écran de jeu après avoir lancé une partie', async () => {
    const user = userEvent.setup()
    monterApp('/')
    await user.click(screen.getByRole('button', { name: 'Jouer' }))
    expect(screen.getByRole('heading', { name: /^Manche 1 sur/ })).toBeInTheDocument()
  })

  it('avertit qu’une partie en cours sera abandonnée', () => {
    saveGame(jeu(demarrer()))
    monterApp('/')
    expect(screen.getByRole('button', { name: 'Repartir de zéro' })).toBeInTheDocument()
    expect(screen.getByText('La partie en cours sera abandonnée.')).toBeInTheDocument()
  })
})
