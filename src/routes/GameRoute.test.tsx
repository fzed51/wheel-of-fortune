// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CONSONANTS } from '../game/puzzle'
import { clearAllData, saveGame } from '../storage/persist'
import {
  avecLettres,
  avecPhase,
  bot,
  cash,
  courant,
  demarrer,
  jeu,
  joueur,
  jouer,
  resoudre,
} from '../test/game'
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
    expect(screen.getByRole('button', { name: 'Tourner' })).toHaveAttribute(
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

  it('« Tourner » fait sortir la phase de spinning et ne fige pas la partie', async () => {
    // jsdom n'implémente pas `Element.prototype.animate` : `useWheelSpin`
    // dégrade alors vers un règlement différé d'environ 300 ms (bien avant le
    // chien de garde de `useGameEffects`, qui n'intervient qu'à `SPIN_MS + 500`).
    // Sans timers factices, `findByRole` verrait l'élément déjà monté et
    // résoudrait avant les 300 ms, sans jamais prouver la sortie de `spinning`.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'], shouldAdvanceTime: true })
    try {
      saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
      const user = userEvent.setup({ delay: null })
      monterApp('/jeu')

      await user.click(screen.getByRole('button', { name: 'Tourner' }))
      expect(screen.getByRole('status')).toHaveTextContent('La roue tourne…')

      // Confortablement au-delà du règlement dégradé de la roue, et très en
      // dessous du chien de garde : ce qu'on observe est donc bien la roue qui
      // rend la main, pas le filet de sécurité.
      act(() => {
        vi.advanceTimersByTime(500)
      })

      // Sans le règlement de la roue, le statut resterait bloqué sur l'annonce
      // de lancement : la phase serait toujours `spinning`.
      expect(screen.getByRole('status')).not.toHaveTextContent('La roue tourne…')
    } finally {
      vi.useRealTimers()
    }
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
      expect(screen.getByRole('button', { name: 'Tourner' })).toHaveAttribute(
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
})
