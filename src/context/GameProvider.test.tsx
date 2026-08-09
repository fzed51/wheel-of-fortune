// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BOT_DELAY_MS } from '../game/bot'
import { CONSONANTS } from '../game/puzzle'
import { HUMAN_ID } from '../game/setup'
import { SPIN_MS } from '../game/wheel'
import { useAnnouncements } from '../hooks/useAnnouncer'
import { clearAllData, loadGame, saveGame, saveSettings } from '../storage/persist'
import { STORAGE_KEYS } from '../storage/keys'
import { DEFAULT_SETTINGS } from '../storage/settings'
import {
  avecLettres,
  avecPhase,
  avecPot,
  bot,
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
  const { startGame, nextRound, spin, playLetter, pass, resolve } = useGameCommands()
  rendus.push(state.kind)

  const partie = state.kind === 'playing' ? state.game : null
  const manche = partie !== null && partie.progress.kind === 'round' ? partie.progress.round : null
  const siege0 = partie?.players[0]

  // La vraie réponse est lue sur l'état courant au moment du clic : la
  // fixture par défaut fixe l'énigme sur « LE VENT », mais la partie démarrée
  // par le bouton « Jouer » tire une énigme aléatoire dans le pool — coder en
  // dur une réponse casserait ce second cas.
  function resoudreCorrectement() {
    if (manche === null) return
    resolve(manche.puzzle.answer)
  }

  function resoudreIncorrectement() {
    resolve('ceci ne peut correspondre à aucune énigme')
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
      <button type="button" onClick={resoudreCorrectement}>
        Résoudre correctement
      </button>
      <button type="button" onClick={resoudreIncorrectement}>
        Résoudre incorrectement
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

afterEach(() => {
  vi.unstubAllGlobals()
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

  it('tire une énigme jamais jouée pour la manche suivante', async () => {
    const user = userEvent.setup()
    monter(<Sonde />)

    await user.click(screen.getByRole('button', { name: 'Jouer' }))
    const premiere = champ('Identifiant de l’énigme')
    expect(premiere).not.toBe('')

    await user.click(screen.getByRole('button', { name: 'Résoudre correctement' }))
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
      const bloquee = avecLettres(demarrer({ players: [fixtureJoueur('Alice')] }), CONSONANTS)
      saveGame(jeu(bloquee))
      const user = userEvent.setup()
      monter(<Sonde />)
      expect(champ('Phase de la manche')).toBe('awaiting-action')

      await user.click(screen.getByRole('button', { name: 'Passer' }))

      // Plus aucune consonne à tirer ni voyelle finançable : proposer la
      // réponse resterait légal (`canResolve` ne dépend d'aucune des deux),
      // mais ce test choisit « Passer », dont c'est alors la seule utilité —
      // la manche passe en `blocked`, pas de partenaire à qui redonner la main.
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

  describe('resolve', () => {
    it('une bonne réponse termine la manche sans le moindre appel réseau', async () => {
      // Point central de l'étape : le verdict est un calcul synchrone du
      // reducer (`matchesAnswer`), aucune clé ni aucun réseau n'entrent en jeu.
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Résoudre correctement' }))

      expect(champ('Type de progression')).toBe('round-over')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('une mauvaise réponse fait passer la main sans toucher à la cagnotte', async () => {
      saveGame(jeu(avecPot(demarrer(), 0, 300)))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Résoudre incorrectement' }))

      expect(champ('Phase de la manche')).toBe('awaiting-action')
      expect(champ('Cagnotte du premier siège')).toBe('300')
      expect(await screen.findByRole('status')).toHaveTextContent('Mauvaise réponse.')
    })

    it("n'a aucun effet pendant le tour d'un bot", async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
      try {
        const user = userEvent.setup({ delay: null })
        saveGame(jeu(demarrer({ players: [bot('Bot 1')] })))
        monter(<Sonde />)

        // Assertion faite avant tout écoulement du minuteur du bot : elle
        // distingue le refus de la commande d'un simple silence dû au minuteur.
        await user.click(screen.getByRole('button', { name: 'Résoudre correctement' }))

        expect(champ('Type de progression')).toBe('round')
        expect(champ('Phase de la manche')).toBe('awaiting-action')
      } finally {
        vi.useRealTimers()
      }
    })

    it('fonctionne sans aucune clé d’API configurée', async () => {
      // Aucun `saveMistralKey` dans ce test : c'est tout le point de l'étape,
      // « Résoudre » ne dépend plus d'aucune clé.
      saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Résoudre correctement' }))

      expect(champ('Type de progression')).toBe('round-over')
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

  describe('tour de bot', () => {
    it('le bot joue après un court délai', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
      try {
        saveGame(jeu(demarrer({ players: [bot('Bot 1')] })))
        monter(<Sonde />)
        expect(champ('Phase de la manche')).toBe('awaiting-action')

        // Rien avant l'échéance : c'est ce qui prouve qu'on observe bien le
        // minuteur du bot, pas un effet de bord d'un autre effet.
        act(() => {
          vi.advanceTimersByTime(BOT_DELAY_MS - 1)
        })
        expect(champ('Phase de la manche')).toBe('awaiting-action')

        act(() => {
          vi.advanceTimersByTime(1)
        })
        // Seul un bot peut jouer sans intervention : la phase a changé (rotation
        // de la roue, le pot étant à 0 il ne peut rien acheter).
        expect(champ('Phase de la manche')).not.toBe('awaiting-action')
      } finally {
        vi.useRealTimers()
      }
    })

    it("le bot n'usurpe pas le tour de l'humain", () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
      try {
        // Deux joueurs humains (fixture par défaut de `demarrer`) : Alice, au
        // premier siège, ne doit jamais être jouée par le driver de bot.
        saveGame(jeu(demarrer()))
        monter(<Sonde />)

        act(() => {
          vi.advanceTimersByTime(BOT_DELAY_MS * 3)
        })

        expect(champ('Phase de la manche')).toBe('awaiting-action')
        expect(champ('Lettres jouées')).toBe('')
      } finally {
        vi.useRealTimers()
      }
    })

    it('enchaîne plusieurs coups de bot sans se figer', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
      try {
        saveGame(jeu(demarrer({ players: [bot('Bot 1')] })))
        monter(<Sonde />)

        // Le segment tiré par la roue est aléatoire (banqueroute et passe ne
        // produisent aucune lettre) : on répète le cycle décision → rotation →
        // chien de garde jusqu'à voir une lettre jouée, borné pour ne jamais
        // boucler indéfiniment si le bot restait muet après son premier coup —
        // c'est exactement le bug que ce test doit attraper.
        let lettresJouees = champ('Lettres jouées')
        for (let cycle = 0; cycle < 8 && lettresJouees === ''; cycle += 1) {
          act(() => {
            vi.advanceTimersByTime(BOT_DELAY_MS)
          })
          if (champ('Phase de la manche') === 'spinning') {
            // Le double de la rotation : la marge exacte du chien de garde est
            // privée à `useGameEffects`, et la recopier ici ferait échouer ce
            // test en silence — la boucle s'épuiserait — le jour où elle change.
            act(() => {
              vi.advanceTimersByTime(SPIN_MS * 2)
            })
          }
          lettresJouees = champ('Lettres jouées')
        }

        expect(champ('Phase de la manche')).not.toBe('spinning')
        expect(lettresJouees).not.toBe('')
      } finally {
        vi.useRealTimers()
      }
    })

    it("l'humain ne peut pas jouer à la place du bot", async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
      try {
        const user = userEvent.setup({ delay: null })
        saveGame(jeu(demarrer({ players: [bot('Bot 1')] })))
        monter(<Sonde />)

        // Assertion faite avant tout écoulement du minuteur du bot : elle
        // distingue le refus de la commande d'un simple silence dû au minuteur.
        await user.click(screen.getByRole('button', { name: 'Tourner' }))

        expect(champ('Phase de la manche')).toBe('awaiting-action')
      } finally {
        vi.useRealTimers()
      }
    })
  })
})
