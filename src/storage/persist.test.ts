// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Puzzle } from '../game/types'
import { cash, demarrer, enigme, jeu, proposer, tourner } from '../test/game'
import { LEGACY_KEYS, STORAGE_KEYS } from './keys'
import {
  clearAllData,
  clearGame,
  clearMistralKey,
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
    // `wheelAngle` fait exception : `tourner` l'a fait avancer, mais il n'a pas
    // d'équivalent persisté (voir le docblock de `toPersisted`) et revient donc
    // à son angle de repos initial, pas à celui d'avant la sauvegarde.
    expect(loadGame()).toEqual({ ok: true, value: { ...game, wheelAngle: 0 } })
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

  it('vit sous sa propre clé, jamais dans les réglages ni la sauvegarde, et masquée', () => {
    saveMistralKey(CLE)
    saveSettings(DEFAULT_SETTINGS)
    saveGame(jeu(demarrer()))

    const brut = localStorage.getItem(STORAGE_KEYS.mistral) ?? ''
    // Tout l'intérêt de la tâche : la valeur en stockage ne doit plus égaler
    // la clé, ni même la contenir en sous-chaîne.
    expect(brut).not.toBe(CLE)
    expect(brut).not.toContain(CLE)
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

  it('migre une ancienne entrée en clair vers la forme masquée', () => {
    // Simule une installation d'avant le masquage : la clé traînait en clair
    // sous l'ancien nom de clé de stockage.
    localStorage.setItem(LEGACY_KEYS[0], CLE)

    expect(loadMistralKey()).toBe(CLE)
    expect(localStorage.getItem(LEGACY_KEYS[0])).toBeNull()
    const migree = localStorage.getItem(STORAGE_KEYS.mistral) ?? ''
    expect(migree).not.toBe('')
    expect(migree).not.toContain(CLE)
  })

  it('rend null sur une nouvelle entrée corrompue, sans lever', () => {
    localStorage.setItem(STORAGE_KEYS.mistral, 'v2:!!!')
    expect(() => loadMistralKey()).not.toThrow()
    expect(loadMistralKey()).toBeNull()
  })

  it('efface aussi l’ancienne entrée en clair lors de la réinitialisation', () => {
    localStorage.setItem(LEGACY_KEYS[0], CLE)
    clearAllData()
    expect(localStorage.getItem(LEGACY_KEYS[0])).toBeNull()
    expect(localStorage.length).toBe(0)
  })

  it('efface les deux entrées, nouvelle et ancienne', () => {
    saveMistralKey(CLE)
    localStorage.setItem(LEGACY_KEYS[0], CLE)
    clearMistralKey()

    expect(localStorage.getItem(STORAGE_KEYS.mistral)).toBeNull()
    expect(localStorage.getItem(LEGACY_KEYS[0])).toBeNull()
    expect(loadMistralKey()).toBeNull()
  })
})
