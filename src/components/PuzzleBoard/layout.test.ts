import { describe, expect, it } from 'vitest'
import { cellsOf } from '../../game/puzzle'
import type { Cell } from '../../game/puzzle'
import { wordsOf } from './layout'

function textOf(word: readonly Cell[]): string {
  return word.map((cell) => cell.char).join('')
}

describe('wordsOf', () => {
  it('découpe une réponse en autant de mots que d’espaces, sans en couper aucun', () => {
    const words = wordsOf(cellsOf('LA ROUE DE LA FORTUNE'))
    expect(words.map(textOf)).toEqual(['LA', 'ROUE', 'DE', 'LA', 'FORTUNE'])
  })

  it('ne perd aucun caractère : les mots concatènent la réponse sans les espaces', () => {
    const answer = 'LE CHAT NOIR'
    const words = wordsOf(cellsOf(answer))
    expect(words.map(textOf).join('')).toBe(answer.replace(/ /g, ''))
  })

  it('ne produit jamais de mot vide sur des espaces consécutifs', () => {
    const words = wordsOf(cellsOf('UN  DEUX'))
    expect(words.every((word) => word.length > 0)).toBe(true)
    expect(words.map(textOf)).toEqual(['UN', 'DEUX'])
  })

  it('rend un seul mot pour une réponse sans espace', () => {
    const words = wordsOf(cellsOf('FORTUNE'))
    expect(words).toHaveLength(1)
    expect(words[0] && textOf(words[0])).toBe('FORTUNE')
  })

  it('garde l’apostrophe et le trait d’union dans leur mot, sans les couper', () => {
    const words = wordsOf(cellsOf("AUJOURD'HUI C'EST L'ANNIVERSAIRE DE JEAN-PIERRE"))
    expect(words.map(textOf)).toEqual([
      "AUJOURD'HUI",
      "C'EST",
      "L'ANNIVERSAIRE",
      'DE',
      'JEAN-PIERRE',
    ])
  })

  it('ne conserve aucune case espace à l’intérieur d’un mot', () => {
    for (const word of wordsOf(cellsOf('UN DEUX'))) {
      expect(word.some((cell) => cell.char === ' ')).toBe(false)
    }
  })

  it('ignore les espaces en tête et en fin sans créer de mot vide', () => {
    const words = wordsOf(cellsOf('  BORD  '))
    expect(words).toHaveLength(1)
    expect(words[0] && textOf(words[0])).toBe('BORD')
  })
})
