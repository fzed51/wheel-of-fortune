// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CONSONANTS } from '../game/puzzle'
import { HUMAN_ID } from '../game/setup'
import { useAnnouncements } from '../hooks/useAnnouncer'
import { clearAllData, loadGame, saveGame, saveMistralKey, saveSettings } from '../storage/persist'
import { STORAGE_KEYS } from '../storage/keys'
import { DEFAULT_SETTINGS } from '../storage/settings'
import {
  avecLettres,
  avecPhase,
  avecPot,
  cash,
  demarrer,
  jeu,
  joueur as fixtureJoueur,
} from '../test/game'
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

/**
 * Live regions minimales, montées une seule fois avec la sonde : elles ne
 * dupliquent pas `LiveRegions.tsx` (hors zone), elles ne servent qu'à observer
 * `useAnnouncements` sans dépendre d'un composant que d'autres agents modifient.
 */
function Annonces() {
  const { status, alert } = useAnnouncements()
  return (
    <>
      <p role="status" aria-live="polite" aria-atomic="true">
        {status.text}
      </p>
      <p role="alert" aria-atomic="true">
        {alert.text}
      </p>
    </>
  )
}

function Sonde() {
  const state = useGameState()
  const { startGame, nextRound, playLetter, pass, dispatch } = useGameCommands()
  rendus.push(state.kind)

  const partie = state.kind === 'playing' ? state.game : null
  const manche = partie !== null && partie.progress.kind === 'round' ? partie.progress.round : null
  const siege0 = partie?.players[0]

  // Ce que ferait l'écran de jeu avec un juge disponible : la proposition part,
  // le verdict revient. Les deux actions tiennent dans le même gestionnaire, le
  // reducer les applique dans l'ordre.
  function resoudre(correct: boolean) {
    if (partie === null || partie.progress.kind !== 'round') return
    const joueur = partie.players[partie.progress.currentPlayer]
    if (joueur === undefined) return
    dispatch({ type: 'resolve/start', by: joueur.id, attempt: 'ma proposition', requestId: 'req-1' })
    dispatch({ type: 'resolve/verdict', requestId: 'req-1', correct })
  }

  // Panne technique du juge : aucun verdict ne revient, `resolve/failed` clôt la tentative.
  function jugeEnPanne() {
    if (partie === null || partie.progress.kind !== 'round') return
    const joueur = partie.players[partie.progress.currentPlayer]
    if (joueur === undefined) return
    dispatch({ type: 'resolve/start', by: joueur.id, attempt: 'ma proposition', requestId: 'req-1' })
    dispatch({ type: 'resolve/failed', requestId: 'req-1', reason: 'network' })
  }

  return (
    <div>
      <Annonces />
      <span data-testid="kind">{state.kind}</span>
      <span data-testid="progress">{partie?.progress.kind ?? ''}</span>
      <span data-testid="phase">{manche?.phase.kind ?? ''}</span>
      <span data-testid="resolve">{partie === null ? '' : String(partie.config.resolveEnabled)}</span>
      <span data-testid="manches">{partie === null ? '' : String(partie.config.roundCount)}</span>
      <span data-testid="joueurs">{partie === null ? '' : String(partie.players.length)}</span>
      <span data-testid="siege0">
        {siege0 === undefined ? '' : `${siege0.id} ${siege0.kind.type}`}
      </span>
      <span data-testid="pot0">{siege0 === undefined ? '' : String(siege0.pot)}</span>
      <span data-testid="guessed">{manche === null ? '' : manche.guessed.join(' ')}</span>
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
      <button
        type="button"
        onClick={() => {
          resoudre(true)
        }}
      >
        Résoudre
      </button>
      <button
        type="button"
        onClick={() => {
          resoudre(false)
        }}
      >
        Résoudre (faux)
      </button>
      <button type="button" onClick={jugeEnPanne}>
        Juge en panne
      </button>
      <button
        type="button"
        onClick={() => {
          playLetter('T')
        }}
      >
        Consonne T
      </button>
      <button
        type="button"
        onClick={() => {
          playLetter('Z')
        }}
      >
        Consonne Z
      </button>
      <button
        type="button"
        onClick={() => {
          playLetter('A')
        }}
      >
        Voyelle A
      </button>
      <button
        type="button"
        onClick={() => {
          pass()
        }}
      >
        Passer
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

  /**
   * `demarrer()` fixe l'énigme sur « LE VENT » : T, L, V, N sont des consonnes
   * présentes, Z et A en sont absentes. Un seul joueur (Alice) pour que la
   * rotation de siège après une lettre manquée ne change jamais `currentPlayer`
   * — ce qui isole l'assertion sur la phrase d'une deuxième variable.
   */
  describe('playLetter', () => {
    it('joue une consonne présente et crédite la cagnotte du joueur courant', async () => {
      const partieAvecTirage = avecPhase(demarrer({ players: [fixtureJoueur('Alice')] }), {
        kind: 'awaiting-consonant',
        value: 300,
        segment: { kind: 'cash', index: cash(300), value: 300 },
      })
      saveGame(jeu(partieAvecTirage))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Consonne T' }))

      expect(texte('guessed')).toBe('T')
      expect(texte('pot0')).toBe('300')
      expect(texte('phase')).toBe('awaiting-action')
      expect(await screen.findByRole('status')).toHaveTextContent('T, une fois. Cagnotte : 300 euros.')
    })

    it('joue une consonne absente sans changer la cagnotte', async () => {
      const partieAvecTirage = avecPhase(demarrer({ players: [fixtureJoueur('Alice')] }), {
        kind: 'awaiting-consonant',
        value: 300,
        segment: { kind: 'cash', index: cash(300), value: 300 },
      })
      saveGame(jeu(partieAvecTirage))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Consonne Z' }))

      expect(texte('guessed')).toBe('Z')
      expect(texte('pot0')).toBe('0')
      expect(await screen.findByRole('status')).toHaveTextContent('Pas de Z.')
    })

    it('achète une voyelle payable et débite son coût', async () => {
      saveGame(jeu(avecPot(demarrer({ players: [fixtureJoueur('Alice')] }), 0, 300)))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Voyelle A' }))

      // « LE VENT » ne contient pas de A : la voyelle est débitée quand même.
      expect(texte('guessed')).toBe('A')
      expect(texte('pot0')).toBe('50')
    })

    it('ignore une voyelle quand la cagnotte est insuffisante', async () => {
      saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Voyelle A' }))

      expect(texte('guessed')).toBe('')
      expect(texte('pot0')).toBe('0')
    })

    it('ignore une lettre déjà jouée', async () => {
      saveGame(jeu(avecLettres(demarrer({ players: [fixtureJoueur('Alice')] }), ['T'])))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Consonne T' }))

      // `avecLettres` fixe `guessed` à `['T']` sans repasser par le reducer : si la
      // commande dispatchait quand même, on verrait un doublon ou un changement de phase.
      expect(texte('guessed')).toBe('T')
      expect(texte('pot0')).toBe('0')
    })
  })

  describe('pass', () => {
    it('passe la main quand le joueur courant est bloqué', async () => {
      const bloquee = avecLettres(
        demarrer({ players: [fixtureJoueur('Alice')], config: { resolveEnabled: false } }),
        CONSONANTS,
      )
      saveGame(jeu(bloquee))
      const user = userEvent.setup()
      monter(<Sonde />)
      expect(texte('phase')).toBe('awaiting-action')

      await user.click(screen.getByRole('button', { name: 'Passer' }))

      // Seule issue pour un joueur bloqué sans consonne ni voyelle achetable ni
      // juge : la manche passe en `blocked`, pas de partenaire à qui redonner la main.
      expect(texte('phase')).toBe('blocked')
    })

    it("n'a aucun effet quand le joueur courant peut encore agir", async () => {
      saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Passer' }))

      expect(texte('phase')).toBe('awaiting-action')
      expect(texte('guessed')).toBe('')
    })
  })

  describe('annonces', () => {
    it('annonce un verdict négatif au statut, jamais à l’alerte', async () => {
      // Une clé Mistral doit être enregistrée : sans elle, l'effet de synchronisation
      // du provider ramène `resolveEnabled` à `false` dès le montage, et `resolve/start`
      // deviendrait indispatchable.
      saveMistralKey('sk-test')
      saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Résoudre (faux)' }))

      // C'est le seul test qui prouve que l'action compte, pas seulement le diff
      // d'état : un `resolve/failed` produirait le même `(prev, next)` mais une
      // alerte, jamais un statut.
      expect(await screen.findByRole('status')).toHaveTextContent('Mauvaise réponse.')
      expect(screen.getByRole('alert')).toHaveTextContent('')
    })

    it('annonce une panne du juge à l’alerte, jamais au statut', async () => {
      saveMistralKey('sk-test')
      saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Juge en panne' }))

      expect(await screen.findByRole('alert')).toHaveTextContent(
        'Le juge est injoignable. Vérifiez votre connexion, puis réessayez.',
      )
      // Le statut garde sa dernière valeur (« Proposition envoyée au juge. »),
      // qu'un échec technique ne doit pas écraser par une phrase de verdict.
      expect(screen.getByRole('status')).toHaveTextContent('Proposition envoyée au juge.')
    })
  })
})
