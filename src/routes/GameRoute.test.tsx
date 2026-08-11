// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CONSONANTS } from '../game/puzzle'
import type { GameState, Player } from '../game/types'
import { clearAllData, saveGame, saveMistralKey, saveSettings } from '../storage/persist'
import { DEFAULT_SETTINGS } from '../storage/settings'
import {
  avecLettres,
  avecPhase,
  avecPot,
  bot,
  cash,
  courant,
  demarrer,
  enigme,
  jeu,
  joueur,
  jouer,
  manche,
  resoudre,
} from '../test/game'
import { monterApp } from '../test/app'

/**
 * Amène la partie jusqu'à l'étape bonus (`progress.kind === 'bonus'`, phase
 * `awaiting-answer`) : une manche finale résolue, dont l'énigme porte une
 * réponse bonus, enchaînée sur `round/next`. `roundCount: 1` fait de cette
 * unique manche la manche finale — le chemin le plus court vers cette étape.
 */
function versEtapeBonus(options: {
  readonly bonusAnswer: string
  readonly answer?: string
  readonly players?: readonly Player[]
}): GameState {
  const state = demarrer({
    config: { roundCount: 1 },
    answer: options.answer ?? 'le vent',
    bonusAnswer: options.bonusAnswer,
    players: options.players ?? [joueur('Alice')],
  })
  const resolue = resoudre(state, manche(state).puzzle.answer)
  return jouer(resolue, {
    type: 'round/next',
    puzzle: enigme('la mer', 'suite-bonus'),
    firstPlayer: 0,
  })
}

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

// `restoreMocks` remet les espions en place mais ne défait pas `stubGlobal` :
// sans ça, le `fetch` d'un test fuiterait dans le suivant.
afterEach(() => {
  vi.unstubAllGlobals()
})

/**
 * jsdom (30.0.1, utilisé ici) réagit à l'attribut `open` mais n'implémente ni
 * `showModal()` ni `close()` sur `HTMLDialogElement` : sans ce stub, ouvrir la
 * boîte « Résoudre » lèverait un `TypeError`. Recopié depuis
 * `ResolveDialog.test.tsx`, volontairement pas importé — c'est un artefact de
 * test, pas un comportement du composant.
 */
if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
  let previouslyFocused: HTMLElement | null = null

  HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement): void {
    previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null
    this.open = true
  }

  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement): void {
    this.open = false
    this.dispatchEvent(new Event('close'))
    previouslyFocused?.focus()
    previouslyFocused = null
  }
}

