// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Puzzle } from '../game/types'
import { cash, demarrer, enigme, jeu, proposer, tourner } from '../test/game'
import { STORAGE_KEYS } from './keys'
import {
  clearAllData,
  clearGame,
  loadCustomPuzzles,
  loadGame,
  loadMistralKey,
  loadSettings,
  saveCustomPuzzles,
  saveGame,
  saveMistralKey,
  saveSettings,
} from './persist'
import { DEFAULT_SETTINGS } from './settings'

const CLE = 'sk-abcdef0123456789'

beforeEach(() => {
  clearAllData()
  localStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('réglages et énigmes perso', () => {
  it('relisent ce qu’ils ont écrit', () => {
    const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const, opponents: 1 }
    saveSettings(settings)
    expect(loadSettings()).toEqual({ ok: true, value: settings })
  })

  it('signalent une absence, sans inventer de valeur par défaut', () => {
    // Le défaut est une décision d'interface, pas de stockage.
    expect(loadSettings()).toEqual({ ok: false, reason: 'absent' })
    expect(loadCustomPuzzles()).toEqual({ ok: false, reason: 'absent' })
  })

  it('relisent une liste d’énigmes perso', () => {
    const enigmes: readonly Puzzle[] = [
      { ...enigme('la clé du mystère', 'user-1'), source: 'custom' },
    ]
    saveCustomPuzzles(enigmes)
    expect(loadCustomPuzzles()).toEqual({ ok: true, value: enigmes })
  })
})

describe('sauvegarde de partie', () => {
  it('fait l’aller-retour', () => {
    const game = jeu(proposer(tourner(demarrer(), cash(500)), 'V'))
    saveGame(game)
    expect(loadGame()).toEqual({ ok: true, value: game })
  })

  it('disparaît quand on l’efface', () => {
    saveGame(jeu(demarrer()))
    clearGame()
    expect(loadGame()).toEqual({ ok: false, reason: 'absent' })
  })

  it('rend « unreadable » sur un contenu bricolé, sans lever', () => {
    localStorage.setItem(STORAGE_KEYS.save, '{pas du JSON')
    expect(loadGame()).toEqual({ ok: false, reason: 'unreadable' })
  })
})

describe('stockage indisponible', () => {
  it('ne lève pas quand l’écriture est refusée, et garde la session cohérente', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })

    const game = jeu(demarrer())
    expect(() => saveGame(game)).not.toThrow()
    expect(setItem).toHaveBeenCalled()
    // Le repli en mémoire ne survivra pas au rechargement, mais la partie en cours
    // se relit : c'est tout ce qu'on lui demande.
    expect(loadGame()).toEqual({ ok: true, value: game })
  })

  it('ne lève pas quand la lecture est refusée', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(loadGame()).toEqual({ ok: false, reason: 'unreadable' })
  })
})

describe('clé Mistral', () => {
  it('se relit, se nettoie de ses espaces et s’efface', () => {
    saveMistralKey(`  ${CLE}  `)
    expect(loadMistralKey()).toBe(CLE)

    saveMistralKey('   ')
    expect(loadMistralKey()).toBeNull()
  })

  it('vit sous sa propre clé, jamais dans les réglages ni la sauvegarde', () => {
    saveMistralKey(CLE)
    saveSettings(DEFAULT_SETTINGS)
    saveGame(jeu(demarrer()))

    expect(localStorage.getItem(STORAGE_KEYS.mistral)).toBe(CLE)
    for (const key of [STORAGE_KEYS.settings, STORAGE_KEYS.save, STORAGE_KEYS.puzzles]) {
      expect(localStorage.getItem(key) ?? '', `${key} ne doit pas porter la clé`).not.toContain(CLE)
    }
  })

  it('part avec la réinitialisation des données', () => {
    saveMistralKey(CLE)
    saveSettings(DEFAULT_SETTINGS)
    clearAllData()

    expect(loadMistralKey()).toBeNull()
    expect(loadSettings()).toEqual({ ok: false, reason: 'absent' })
    expect(localStorage.length).toBe(0)
  })
})
