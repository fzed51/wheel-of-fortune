// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { HUMAN_ID } from '../game/setup'
import { clearAllData, loadGame, saveGame, saveMistralKey, saveSettings } from '../storage/persist'
import { STORAGE_KEYS } from '../storage/keys'
import { DEFAULT_SETTINGS } from '../storage/settings'
import { demarrer, jeu } from '../test/game'
import { monter } from '../test/app'
import { useGameCommands, useGameState } from './selectors'

/**
 * Suite du provider : ce qui est testé ici, c'est le câblage entre le stockage,
 * les réglages et le moteur. Les règles du jeu, elles, se testent sans DOM dans
 * `src/game`.
 */

/**
 * Historique des rendus de la sonde, dans l'ordre. Il sert à prouver qu'aucun
 * rendu intermédiaire n'a vu `no-game` : un `getByTestId` après montage ne
 * montrerait que le dernier état.
 */
let rendus: string[] = []

function Sonde() {
  const state = useGameState()
  const { startGame, nextRound, dispatch } = useGameCommands()
  rendus.push(state.kind)

  const partie = state.kind === 'playing' ? state.game : null
  const manche = partie !== null && partie.progress.kind === 'round' ? partie.progress.round : null
  const siege0 = partie?.players[0]

  // Ce que ferait l'écran de jeu avec un juge disponible : la proposition part,
  // le verdict revient. Les deux actions tiennent dans le même gestionnaire, le
  // reducer les applique dans l'ordre.
  function resoudre() {
    if (partie === null || partie.progress.kind !== 'round') return
    const joueur = partie.players[partie.progress.currentPlayer]
    if (joueur === undefined) return
    dispatch({ type: 'resolve/start', by: joueur.id, attempt: 'ma proposition', requestId: 'req-1' })
    dispatch({ type: 'resolve/verdict', requestId: 'req-1', correct: true })
  }

  return (
    <div>
      <span data-testid="kind">{state.kind}</span>
      <span data-testid="progress">{partie?.progress.kind ?? ''}</span>
      <span data-testid="resolve">{partie === null ? '' : String(partie.config.resolveEnabled)}</span>
      <span data-testid="manches">{partie === null ? '' : String(partie.config.roundCount)}</span>
      <span data-testid="joueurs">{partie === null ? '' : String(partie.players.length)}</span>
      <span data-testid="siege0">
        {siege0 === undefined ? '' : `${siege0.id} ${siege0.kind.type}`}
      </span>
      <span data-testid="enigme">{manche?.puzzle.id ?? ''}</span>
      <span data-testid="jouees">{partie === null ? '' : partie.playedPuzzleIds.join(' ')}</span>
      <button
        type="button"
        onClick={() => {
          startGame()
        }}
      >
        Jouer
      </button>
      <button type="button" onClick={resoudre}>
        Résoudre
      </button>
      <button
        type="button"
        onClick={() => {
          nextRound()
        }}
      >
        Manche suivante
      </button>
    </div>
  )
}

function texte(id: string): string {
  return screen.getByTestId(id).textContent ?? ''
}

beforeEach(() => {
  // `persist.ts` garde un repli en mémoire, vivant tant que le module est chargé :
  // vider `localStorage` seul laisserait une sauvegarde du test précédent lisible.
  clearAllData()
  localStorage.clear()
  rendus = []
})

describe('GameProvider', () => {
  it('hydrate la partie du stockage dès le premier rendu', () => {
    saveGame(jeu(demarrer()))

    monter(<Sonde />)

    expect(texte('kind')).toBe('playing')
    // Le nombre de rendus n'est pas la question — React peut en faire plusieurs.
    // C'est la présence de `no-game` qui signalerait une hydratation dans un effet.
    expect(rendus.length).toBeGreaterThan(0)
    expect(rendus).not.toContain('no-game')
  })

  it('ignore une sauvegarde abîmée et démarre sans partie', () => {
    localStorage.setItem(STORAGE_KEYS.save, 'ceci n’est pas une partie')

    monter(<Sonde />)

    expect(texte('kind')).toBe('no-game')
  })

  it('persiste la partie qui vient d’être démarrée', async () => {
    const user = userEvent.setup()
    monter(<Sonde />)

    await user.click(screen.getByRole('button', { name: 'Jouer' }))

    const charge = loadGame()
    expect(charge.ok).toBe(true)
    if (!charge.ok) return
    expect(charge.value.players).toHaveLength(1)
    expect(charge.value.config.roundCount).toBe(DEFAULT_SETTINGS.roundCount)
  })

  it('démarre la partie avec les réglages enregistrés', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, roundCount: 5, opponents: 2 })
    const user = userEvent.setup()
    monter(<Sonde />)

    await user.click(screen.getByRole('button', { name: 'Jouer' }))

    expect(texte('manches')).toBe('5')
    expect(texte('joueurs')).toBe('3')
    expect(texte('siege0')).toBe(`${HUMAN_ID} human`)
  })

  it('démarre sans résolution quand aucune clé n’est enregistrée', async () => {
    const user = userEvent.setup()
    monter(<Sonde />)

    await user.click(screen.getByRole('button', { name: 'Jouer' }))

    expect(texte('resolve')).toBe('false')
  })

  it('démarre avec la résolution quand une clé est enregistrée', async () => {
    saveMistralKey('sk-test')
    const user = userEvent.setup()
    monter(<Sonde />)

    await user.click(screen.getByRole('button', { name: 'Jouer' }))

    expect(texte('resolve')).toBe('true')
  })

  it('tire une énigme jamais jouée pour la manche suivante', async () => {
    // La clé est nécessaire pour que `resolve/start` soit une action légale : c'est
    // le seul moyen de terminer une manche sans scénariser vingt tirages de roue.
    saveMistralKey('sk-test')
    const user = userEvent.setup()
    monter(<Sonde />)

    await user.click(screen.getByRole('button', { name: 'Jouer' }))
    const premiere = texte('enigme')
    expect(premiere).not.toBe('')

    await user.click(screen.getByRole('button', { name: 'Résoudre' }))
    expect(texte('progress')).toBe('round-over')

    await user.click(screen.getByRole('button', { name: 'Manche suivante' }))

    expect(texte('progress')).toBe('round')
    const seconde = texte('enigme')
    expect(seconde).not.toBe(premiere)
    expect(texte('jouees').split(' ')).toEqual([premiere, seconde])
  })
})