describe('GameRoute', () => {
  it('affiche le plateau, les 26 touches, les scores et les commandes', () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice'), joueur('Bob')] })))
    monterApp('/jeu')

    // Deux occurrences : le plateau l'affiche, et `ResolveDialog` — toujours
    // monté, `open` ne fait qu'en contrôler l'ouverture native — la rappelle
    // aussi pour le cas où la boîte s'ouvrirait plateau masqué.
    expect(screen.getAllByText('Catégorie : Test')).toHaveLength(2)
    expect(screen.getByRole('group', { name: 'Clavier des lettres' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /^Lettre /u })).toHaveLength(26)
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Bob')).toBeInTheDocument()
    // Actif : c'est le pendant du test du tour de bot, où ce même bouton est inerte.
    expect(screen.getByRole('button', { name: 'Lancer' })).toHaveAttribute(
      'aria-disabled',
      'false',
    )
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

  /**
   * Un seul joueur : le tour ne change pas, la cagnotte reste à zéro, aucune
   * manche ne se termine — rien d'autre à l'écran ne dit que Z est absent.
   * Sans `EventFeedback`, seule la live region `sr-only` le saurait.
   */
  it('affiche à l’œil le résultat d’un coup qui n’a aucun autre retour visible', async () => {
    const enManche = avecPhase(demarrer({ players: [joueur('Alice')], answer: 'le vent' }), {
      kind: 'awaiting-consonant',
      value: 300,
      segment: { kind: 'cash', index: cash(300), value: 300 },
    })
    saveGame(jeu(enManche))
    const user = userEvent.setup()
    monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Lettre Z' }))

    // « Pas de Z. » apparaît deux fois : une fois dans la live region
    // `sr-only` (déjà couverte par d'autres tests), et maintenant dans le
    // retour visible d'`EventFeedback` — la preuve que l'œil reçoit la même
    // phrase que le lecteur d'écran.
    expect(await screen.findAllByText('Pas de Z.')).toHaveLength(2)
  })

  it('« Lancer » puis « Stop » font entrer puis sortir de la phase de spinning, sans figer la partie', async () => {
    // jsdom n'implémente pas `Element.prototype.animate` : `useWheelSpin`
    // dégrade alors vers un règlement différé d'environ 300 ms (bien avant le
    // chien de garde de `useGameEffects`, qui n'intervient qu'à `SPIN_MAX_MS + 500`).
    // Sans timers factices, `findByRole` verrait l'élément déjà monté et
    // résoudrait avant les 300 ms, sans jamais prouver la sortie de `spinning`.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    try {
      saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
      const user = userEvent.setup({ delay: null })
      monterApp('/jeu')

      // Premier clic : arme la visée, ne lance encore rien.
      await user.click(screen.getByRole('button', { name: 'Lancer' }))
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
      expect(screen.getByRole('status')).not.toHaveTextContent('La roue tourne')

      // Second clic : lit l'angle visé et lance réellement.
      await user.click(screen.getByRole('button', { name: 'Stop' }))
      expect(screen.getByRole('status')).toHaveTextContent('La roue tourne')

      // Confortablement au-delà du règlement dégradé de la roue, et très en
      // dessous du chien de garde : ce qu'on observe est donc bien la roue qui
      // rend la main, pas le filet de sécurité.
      act(() => {
        vi.advanceTimersByTime(500)
      })

      // Sans le règlement de la roue, le statut resterait bloqué sur l'annonce
      // de lancement : la phase serait toujours `spinning`.
      expect(screen.getByRole('status')).not.toHaveTextContent('La roue tourne')
    } finally {
      vi.useRealTimers()
    }
  })

  it('un seul clic sur « Lancer » arme la visée sans lancer la roue', async () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const user = userEvent.setup()
    monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Lancer' }))

    // Le bouton s'appelle désormais « Stop », et rien n'indique que la roue
    // tourne : `spin` n'a pas encore été appelé, seule la visée a démarré.
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(screen.getByRole('status')).not.toHaveTextContent('La roue tourne')
  })

  /**
   * L'arc de visée est `aria-hidden`, sans rôle ni nom accessible : aucune
   * requête par rôle ne peut le désigner. Seuls `Wheel.tsx`, `WheelPointer.tsx`
   * et `AimArc.tsx` dessinent un `<svg>` dans tout le dépôt (vérifié par
   * `grep`) : tant que round !== null, le compte de `<svg>` est de deux
   * (disque + aiguille) hors visée, et de trois pendant — c'est ce compte, pas
   * un sélecteur de classe, qui prouve le montage et le démontage de l'arc.
   */
  it('l’arc de visée n’est monté que pendant la visée : il apparaît puis disparaît immédiatement', async () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const user = userEvent.setup()
    const { container } = monterApp('/jeu')

    expect(container.querySelectorAll('svg')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Lancer' }))
    expect(container.querySelectorAll('svg')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Stop' }))
    // L'utilisateur veut laisser le joueur dans le doute pendant la rotation :
    // l'arc doit disparaître au moment même où le lancer part, pas seulement
    // à son terme.
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })

  it('en mode « lancer simple », un seul clic sur « Tourner » lance la roue', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, throwMode: 'simple' })
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const user = userEvent.setup()
    monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Tourner' }))

    // Un seul appui suffit : la partie entre en rotation, gelant les
    // commandes — le même mécanisme que les autres tests de cette suite.
    expect(screen.getByRole('button', { name: 'Tourner' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
  })

  it('en mode « lancer simple », ni « Lancer », ni « Stop », ni arc n’apparaissent', async () => {
    saveSettings({ ...DEFAULT_SETTINGS, throwMode: 'simple' })
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const user = userEvent.setup()
    const { container } = monterApp('/jeu')

    expect(screen.queryByRole('button', { name: 'Lancer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    // Deux `<svg>` (disque + aiguille), jamais trois : l'arc n'est jamais monté
    // en mode simple, voir le commentaire du test homologue en mode visée.
    expect(container.querySelectorAll('svg')).toHaveLength(2)

    await user.click(screen.getByRole('button', { name: 'Tourner' }))

    expect(screen.queryByRole('button', { name: 'Lancer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })

  it('deux « Espace » arment puis lancent la roue, comme deux clics', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    try {
      saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
      monterApp('/jeu')

      fireEvent.keyDown(document.body, { key: ' ' })
      expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
      expect(screen.getByRole('status')).not.toHaveTextContent('La roue tourne')

      fireEvent.keyDown(document.body, { key: ' ' })
      expect(screen.getByRole('status')).toHaveTextContent('La roue tourne')

      act(() => {
        vi.advanceTimersByTime(500)
      })
      expect(screen.getByRole('status')).not.toHaveTextContent('La roue tourne')
    } finally {
      vi.useRealTimers()
    }
  })

  it('n’expose aucun rôle de valeur dans l’arbre accessible pendant la visée', async () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const user = userEvent.setup()
    monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Lancer' }))

    // L'angle visé change une soixantaine de fois par seconde : aucun rôle
    // `progressbar`, `meter` ni `slider` ne doit apparaître, sous peine de
    // noyer un lecteur d'écran sous des annonces inutilisables.
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()
    expect(screen.queryByRole('meter')).not.toBeInTheDocument()
    expect(screen.queryByRole('slider')).not.toBeInTheDocument()
  })

  /**
   * Chemin réel, pas fabriqué : acheter une voyelle absente fait tourner la
   * main sans quitter `awaiting-action` (`engine.ts`, cas `letter/buy-vowel`,
   * `rotation(turn.seat + 1, count)`) — c'est le seul geste légal, atteignable
   * depuis le clavier sans passer par « Résoudre » ni « Passer la main »
   * (qui annulent déjà explicitement la visée), qui fait passer la main à un
   * bot tout en restant dans la même phase. Il exerce donc la branche
   * `awaitingBotTurn` de l'effet d'annulation, jamais la branche `phaseKind`.
   */
  it('la visée s’annule quand la main passe à un bot, sans changement de phase', async () => {
    saveGame(jeu(avecPot(demarrer({ players: [joueur('Alice'), bot('Bot 1')] }), 0, 300)))
    const user = userEvent.setup()
    const { container } = monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Lancer' }))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()
    expect(container.querySelectorAll('svg')).toHaveLength(3)

    // « LE VENT » ne contient pas de A : la main tourne vers Bot 1, la manche
    // reste en `awaiting-action`.
    await user.click(screen.getByRole('button', { name: 'Lettre A' }))

    expect(await screen.findByText(/^Au tour de Bot 1/u)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })

  it('la visée s’annule à l’ouverture de « Résoudre »', async () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const user = userEvent.setup()
    monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Lancer' }))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Résoudre' }))
    expect(screen.getByLabelText('Votre réponse')).toHaveFocus()

    // Le dialogue modal masque visuellement le plateau, mais le stub de
    // `showModal` posé en tête de ce fichier ne rend rien `inert` : le bouton
    // de lancer reste bien dans l'arbre, ce qui permet de vérifier ici même,
    // sans fermer la boîte, qu'il est retombé sur « Lancer ».
    expect(screen.getByRole('button', { name: 'Lancer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
  })

  it('la visée s’annule quand la manche se termine sans passer par « Résoudre » ni « Passer la main »', async () => {
    // Toutes les consonnes de « LE VENT » proposées (L, V, N, T) et un pot qui
    // couvre la voyelle manquante (E) : l'achat de la dernière voyelle résout
    // la manche directement depuis `awaiting-action`, sans ouvrir le dialogue
    // ni passer la main. C'est le seul chemin qui exerce l'effet de
    // `GameRoute` (qui annule la visée dès que la phase quitte
    // `awaiting-action`) sans passer par les annulations déjà explicites
    // d'`openResolve` et de `handlePass`.
    let state = avecLettres(demarrer({ players: [joueur('Alice')] }), ['L', 'V', 'N', 'T'])
    state = avecPot(state, 0, 250)
    saveGame(jeu(state))
    const user = userEvent.setup()
    monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Lancer' }))
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lettre E' }))

    expect(await screen.findByRole('heading', { name: 'Manche terminée' })).toBeInTheDocument()

    // Sans l'effet qui annule la visée, `aiming` resterait vrai au-delà de
    // cette manche : la manche suivante démarrerait avec un bouton « Stop »
    // fantôme, alors que rien n'a été armé pour son propre lancer.
    await user.click(screen.getByRole('button', { name: 'Manche suivante' }))

    expect(screen.getByRole('button', { name: 'Lancer' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument()
  })

  /**
   * Horloges factices sans `shouldAdvanceTime` et sans jamais avancer : le
   * minuteur du bot ne doit pas se déclencher pendant ce test, sous peine de
   * remplacer l'état observé par le coup suivant. Aucun `user-event` ici, donc
   * aucun risque de pendaison — c'est le clic qui l'exige, pas le rendu.
   */
  it('rend les commandes et le clavier inertes pendant le tour d’un bot', () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      saveGame(jeu(demarrer({ players: [bot('Bot 1'), joueur('Alice')], firstPlayer: 0 })))
      monterApp('/jeu')

      expect(screen.getByText(/^Au tour de Bot 1/u)).toBeInTheDocument()
      // « Passer la main » exige d'être bloqué (`isStuck`), ce qui n'est pas le
      // cas ici : le vérifier ferait passer ce test même sans verrou de tour.
      // « Tourner » suffit à prouver le verrou.
      expect(screen.getByRole('button', { name: 'Lancer' })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
      // Les 26 touches sont annoncées « indisponible » et non « déjà proposée » :
      // aucune lettre n'est sortie, c'est bien le tour du bot qui les éteint.
      expect(screen.getAllByRole('button', { name: /^Lettre .+, indisponible$/u })).toHaveLength(26)
    } finally {
      vi.useRealTimers()
    }
  })

  it('affiche le panneau de fin de manche et enchaîne sur la manche suivante', async () => {
    saveGame(jeu(resoudre(demarrer({ players: [joueur('Alice')] }), 'le vent')))
    const user = userEvent.setup()
    monterApp('/jeu')

    expect(screen.getByRole('heading', { name: 'Manche terminée' })).toBeInTheDocument()
    const boutonSuivant = screen.getByRole('button', { name: 'Manche suivante' })
    expect(boutonSuivant).toBeInTheDocument()

    await user.click(boutonSuivant)

    expect(screen.getByRole('heading', { name: /^Manche 2 sur 3/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Manche terminée' })).not.toBeInTheDocument()
  })

  it('« Résoudre » ouvre la boîte et focalise le champ de réponse', async () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const user = userEvent.setup()
    monterApp('/jeu')

    const bouton = screen.getByRole('button', { name: 'Résoudre' })
    expect(bouton).toHaveAttribute('aria-disabled', 'false')

    await user.click(bouton)

    expect(screen.getByLabelText('Votre réponse')).toHaveFocus()
  })

  it('une proposition exacte termine la manche sans appeler le réseau', async () => {
    // Le verdict est un calcul synchrone du reducer (`matchesAnswer`) : aucun
    // juge distant, aucun `fetch` — c'est ce que ce test vérifie.
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const user = userEvent.setup()
    monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Résoudre' }))
    await user.type(screen.getByLabelText('Votre réponse'), 'le vent')
    await user.click(screen.getByRole('button', { name: 'Proposer' }))

    expect(await screen.findByRole('heading', { name: 'Manche terminée' })).toBeInTheDocument()
    // La boîte disparaît entièrement : `ResolveDialog` n'est plus monté une
    // fois la manche terminée (`round` devient `null`).
    expect(screen.queryByLabelText('Votre réponse')).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('une proposition fausse ferme la boîte et passe la main sans rien coûter', async () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice'), joueur('Bob')] })))
    const user = userEvent.setup()
    const { container } = monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Résoudre' }))
    await user.type(screen.getByLabelText('Votre réponse'), 'une réponse fausse')
    await user.click(screen.getByRole('button', { name: 'Proposer' }))

    // Le verdict est immédiat : la boîte se ferme d'elle-même, gagnant ou non
    // — `ResolveDialog` reste monté (la manche continue avec Bob), c'est son
    // état natif `open` qui doit être retombé, pas sa présence dans le DOM.
    expect(container.querySelector('dialog')).toHaveProperty('open', false)
    expect(await screen.findByText(/^Au tour de Bob/u)).toBeInTheDocument()
  })

  it('Entrée ouvre la boîte « Résoudre »', () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    monterApp('/jeu')

    fireEvent.keyDown(document.body, { key: 'Enter' })

    expect(screen.getByLabelText('Votre réponse')).toHaveFocus()
  })

  /**
   * `avecLettres` place la manche avec toutes les consonnes déjà proposées
   * (scénario repris d'`engine.test.ts`) : sans consonne restante et sans
   * cagnotte pour acheter une voyelle, `isStuck` devient vrai et « Passer la
   * main » est légal. En solo, un seul `turn/pass` suffit à bloquer la manche
   * puisque `passes` (1) atteint `players.length` (1) — c'est une vraie action
   * du reducer, pas un `RoundState` fabriqué à la main.
   */
  it('affiche la carte de manche bloquée, révèle la réponse et enchaîne sur la manche suivante', async () => {
    let state = avecLettres(demarrer({ players: [joueur('Alice')] }), [...CONSONANTS])
    const by = courant(state).id
    state = jouer(state, { type: 'turn/pass', by })
    saveGame(jeu(state))
    const user = userEvent.setup()
    monterApp('/jeu')

    expect(screen.getByRole('heading', { name: 'Manche bloquée' })).toBeInTheDocument()
    expect(screen.getByText(/Réponse : LE VENT\./)).toBeInTheDocument()
    // Plus aucune touche n'est jouable : les consonnes déjà proposées restent
    // « déjà proposée », les voyelles restantes passent à « indisponible »
    // (`canGuess` refuse tout hors `awaiting-consonant`/`awaiting-action`) —
    // dans les deux cas, aucune n'a le libellé nu d'une touche disponible.
    expect(screen.queryAllByRole('button', { name: /^Lettre [A-Z]$/u })).toHaveLength(0)

    const boutonSuivant = screen.getByRole('button', { name: 'Manche suivante' })
    await user.click(boutonSuivant)

    expect(screen.getByRole('heading', { name: /^Manche 2 sur 3/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Manche bloquée' })).not.toBeInTheDocument()
  })

  it('annonce la manche finale quand l’énigme en cours est une question', () => {
    saveGame(
      jeu(demarrer({ players: [joueur('Alice')], answer: 'le vent', bonusAnswer: 'ZBRAXOFINGUE' })),
    )
    monterApp('/jeu')

    expect(screen.getByText(/Manche finale/)).toBeInTheDocument()
  })

  it('ne mentionne pas la manche finale sur une énigme ordinaire', () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    monterApp('/jeu')

    expect(screen.queryByText(/Manche finale/)).not.toBeInTheDocument()
  })

  /**
   * La réponse attendue n'a rien à faire à l'écran tant que la manche finale
   * est en cours — l'étape bonus, seule à la connaître, n'a pas encore
   * commencé ici (`progress.kind === 'round'`).
   */
  it('n’affiche jamais la réponse attendue de la question, sous aucune forme', () => {
    saveGame(
      jeu(demarrer({ players: [joueur('Alice')], answer: 'le vent', bonusAnswer: 'ZBRAXOFINGUE' })),
    )
    const { container } = monterApp('/jeu')

    expect(container.innerHTML).not.toContain('ZBRAXOFINGUE')
  })

  describe('étape bonus', () => {
    /**
     * Le plus important de cette suite : `expected` vit dans `game.progress`
     * (donc dans React DevTools et dans `localStorage`), mais ne doit jamais
     * atteindre le DOM — ni en texte visible, ni dans un attribut, ni dans un
     * `aria-label`. Une future prop `expected` ajoutée par erreur à
     * `BonusQuestion` ferait tomber ce test.
     */
    it('n’affiche jamais la réponse attendue, sous aucune forme, pendant l’étape bonus', () => {
      saveGame(jeu(versEtapeBonus({ bonusAnswer: 'ZBRAXOFINGUE' })))
      const { container } = monterApp('/jeu')

      expect(container.innerHTML).not.toContain('ZBRAXOFINGUE')
    })

    it('affiche la carte de la question bonus avec l’énoncé, le montant et le nom du joueur', () => {
      saveGame(jeu(versEtapeBonus({ bonusAnswer: 'la loire', answer: 'le vent' })))
      monterApp('/jeu')

      expect(screen.getByRole('heading', { name: 'Question bonus' })).toBeInTheDocument()
      // `normalizeAnswer` met l'énoncé en majuscules : c'est la même chaîne
      // que celle déjà affichée par le plateau pendant la manche.
      expect(screen.getByText('LE VENT')).toBeInTheDocument()
      // Deux occurrences : le tableau des scores affiche déjà « Gains : 500
      // euros » pour Alice — la carte bonus reprend le même montant.
      expect(screen.getAllByText(/500 euros/)).toHaveLength(2)
      expect(screen.getByText(/au tour de Alice/)).toBeInTheDocument()
    })

    /**
     * `useRound()` rend `null` dès que `progress.kind !== 'round'` : la roue,
     * le plateau, le clavier et la barre de commandes sont donc déjà
     * conditionnés sur `round !== null` dans `GameRoute` et se retirent seuls,
     * sans qu'aucune suppression ne soit nécessaire pour l'étape bonus.
     * Ce test tomberait si l'un de ces quatre blocs redevenait visible.
     */
    it('ne montre ni roue, ni plateau, ni clavier, ni barre de commandes pendant l’étape bonus', () => {
      saveGame(jeu(versEtapeBonus({ bonusAnswer: 'la loire' })))
      monterApp('/jeu')

      expect(screen.queryByRole('button', { name: 'Lancer' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Passer la main' })).not.toBeInTheDocument()
      expect(screen.queryByRole('group', { name: 'Clavier des lettres' })).not.toBeInTheDocument()
      expect(screen.queryByText('Catégorie : Test')).not.toBeInTheDocument()
    })

    it('ne redirige pas vers /resultats pendant l’étape bonus', () => {
      saveGame(jeu(versEtapeBonus({ bonusAnswer: 'la loire' })))
      monterApp('/jeu')

      // La redirection de fin de partie ne se déclenche que sur `game-over` :
      // `bonus` en est un membre distinct de `GameProgress`, la carte de
      // question doit donc rester affichée sur `/jeu`.
      expect(screen.getByRole('heading', { name: 'Question bonus' })).toBeInTheDocument()
      expect(screen.queryByRole('heading', { name: /Vainqueur|Égalité/ })).not.toBeInTheDocument()
    })

    it('« Répondre » appelle answerBonus : la réponse part vers le juge', async () => {
      saveMistralKey('clé-test')
      // Une promesse qui ne se règle jamais : la réponse part bien vers le
      // juge (donc `answerBonus` a été appelé), sans qu'un verdict ne vienne
      // perturber l'assertion en cours de route.
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
      saveGame(jeu(versEtapeBonus({ bonusAnswer: 'la loire' })))
      const user = userEvent.setup()
      monterApp('/jeu')

      await user.type(screen.getByLabelText('Votre réponse'), 'une réponse')
      await user.click(screen.getByRole('button', { name: 'Répondre' }))

      // La preuve que `answerBonus` a bien été appelé : le champ devient en
      // lecture seule et la boîte de verdict apparaît, ce que seule la
      // transition vers la phase `judging` produit.
      expect(await screen.findByText('Le juge examine votre réponse…')).toBeInTheDocument()
    })

    it('« Passer » appelle skipBonus : la partie se termine sans verdict', async () => {
      saveGame(jeu(versEtapeBonus({ bonusAnswer: 'la loire' })))
      const user = userEvent.setup()
      monterApp('/jeu')

      await user.click(screen.getByRole('button', { name: 'Passer' }))

      // `skipBonus` dispatche `bonus/skip`, qui termine toujours la partie
      // (`finishBonus`) : la route de jeu s'efface au profit des résultats.
      expect(await screen.findByRole('heading', { name: /Vainqueur|Égalité/ })).toBeInTheDocument()
    })

    /**
     * `phase: 'judging'` n'est volontairement **pas** persistée (voir
     * `PersistedBonus` dans `storage/snapshot.ts`) : un verdict en vol
     * abandonné à la fermeture de l'onglet redeviendrait `awaiting-answer` au
     * rechargement, pour que le joueur retape sans avoir grillé sa question.
     * La phase `judging` ne s'observe donc qu'en la déclenchant par un vrai
     * clic sur « Répondre », jamais en la préfabriquant dans une sauvegarde.
     */
    it('affiche l’attente pendant que le juge délibère', async () => {
      saveMistralKey('clé-test')
      // Ne se règle jamais : la phase reste `judging` assez longtemps pour
      // l'assertion, sans qu'un verdict ne vienne la faire progresser.
      vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
      saveGame(jeu(versEtapeBonus({ bonusAnswer: 'la loire' })))
      const user = userEvent.setup()
      monterApp('/jeu')

      await user.type(screen.getByLabelText('Votre réponse'), 'une réponse fausse')
      await user.click(screen.getByRole('button', { name: 'Répondre' }))

      expect(await screen.findByText('Le juge examine votre réponse…')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Répondre' })).toHaveAttribute(
        'aria-disabled',
        'true',
      )
    })

    it('affiche la phrase d’échec du juge après une panne réseau', async () => {
      saveMistralKey('clé-test')
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('panne simulée')))
      saveGame(jeu(versEtapeBonus({ bonusAnswer: 'la loire' })))
      const user = userEvent.setup()
      monterApp('/jeu')

      await user.type(screen.getByLabelText('Votre réponse'), 'une réponse fausse')
      await user.click(screen.getByRole('button', { name: 'Répondre' }))

      expect(
        await screen.findByText('Le juge est injoignable. Vérifiez votre connexion, puis réessayez.'),
      ).toBeInTheDocument()
    })
  })
})
