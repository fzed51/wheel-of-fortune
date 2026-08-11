// @vitest-environment jsdom
import { StrictMode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BOT_DELAY_MS } from '../game/bot'
import { CONSONANTS } from '../game/puzzle'
import { HUMAN_ID } from '../game/setup'
import { SPIN_MAX_MS } from '../game/wheel'
import { useGameEffects } from '../hooks/useGameEffects'
import { useAnnouncements } from '../hooks/useAnnouncer'
import { createJudge } from '../llm'
import { clearAllData, loadGame, loadMistralKey, saveGame, saveMistralKey, saveSettings } from '../storage/persist'
import { STORAGE_KEYS } from '../storage/keys'
import { DEFAULT_SETTINGS } from '../storage/settings'
import {
  avecLettres,
  avecPhase,
  avecPot,
  bonus as fixtureBonus,
  bot,
  cash,
  demarrer,
  jeu,
  jouer,
  joueur as fixtureJoueur,
  manche,
  resoudre,
} from '../test/game'
import { monter } from '../test/app'
import { useGameCommands, useGameState, useJudgeFailure } from './selectors'

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

/**
 * Partie amenée jusqu'à l'étape bonus : `roundCount: 1` fait de la seule
 * manche la manche finale (`isFinalRound(0, 1)`), et l'énigme de départ porte
 * `bonusAnswer`. La résoudre correctement fait entrer `round/next` en étape
 * bonus — le `puzzle` qu'il reçoit est ignoré par le reducer sur ce chemin
 * (voir `engine.ts`), sa valeur ne compte donc pas.
 */
function versEtapeBonus(expected: string, joueurs = [fixtureJoueur('Alice')]) {
  const debut = demarrer({ config: { roundCount: 1 }, bonusAnswer: expected, players: joueurs })
  const resolue = resoudre(debut, manche(debut).puzzle.answer)
  return jouer(resolue, { type: 'round/next', puzzle: manche(debut).puzzle, firstPlayer: 0 })
}

/** Pendant de `versEtapeBonus`, une tentative déjà envoyée : phase `judging`. */
function versJugementBonus(
  expected: string,
  attempt: string,
  joueurs = [fixtureJoueur('Alice')],
  requestId = 'req-1',
) {
  const enAttente = versEtapeBonus(expected, joueurs)
  return jouer(enAttente, {
    type: 'bonus/answer',
    by: fixtureBonus(enAttente).by,
    attempt,
    requestId,
  })
}

/**
 * Réponse volontairement éloignée de toute réponse attendue plausible dans ces
 * tests : `matchesAnswer` doit toujours la rejeter, pour forcer le chemin
 * réseau (ou son échec) plutôt que la confirmation locale.
 */
const REPONSE_BONUS_ELOIGNEE = 'la ville de Canberra'

