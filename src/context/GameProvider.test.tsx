// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CONSONANTS } from '../game/puzzle'
import { HUMAN_ID } from '../game/setup'
import { SPIN_MS } from '../game/wheel'
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
  const { startGame, nextRound, spin, playLetter, pass, dispatch } = useGameCommands()
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
      <div role="group" aria-label="Nature de l’état">
        {state.kind}
      </div>
      <div role="group" aria-label="Type de progression">
        {partie?.progress.kind ?? ''}
      </div>
      <div role="group" aria-label="Phase de la manche">
        {manche?.phase.kind ?? ''}
      </div>
      <div role="group" aria-label="Résolution activée">
        {partie === null ? '' : String(partie.config.resolveEnabled)}
      </div>
      <div role="group" aria-label="Nombre de manches">
        {partie === null ? '' : String(partie.config.roundCount)}
      </div>
      <div role="group" aria-label="Nombre de joueurs">
        {partie === null ? '' : String(partie.players.length)}
      </div>
      <div role="group" aria-label="Premier siège">
        {siege0 === undefined ? '' : `${siege0.id} ${siege0.kind.type}`}
      </div>
      <div role="group" aria-label="Cagnotte du premier siège">
        {siege0 === undefined ? '' : String(siege0.pot)}
      </div>
      <div role="group" aria-label="Lettres jouées">
        {manche === null ? '' : manche.guessed.join(' ')}
      </div>
      <div role="group" aria-label="Identifiant de l’énigme">
        {manche?.puzzle.id ?? ''}
      </div>
      <div role="group" aria-label="Énigmes déjà jouées">
        {partie === null ? '' : partie.playedPuzzleIds.join(' ')}
      </div>
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
      <button
        type="button"
        onClick={() => {
          spin()
        }}
      >
        Tourner
      </button>
    </div>
  )
}

