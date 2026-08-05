// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { announceJudgeFailure } from '../game/announce'
import { clearAllData, saveGame, saveMistralKey } from '../storage/persist'
import { avecPhase, avecPot, bot, cash, demarrer, jeu, joueur, resoudre } from '../test/game'
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
      // « Tourner » est le seul des trois boutons qu'un humain aurait ici :
      // « Résoudre » exige en plus une clé enregistrée (absente ici) et
      // « Passer la main » exige d'être bloqué. Les vérifier tous les trois
      // ferait passer ce test même sans verrou de tour.
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
    saveGame(jeu(resoudre(demarrer({ players: [joueur('Alice')] }), true)))
    const user = userEvent.setup()
    monterApp('/jeu')

    expect(screen.getByRole('heading', { name: 'Manche terminée' })).toBeInTheDocument()
    const boutonSuivant = screen.getByRole('button', { name: 'Manche suivante' })
    expect(boutonSuivant).toBeInTheDocument()

    await user.click(boutonSuivant)

    expect(screen.getByRole('heading', { name: /^Manche 2 sur 3/ })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Manche terminée' })).not.toBeInTheDocument()
  })

  it('sans clé enregistrée, « Résoudre » est inactif et renvoie aux Réglages', () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    monterApp('/jeu')

    expect(screen.getByRole('button', { name: 'Résoudre' })).toHaveAttribute('aria-disabled', 'true')
    expect(
      screen.getByText("Configurez une clé d'API dans les Réglages pour proposer une réponse."),
    ).toBeInTheDocument()
  })

  it('avec une clé enregistrée, « Résoudre » ouvre la boîte et focalise le champ de réponse', async () => {
    saveMistralKey('sk-une-cle')
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const user = userEvent.setup()
    monterApp('/jeu')

    const bouton = screen.getByRole('button', { name: 'Résoudre' })
    expect(bouton).toHaveAttribute('aria-disabled', 'false')

    await user.click(bouton)

    expect(screen.getByLabelText('Votre réponse')).toHaveFocus()
  })

  it('une proposition exacte termine la manche sans appeler le juge en réseau', async () => {
    saveMistralKey('sk-une-cle')
    // Le pré-filtre du juge tranche « correct » sur une égalité normalisée,
    // sans toucher au réseau : c'est le moyen le plus simple de prouver une
    // résolution réussie sans dépendre d'un `fetch` simulé.
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

  it('un échec réseau du juge sur une proposition ambiguë laisse la boîte ouverte et ne coûte rien', async () => {
    saveMistralKey('sk-une-cle')
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    // Réponse longue avec une seule lettre changée : assez proche pour sortir
    // de la bande décidée localement par le pré-filtre (« LE VENT », trop
    // court, s'y ferait trancher sans jamais atteindre le réseau) et passer la
    // main au juge, dont l'appel échoue ici.
    let state = demarrer({
      players: [joueur('Alice')],
      answer: 'la cle est sous le paillasson',
    })
    state = avecPot(state, 0, 1234)
    saveGame(jeu(state))
    const user = userEvent.setup()
    const { container } = monterApp('/jeu')

    await user.click(screen.getByRole('button', { name: 'Résoudre' }))
    await user.type(screen.getByLabelText('Votre réponse'), 'la cle est sous le paillassom')
    await user.click(screen.getByRole('button', { name: 'Proposer' }))

    // Scopé à la boîte : la même phrase est aussi portée par la live region
    // d'alerte du layout racine (`announceTransition`), et matcherait deux
    // fois sans ce cadrage.
    const dialogue = container.querySelector('dialog')
    expect(dialogue).not.toBeNull()
    if (dialogue === null) throw new Error('dialogue introuvable')
    expect(await within(dialogue).findByText(announceJudgeFailure('network'))).toBeInTheDocument()
    // La boîte est réellement encore ouverte (état natif du `<dialog>`), pas
    // seulement le message d'échec présent dans un fragment démonté.
    expect(dialogue).toHaveProperty('open', true)
    expect(screen.getByLabelText('Votre réponse')).toBeInTheDocument()
    expect(screen.getByText(/cagnotte 1 234 euros/)).toBeInTheDocument()
  })

  it("Entrée n'ouvre pas la boîte « Résoudre » sans clé enregistrée", () => {
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    const { container } = monterApp('/jeu')

    // `usePhysicalKeyboard` écoute `document` sans connaître la légalité de
    // l'action : c'est `openResolve`, dans `GameRoute`, qui doit refuser
    // l'ouverture faute de clé (`resolveEnabled` à `false` ici).
    fireEvent.keyDown(document.body, { key: 'Enter' })

    expect(container.querySelector('dialog')).toHaveProperty('open', false)
  })

  it('Entrée ouvre la boîte « Résoudre » avec une clé enregistrée', () => {
    saveMistralKey('sk-une-cle')
    saveGame(jeu(demarrer({ players: [joueur('Alice')] })))
    monterApp('/jeu')

    fireEvent.keyDown(document.body, { key: 'Enter' })

    expect(screen.getByLabelText('Votre réponse')).toHaveFocus()
  })
})
