// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import type { GameState } from '../game/types'
import { clearAllData, saveGame } from '../storage/persist'
import { bonus, demarrer, enigme, jeu, joueur, jouer, manche, partieTerminee, repondre, resoudre } from '../test/game'
import { monterApp } from '../test/app'

/**
 * Amène la partie jusqu'à l'étape bonus (`progress.kind === 'bonus'`, phase
 * `awaiting-answer`), même construction que dans `GameRoute.test.tsx` :
 * `roundCount: 1` fait de l'unique manche la manche finale.
 */
function versEtapeBonus(bonusAnswer: string, players = [joueur('Alice'), joueur('Bob')]): GameState {
  const state = demarrer({
    config: { roundCount: 1 },
    answer: 'le vent',
    bonusAnswer,
    players,
  })
  const resolue = resoudre(state, manche(state).puzzle.answer)
  return jouer(resolue, {
    type: 'round/next',
    puzzle: enigme('la mer', 'suite-bonus'),
    firstPlayer: 0,
  })
}

/**
 * Verdict tranché directement par le reducer (`bonus/verdict`), sans passer
 * par un juge réseau : cette suite teste la mise en forme du résultat par
 * `GameOverRoute`, pas le driver qui produit ce verdict — celui-là est déjà
 * couvert dans `GameRoute.test.tsx`.
 */
function versBonusGagne(bonusAnswer = 'la loire'): GameState {
  const enJugement = repondre(versEtapeBonus(bonusAnswer), bonusAnswer)
  return jouer(enJugement, { type: 'bonus/verdict', requestId: 'req-1', correct: true })
}

function versBonusManque(bonusAnswer = 'la loire'): GameState {
  const enJugement = repondre(versEtapeBonus(bonusAnswer), 'une réponse fausse')
  return jouer(enJugement, { type: 'bonus/verdict', requestId: 'req-1', correct: false })
}

function versBonusRenonce(bonusAnswer = 'la loire'): GameState {
  const enAttente = versEtapeBonus(bonusAnswer)
  return jouer(enAttente, { type: 'bonus/skip', by: bonus(enAttente).by })
}

beforeEach(() => {
  // Piège d'isolation documenté dans `persist.ts` : le repli en mémoire
  // survit à `localStorage.clear()` seul.
  clearAllData()
  localStorage.clear()
})

describe('GameOverRoute', () => {
  it('mentionne la question bonus gagnée, avec le montant', () => {
    saveGame(jeu(versBonusGagne()))
    monterApp('/resultats')

    expect(screen.getByRole('heading', { name: 'Question bonus' })).toBeInTheDocument()
    expect(screen.getByText(/Alice a trouvé la question bonus/)).toBeInTheDocument()
    expect(screen.getByText(/LE VENT/)).toBeInTheDocument()
    expect(screen.getByText(/500 euros/)).toBeInTheDocument()
    // La réponse attendue n'a aucune raison d'apparaître : elle est déjà
    // trouvée, la révéler n'ajouterait rien.
    expect(screen.queryByText(/la loire/i)).not.toBeInTheDocument()
  })

  /**
   * La réponse attendue (« la loire ») est révélée : la partie est finie, la
   * retenir n'a plus de sens, et c'est justement ce que le joueur veut savoir.
   */
  it('mentionne la question bonus manquée et révèle la réponse attendue', () => {
    saveGame(jeu(versBonusManque('la loire')))
    monterApp('/resultats')

    expect(screen.getByText(/Alice n['’]a pas trouvé la question bonus/)).toBeInTheDocument()
    expect(screen.getByText(/la loire/)).toBeInTheDocument()
  })

  it('mentionne la question bonus non tentée et révèle la réponse attendue', () => {
    saveGame(jeu(versBonusRenonce('la loire')))
    monterApp('/resultats')

    expect(screen.getByText(/Alice a renoncé à la question bonus/)).toBeInTheDocument()
    expect(screen.getByText(/la loire/)).toBeInTheDocument()
  })

  /**
   * `bonus: null` : juge indisponible, manche finale annulée, ou dernière
   * manche pas une question — `partieTerminee()` (énigmes ordinaires partout)
   * en est un exemple. Aucune mention, pas seulement l'absence d'un autre
   * texte : ce test cherche spécifiquement l'absence de la carte bonus.
   */
  it('ne mentionne aucune question bonus quand la partie n’en a pas eu', () => {
    saveGame(jeu(partieTerminee()))
    monterApp('/resultats')

    expect(screen.queryByRole('heading', { name: 'Question bonus' })).not.toBeInTheDocument()
    expect(screen.queryByText(/question bonus/i)).not.toBeInTheDocument()
  })

  it('affiche le classement et le vainqueur avec le gain du bonus inclus dans le total', () => {
    saveGame(jeu(versBonusGagne()))
    monterApp('/resultats')

    // Alice a gagné la manche (500 euros, minimum garanti) puis la question
    // bonus (500 euros de plus) : son total doit refléter les deux, pas
    // seulement l'un ou l'autre.
    expect(screen.getByRole('heading', { name: 'Vainqueur' })).toBeInTheDocument()
    const classement = screen.getAllByRole('listitem')
    expect(classement).toHaveLength(2)
    expect(classement[0]).toHaveTextContent('Alice')
    expect(classement[0]).toHaveTextContent('1 000 euros')
    expect(classement[1]).toHaveTextContent('Bob')
    expect(classement[1]).toHaveTextContent('0 euro')
  })
})