/** Lit la valeur d'un champ de la sonde par son libellé accessible, jamais par un `data-testid`. */
function champ(nom: string): string {
  return screen.getByRole('group', { name: nom }).textContent ?? ''
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

    expect(champ('Nature de l’état')).toBe('playing')
    // Le nombre de rendus n'est pas la question — React peut en faire plusieurs.
    // C'est la présence de `no-game` qui signalerait une hydratation dans un effet.
    expect(rendus.length).toBeGreaterThan(0)
    expect(rendus).not.toContain('no-game')
  })

  it('ignore une sauvegarde abîmée et démarre sans partie', () => {
    localStorage.setItem(STORAGE_KEYS.save, 'ceci n’est pas une partie')

    monter(<Sonde />)

    expect(champ('Nature de l’état')).toBe('no-game')
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

    expect(champ('Nombre de manches')).toBe('5')
    expect(champ('Nombre de joueurs')).toBe('3')
    expect(champ('Premier siège')).toBe(`${HUMAN_ID} human`)
  })

  it('démarre sans résolution quand aucune clé n’est enregistrée', async () => {
    const user = userEvent.setup()
    monter(<Sonde />)

    await user.click(screen.getByRole('button', { name: 'Jouer' }))

    expect(champ('Résolution activée')).toBe('false')
  })

  it('démarre avec la résolution quand une clé est enregistrée', async () => {
    saveMistralKey('sk-test')
    const user = userEvent.setup()
    monter(<Sonde />)

    await user.click(screen.getByRole('button', { name: 'Jouer' }))

    expect(champ('Résolution activée')).toBe('true')
  })

  it('tire une énigme jamais jouée pour la manche suivante', async () => {
    // La clé est nécessaire pour que `resolve/start` soit une action légale : c'est
    // le seul moyen de terminer une manche sans scénariser vingt tirages de roue.
    saveMistralKey('sk-test')
    const user = userEvent.setup()
    monter(<Sonde />)

    await user.click(screen.getByRole('button', { name: 'Jouer' }))
    const premiere = champ('Identifiant de l’énigme')
    expect(premiere).not.toBe('')

    await user.click(screen.getByRole('button', { name: 'Résoudre' }))
    expect(champ('Type de progression')).toBe('round-over')

    await user.click(screen.getByRole('button', { name: 'Manche suivante' }))

    expect(champ('Type de progression')).toBe('round')
    const seconde = champ('Identifiant de l’énigme')
    expect(seconde).not.toBe(premiere)
    expect(champ('Énigmes déjà jouées').split(' ')).toEqual([premiere, seconde])
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

      expect(champ('Lettres jouées')).toBe('T')
      expect(champ('Cagnotte du premier siège')).toBe('300')
      expect(champ('Phase de la manche')).toBe('awaiting-action')
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

      expect(champ('Lettres jouées')).toBe('Z')
      expect(champ('Cagnotte du premier siège')).toBe('0')
      expect(await screen.findByRole('status')).toHaveTextContent('Pas de Z.')
    })

    it('achète une voyelle payable et débite son coût', async () => {
      saveGame(jeu(avecPot(demarrer({ players: [fixtureJoueur('Alice')] }), 0, 300)))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Voyelle A' }))

      // « LE VENT » ne contient pas de A : la voyelle est débitée quand même.
      expect(champ('Lettres jouées')).toBe('A')
      expect(champ('Cagnotte du premier siège')).toBe('50')
    })

    it('ignore une voyelle quand la cagnotte est insuffisante', async () => {
      saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Voyelle A' }))

      expect(champ('Lettres jouées')).toBe('')
      expect(champ('Cagnotte du premier siège')).toBe('0')
    })

    it('ignore une lettre déjà jouée', async () => {
      saveGame(jeu(avecLettres(demarrer({ players: [fixtureJoueur('Alice')] }), ['T'])))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Consonne T' }))

      // `avecLettres` fixe `guessed` à `['T']` sans repasser par le reducer : si la
      // commande dispatchait quand même, on verrait un doublon ou un changement de phase.
      expect(champ('Lettres jouées')).toBe('T')
      expect(champ('Cagnotte du premier siège')).toBe('0')
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
      expect(champ('Phase de la manche')).toBe('awaiting-action')

      await user.click(screen.getByRole('button', { name: 'Passer' }))

      // Seule issue pour un joueur bloqué sans consonne ni voyelle achetable ni
      // juge : la manche passe en `blocked`, pas de partenaire à qui redonner la main.
      expect(champ('Phase de la manche')).toBe('blocked')
    })

    it("n'a aucun effet quand le joueur courant peut encore agir", async () => {
      saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Passer' }))

      expect(champ('Phase de la manche')).toBe('awaiting-action')
      expect(champ('Lettres jouées')).toBe('')
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

  describe('chien de garde de la roue', () => {
    it('fait sortir la partie de la phase « spinning » même si personne ne rend la main', async () => {
      // `saveGame` résoudrait une phase `spinning` avant écriture (`toPersisted`) :
      // il faut atteindre la phase par une vraie rotation, pas par une fixture
      // rechargée. Seuls `setTimeout`/`clearTimeout` sont truqués, et
      // `shouldAdvanceTime` laisse le clic de user-event se résoudre : sans lui,
      // les micro-attentes internes de user-event (basées sur des timers non
      // truqués comme `requestAnimationFrame`) ne se résolvent jamais.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
      try {
        const user = userEvent.setup({ delay: null })
        saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
        monter(<Sonde />)

        await user.click(screen.getByRole('button', { name: 'Tourner' }))
        expect(champ('Phase de la manche')).toBe('spinning')

        // Moins que le délai : le filet ne doit pas encore s'être déclenché.
        act(() => {
          vi.advanceTimersByTime(SPIN_MS)
        })
        expect(champ('Phase de la manche')).toBe('spinning')

        act(() => {
          vi.advanceTimersByTime(500 + 1)
        })
        expect(champ('Phase de la manche')).not.toBe('spinning')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
