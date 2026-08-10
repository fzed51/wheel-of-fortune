import { describe, expect, it } from 'vitest'
import { isFinalRound, isQuestion } from './bonus'
import { asPuzzleId } from './types'
import type { Puzzle } from './types'

const puzzle = (bonusAnswer?: string): Puzzle => ({
  id: asPuzzleId('test-000'),
  answer: 'LE CHAT NOIR',
  category: 'Animaux',
  source: 'custom',
  bonusAnswer,
})

describe('isQuestion', () => {
  it('reconnaît une énigme portant une réponse attendue exploitable', () => {
    expect(isQuestion(puzzle('CANBERRA'))).toBe(true)
  })

  it('refuse une énigme sans réponse attendue', () => {
    expect(isQuestion(puzzle())).toBe(false)
  })

  it('refuse une réponse attendue vide', () => {
    expect(isQuestion(puzzle(''))).toBe(false)
  })

  it('refuse une réponse attendue qui se plie sur la chaîne vide', () => {
    // « ??? » ne contient ni lettre ni chiffre : `foldForCompare` l'efface
    // entièrement, donc `matchesAnswer` ne pourrait jamais la trouver.
    expect(isQuestion(puzzle('???'))).toBe(false)
  })

  it('accepte une réponse attendue en minuscules : c’est le pliage qui tranche, pas la casse', () => {
    expect(isQuestion(puzzle('canberra'))).toBe(true)
  })
})

describe('isFinalRound', () => {
  it('considère la manche 0 comme finale quand la partie n’a qu’une manche', () => {
    expect(isFinalRound(0, 1)).toBe(true)
  })

  it('ne considère pas la première manche comme finale sur trois manches', () => {
    expect(isFinalRound(0, 3)).toBe(false)
  })

  it('considère la dernière manche comme finale sur trois manches', () => {
    expect(isFinalRound(2, 3)).toBe(true)
  })

  it('ne considère pas la manche intermédiaire comme finale sur trois manches', () => {
    expect(isFinalRound(1, 3)).toBe(false)
  })

  it('reste finale sur un index débordant, plutôt que de disparaître en silence', () => {
    expect(isFinalRound(7, 3)).toBe(true)
  })
})
