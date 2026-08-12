// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearAllData, saveGame } from '../storage/persist'
import { demarrer, enigme, jeu, jouer, manche, partieTerminee, resoudre } from '../test/game'
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
    const state = demarrer()
    expect(jeu(state).progress.kind).toBe('round')
    saveGame(jeu(state))
    monterApp('/')
    expect(screen.getByRole('heading', { name: 'Partie en cours' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Reprendre' })).toBeInTheDocument()
    // Le numéro de manche vient de `displayedRoundNumber`, pas de
    // `history.length + 1` : sur une partie fraîche, `history` est vide.
    expect(screen.getByText('Manche 1 sur 3.')).toBeInTheDocument()
  })

  it('affiche le numéro de la dernière manche pendant l’étape bonus, sans déborder', () => {
    // `history.length + 1` déborderait ici : une seule manche a été jouée,
    // `history` contient donc 1 entrée, ce qui donnerait « Manche 2 sur 1 ».
    const state = demarrer({ config: { roundCount: 1 }, bonusAnswer: 'la loire' })
    const resolue = resoudre(state, manche(state).puzzle.answer)
    const versBonus = jouer(resolue, {
      type: 'round/next',
      puzzle: enigme('la mer', 'suite-bonus'),
      firstPlayer: 0,
    })
    expect(jeu(versBonus).progress.kind).toBe('bonus')
    saveGame(jeu(versBonus))
    monterApp('/')
    expect(screen.getByRole('heading', { name: 'Partie en cours' })).toBeInTheDocument()
    expect(screen.getByText('Manche 1 sur 1.')).toBeInTheDocument()
  })

  it('propose de voir les résultats quand la partie est terminée, sans la carte « Partie en cours »', () => {
    const state = partieTerminee()
    expect(jeu(state).progress.kind).toBe('game-over')
    saveGame(jeu(state))
    monterApp('/')
    expect(screen.getByRole('heading', { name: 'Partie terminée' })).toBeInTheDocument()
    expect(screen.getByText('Les 3 manches sont jouées.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Voir les résultats' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Partie en cours' })).not.toBeInTheDocument()
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