function Sonde() {
  const state = useGameState()
  const { startGame, nextRound, spin, playLetter, pass, resolve, answerBonus, skipBonus } =
    useGameCommands()
  const judgeFailure = useJudgeFailure()
  rendus.push(state.kind)

  const partie = state.kind === 'playing' ? state.game : null
  const manche = partie !== null && partie.progress.kind === 'round' ? partie.progress.round : null
  const bonus = partie !== null && partie.progress.kind === 'bonus' ? partie.progress.bonus : null
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

  // Même logique que `resoudreCorrectement` : la réponse attendue n'est
  // connue qu'à l'exécution, elle diffère par test.
  function repondreBonusCorrectement() {
    if (bonus === null) return
    answerBonus(bonus.expected)
  }

  function repondreBonusIncorrectement() {
    answerBonus(REPONSE_BONUS_ELOIGNEE)
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
      {/*
       * Distance parcourue du lancer en cours d'animation, `''` hors phase
       * `spinning` : seul champ qui permette de distinguer un angle visé
       * explicite (`spin(0)`) d'un angle omis (tiré au hasard), qu'aucun autre
       * champ de cette sonde n'expose.
       */}
      <div role="group" aria-label="Distance parcourue">
        {manche !== null && manche.phase.kind === 'spinning' ? String(manche.phase.spin.travel) : ''}
      </div>
      {/*
       * `Object.hasOwn`, jamais `!== undefined` : seul lui distingue « pas de
       * `bonusAnswer` » de « `bonusAnswer` présent mais vide », distinction que
       * le dépôt tient à préserver (voir `isQuestion`, qui s'appuie sur la même
       * nuance pour la longueur repliée). Une énigme tirée dans le mauvais
       * réservoir doit se voir ici, pas dans un `id` qu'il faudrait connaître
       * par cœur.
       */}
      <div role="group" aria-label="Énigme de type question">
        {manche === null ? '' : Object.hasOwn(manche.puzzle, 'bonusAnswer') ? 'oui' : 'non'}
      </div>
      <div role="group" aria-label="Phase du bonus">
        {bonus?.phase.kind ?? ''}
      </div>
      <div role="group" aria-label="Échec du juge">
        {judgeFailure ?? ''}
      </div>
      <button type="button" onClick={repondreBonusCorrectement}>
        Répondre correctement au bonus
      </button>
      <button type="button" onClick={repondreBonusIncorrectement}>
        Répondre incorrectement au bonus
      </button>
      <button
        type="button"
        onClick={() => {
          skipBonus()
        }}
      >
        Passer le bonus
      </button>
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
      {/* Angle visé explicite, `0` : distinct de « Tourner » ci-dessus, qui
          omet l'argument. Voir la description du piège dans `spin` (`??`
          plutôt que `||`) côté `GameProvider.tsx`. */}
      <button
        type="button"
        onClick={() => {
          spin(0)
        }}
      >
        Tourner avec un angle de 0°
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

  describe('manche finale et réservoir de questions', () => {
    it('tire une question pour la manche finale d’une partie d’une seule manche', async () => {
      // `roundCount: 1` est le plus petit réglage possible (`MIN_ROUNDS`) : la
      // manche 0 y est aussi la dernière, donc `isFinalRound(0, 1)` est vrai
      // sans qu'il faille jouer plusieurs manches pour l'atteindre.
      saveSettings({ ...DEFAULT_SETTINGS, roundCount: 1 })
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Jouer' }))

      expect(champ('Nombre de manches')).toBe('1')
      expect(champ('Énigme de type question')).toBe('oui')
    })

    it('ne tire jamais de question pour la manche 0 d’une partie de plusieurs manches', async () => {
      saveSettings({ ...DEFAULT_SETTINGS, roundCount: 3 })
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Jouer' }))

      expect(champ('Nombre de manches')).toBe('3')
      expect(champ('Énigme de type question')).toBe('non')
    })

    it('sert la question de la manche finale au bon moment du passage de manche', async () => {
      // Point dur signalé par la consigne : au moment où `nextRound` tire
      // l'énigme, le reducer n'a pas encore poussé le résumé de la manche
      // finie dans `game.history` (ça n'arrive qu'au dispatch de `round/next`,
      // juste après). Avec `roundCount: 2`, la manche 0 vient de se terminer,
      // `game.history.length` vaut donc 0 — et c'est bien l'index de la
      // manche à venir (la manche 1, la finale) qu'il faut passer à `pickFor`.
      // Un décalage d'un cran dans un sens ferait tirer la question dès la
      // manche 0 (elle serait vue au clic sur « Jouer », avant même la
      // résolution) ; dans l'autre sens, la manche 1 resterait dans `pool` et
      // ne verrait jamais de question. Les deux assertions ci-dessous, prises
      // ensemble, excluent les deux décalages à la fois.
      saveSettings({ ...DEFAULT_SETTINGS, roundCount: 2 })
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Jouer' }))
      expect(champ('Énigme de type question')).toBe('non')

      await user.click(screen.getByRole('button', { name: 'Résoudre correctement' }))
      await user.click(screen.getByRole('button', { name: 'Manche suivante' }))

      expect(champ('Nombre de manches')).toBe('2')
      expect(champ('Type de progression')).toBe('round')
      expect(champ('Énigme de type question')).toBe('oui')
    })
  })

  describe('spin', () => {
    /**
     * Le piège de conception de cette étape : `spin(0)` est un angle visé
     * explicite (midi, pile sous l'aiguille), pas un angle omis. `??` doit le
     * respecter, `||` le remplacerait en silence par un tirage au hasard —
     * `randomAim` consommerait alors un tirage supplémentaire, décalant tout
     * le reste de la séquence déterministe.
     *
     * `Date.now` est figée pour que les deux montages (deux instances de
     * `GameProvider`, donc deux `rngRef` indépendants) partagent la même
     * graine : sans ce figeage, une différence de `travel` ne prouverait rien
     * de plus qu'un aléa différent d'un montage à l'autre.
     */
    it('spin(0) donne un travel différent de spin() sans argument, à graine égale', async () => {
      const maintenant = vi.spyOn(Date, 'now').mockReturnValue(1_723_000_000_000)
      try {
        const user = userEvent.setup()

        saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
        const premier = monter(<Sonde />)
        await user.click(screen.getByRole('button', { name: 'Tourner avec un angle de 0°' }))
        const travelAngleZero = champ('Distance parcourue')
        premier.unmount()

        clearAllData()
        localStorage.clear()
        saveGame(jeu(demarrer({ players: [fixtureJoueur('Alice')] })))
        const second = monter(<Sonde />)
        await user.click(screen.getByRole('button', { name: 'Tourner' }))
        const travelAngleOmis = champ('Distance parcourue')
        second.unmount()

        expect(travelAngleZero).not.toBe('')
        expect(travelAngleOmis).not.toBe('')
        // `spin(0)` ne consomme qu'un tirage (le jitter) ; `spin()` en
        // consomme deux (l'angle aléatoire, puis le jitter) — même graine,
        // même générateur déterministe, mais pas le même point de la
        // séquence : les deux `travel` divergent nécessairement.
        expect(travelAngleZero).not.toBe(travelAngleOmis)
      } finally {
        maintenant.mockRestore()
      }
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
          vi.advanceTimersByTime(SPIN_MAX_MS)
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
              vi.advanceTimersByTime(SPIN_MAX_MS * 2)
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

  describe('étape bonus', () => {
    it('gagne le bonus par confirmation locale, sans le moindre appel réseau', async () => {
      // Point central de l'étape, comme pour « Résoudre » : `matchesAnswer`
      // tranche localement une réponse tapée telle quelle, aucune clé ni
      // aucun réseau n'entrent en jeu.
      const fetchMock = vi.fn()
      vi.stubGlobal('fetch', fetchMock)
      saveGame(jeu(versEtapeBonus('PARIS')))
      const user = userEvent.setup()
      monter(<Sonde />)
      expect(champ('Type de progression')).toBe('bonus')

      await user.click(screen.getByRole('button', { name: 'Répondre correctement au bonus' }))

      expect(champ('Type de progression')).toBe('game-over')
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('un bot gagnant la manche finale termine la partie sans aucun appel réseau', () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
      try {
        const fetchMock = vi.fn()
        vi.stubGlobal('fetch', fetchMock)
        saveGame(jeu(versEtapeBonus('PARIS', [bot('Bot 1')])))
        monter(<Sonde />)
        expect(champ('Phase du bonus')).toBe('awaiting-answer')

        // Un cycle pour la réponse du bot (`bonus/answer`), un second pour son
        // verdict (`bonus/verdict`) : voir `botTurnKey` dans `game/bot.ts`, qui
        // change entre les deux phases pour justement redéclencher le minuteur.
        act(() => {
          vi.advanceTimersByTime(BOT_DELAY_MS)
        })
        expect(champ('Phase du bonus')).toBe('judging')

        act(() => {
          vi.advanceTimersByTime(BOT_DELAY_MS)
        })

        expect(champ('Type de progression')).toBe('game-over')
        expect(fetchMock).not.toHaveBeenCalled()
      } finally {
        vi.useRealTimers()
      }
    })

    it('un échec du juge laisse le bonus répondable', async () => {
      // Aucune clé enregistrée : `getJudge` rend `null`, la panne est
      // « unauthorized » avant tout appel réseau.
      saveGame(jeu(versEtapeBonus('CANBERRA')))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Répondre incorrectement au bonus' }))

      expect(champ('Phase du bonus')).toBe('awaiting-answer')
      expect(champ('Échec du juge')).toBe('unauthorized')

      // La phase redevenue répondable, une nouvelle tentative doit encore
      // fonctionner : sans ce second temps, un test qui ne vérifierait que le
      // retour en `awaiting-answer` laisserait passer une commande qui aurait
      // cessé de fonctionner après un premier échec.
      await user.click(screen.getByRole('button', { name: 'Répondre correctement au bonus' }))

      expect(champ('Type de progression')).toBe('game-over')
    })

    it("l'humain ne peut pas répondre à la place du bot", async () => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
      try {
        const user = userEvent.setup({ delay: null })
        saveGame(jeu(versEtapeBonus('PARIS', [bot('Bot 1')])))
        monter(<Sonde />)

        await user.click(screen.getByRole('button', { name: 'Répondre correctement au bonus' }))

        expect(champ('Phase du bonus')).toBe('awaiting-answer')
      } finally {
        vi.useRealTimers()
      }
    })

    it('skipBonus termine la partie', async () => {
      saveGame(jeu(versEtapeBonus('PARIS')))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Passer le bonus' }))

      expect(champ('Type de progression')).toBe('game-over')
    })

    it('une réponse lexicalement éloignée de l’attendu part au juge, dont le verdict est appliqué', async () => {
      saveMistralKey('clé-de-test')
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"correct": true}' } }] }),
      })
      vi.stubGlobal('fetch', fetchMock)
      saveGame(jeu(versEtapeBonus('CANBERRA')))
      const user = userEvent.setup()
      monter(<Sonde />)

      await user.click(screen.getByRole('button', { name: 'Répondre incorrectement au bonus' }))

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledTimes(1)
      })
      await waitFor(() => {
        expect(champ('Type de progression')).toBe('game-over')
      })
    })

    it("StrictMode double le montage de l'effet sans doubler l'appel au juge", async () => {
      // Ce test ne peut pas passer par `GameProvider` : `toPersisted`
      // (`storage/snapshot.ts`, `PersistedBonus`) ne persiste jamais la phase
      // `judging`, par choix délibéré — un rechargement en pleine attente de
      // verdict ne doit rien coûter au joueur, il retape sa réponse. Un
      // premier montage du provider ne peut donc jamais démarrer en
      // `judging`, et `StrictMode` (voir la doc de `useGameEffects`) ne
      // double-invoque les effets qu'à l'exact premier montage d'un composant,
      // jamais sur une mise à jour ultérieure (un clic, par exemple). La seule
      // façon de mettre le garde-fou (`sentJudgeRequestIds`) réellement à
      // l'épreuve est donc de monter `useGameEffects` lui-même avec un état
      // déjà en `judging` dès le premier rendu.
      saveMistralKey('clé-de-test')
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"correct": true}' } }] }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const state = versJugementBonus('CANBERRA', REPONSE_BONUS_ELOIGNEE)
      const dispatch = vi.fn()
      const getJudge = () =>
        createJudge({ apiKey: loadMistralKey(), model: DEFAULT_SETTINGS.mistralModel })

      renderHook(
        () =>
          useGameEffects(state, dispatch, {
            rng: () => 0,
            nextSpinId: () => 1,
            newRequestId: () => 'req-x',
            getJudge,
            onJudgeFailure: () => {},
          }),
        { wrapper: StrictMode },
      )

      await waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'bonus/verdict', requestId: 'req-1', correct: true })
      })
      // Un seul verdict dispatché, un seul appel réseau : le second montage
      // simulé par `StrictMode` a bien trouvé `req-1` déjà dans le `Set` et
      // s'est arrêté avant tout appel à `getJudge`.
      expect(dispatch).toHaveBeenCalledTimes(1)
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })
})
