import { describe, expect, it } from 'vitest'
import {
  CONSONANTS,
  VOWELS,
  cellsOf,
  countOccurrences,
  isSolved,
  letterOf,
  lettersOf,
  normalizeAnswer,
  revealedLetters,
} from './puzzle'
import type { Letter, Puzzle, RoundState } from './types'
import { asPuzzleId } from './types'

function round(answer: string, guessed: readonly Letter[]): RoundState {
  const puzzle: Puzzle = {
    id: asPuzzleId('test-001'),
    answer: normalizeAnswer(answer),
    category: 'Test',
    source: 'pack',
  }
  return { index: 0, puzzle, guessed, phase: { kind: 'awaiting-action' } }
}

describe('letterOf', () => {
  it('replie toutes les classes d’accents français sur leur lettre de base', () => {
    for (const char of ['É', 'È', 'Ê', 'Ë']) expect(letterOf(char)).toBe('E')
    for (const char of ['À', 'Â', 'Ä']) expect(letterOf(char)).toBe('A')
    for (const char of ['Î', 'Ï']) expect(letterOf(char)).toBe('I')
    for (const char of ['Ô', 'Ö']) expect(letterOf(char)).toBe('O')
    for (const char of ['Ù', 'Û', 'Ü']) expect(letterOf(char)).toBe('U')
    expect(letterOf('Ç')).toBe('C')
    expect(letterOf('Ÿ')).toBe('Y')
  })

  it('replie aussi les minuscules accentuées', () => {
    expect(letterOf('é')).toBe('E')
    expect(letterOf('ç')).toBe('C')
  })

  it('ne rend aucune lettre pour ce qui est affiché d’emblée', () => {
    for (const char of [' ', "'", '-', '.', '!']) expect(letterOf(char)).toBeNull()
  })
})

describe('normalizeAnswer', () => {
  it('met en majuscules et conserve les accents', () => {
    expect(normalizeAnswer('la clé est sous le paillasson')).toBe('LA CLÉ EST SOUS LE PAILLASSON')
  })

  it('développe les ligatures, que NFD ne décompose pas', () => {
    expect(normalizeAnswer('cœur')).toBe('COEUR')
    expect(normalizeAnswer('Lætitia')).toBe('LAETITIA')
    expect(normalizeAnswer('Straße')).toBe('STRASSE')
  })

  it('uniformise les apostrophes typographiques', () => {
    expect(normalizeAnswer('l’art de vivre')).toBe("L'ART DE VIVRE")
  })

  it('uniformise les tirets typographiques', () => {
    expect(normalizeAnswer('arc‑en‐ciel')).toBe('ARC-EN-CIEL')
  })

  it('remplace les espaces insécables et compacte les espaces', () => {
    expect(normalizeAnswer('cent mille  francs')).toBe('CENT MILLE FRANCS')
    expect(normalizeAnswer('  bord  ')).toBe('BORD')
  })

  it('recompose les accents décomposés, pour qu’une lettre tienne en une case', () => {
    // Construite par code : un « é » précomposé collé ici ne prouverait rien,
    // c’est la forme décomposée qu’il faut éprouver.
    const decompose = `cle${String.fromCodePoint(0x301)}`
    expect(decompose).toHaveLength(4)
    expect(normalizeAnswer(decompose)).toBe('CLÉ')
    expect(cellsOf(normalizeAnswer(decompose))).toHaveLength(3)
  })

  it('est idempotente', () => {
    const once = normalizeAnswer('l’œuf à la coque')
    expect(normalizeAnswer(once)).toBe(once)
  })
})

describe('lettersOf', () => {
  it('rend les lettres de jeu, accents repliés et ponctuation exclue', () => {
    expect([...lettersOf(normalizeAnswer("l'été"))].sort()).toEqual(['E', 'L', 'T'])
  })

  it('rend O et E pour une énigme contenant une ligature', () => {
    const letters = lettersOf(normalizeAnswer('cœur'))
    expect(letters.has('O')).toBe(true)
    expect(letters.has('E')).toBe(true)
  })
})

describe('countOccurrences', () => {
  it('compte chaque occurrence, y compris accentuée', () => {
    expect(countOccurrences(normalizeAnswer('élève téméraire'), 'E')).toBe(6)
  })

  it('compte trois fois une lettre présente trois fois', () => {
    expect(countOccurrences(normalizeAnswer('sans souci'), 'S')).toBe(3)
  })

  it('rend zéro pour une lettre absente', () => {
    expect(countOccurrences(normalizeAnswer('bonjour'), 'K')).toBe(0)
  })
})

describe('cellsOf', () => {
  it('associe à chaque caractère affiché sa lettre de jeu', () => {
    const cells = cellsOf(normalizeAnswer('un thé'))
    expect(cells.map((c) => c.char).join('')).toBe('UN THÉ')
    expect(cells.map((c) => c.letter)).toEqual(['U', 'N', null, 'T', 'H', 'E'])
  })
})

describe('revealedLetters et isSolved', () => {
  it('ne retient que les lettres proposées effectivement présentes', () => {
    const state = round('le vent', ['E', 'K'])
    expect([...revealedLetters(state)]).toEqual(['E'])
  })

  it('n’est pas résolue tant qu’une lettre manque', () => {
    expect(isSolved(round('le vent', ['E', 'L', 'V', 'N']))).toBe(false)
  })

  it('est résolue quand toutes les lettres ont été proposées', () => {
    expect(isSolved(round('le vent', ['E', 'L', 'V', 'N', 'T']))).toBe(true)
  })

  it('ignore la ponctuation pour décider de la résolution', () => {
    expect(isSolved(round("l'art", ['L', 'A', 'R', 'T']))).toBe(true)
  })

  it('se résout par E et O sur une énigme à ligature', () => {
    expect(isSolved(round('cœur', ['C', 'O', 'E', 'U', 'R']))).toBe(true)
  })
})

describe('alphabet', () => {
  it('sépare 5 voyelles et 21 consonnes, sans doublon, couvrant A à Z', () => {
    expect(VOWELS).toHaveLength(5)
    expect(CONSONANTS).toHaveLength(21)
    const all = [...VOWELS, ...CONSONANTS]
    expect(new Set(all).size).toBe(26)
  })

  it('classe le Y en consonne', () => {
    expect(CONSONANTS).toContain('Y')
    expect(VOWELS).not.toContain('Y' as never)
  })
})
