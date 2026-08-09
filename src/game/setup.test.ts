import { describe, expect, it } from 'vitest'
import {
  BONUS_PRIZE,
  HUMAN_ID,
  MAX_OPPONENTS,
  MAX_ROUNDS,
  MIN_ROUND_PRIZE,
  MIN_ROUNDS,
  VOWEL_COST,
  configFrom,
  playersFrom,
} from './setup'
import type { Setup } from './setup'

const BASE: Setup = { roundCount: 3, opponents: 0, botLevel: 'normal' }

describe('configFrom', () => {
  it('reprend le nombre de manches, fige le reste dont le forfait bonus', () => {
    const config = configFrom({ ...BASE, roundCount: 5 })
    expect(config).toEqual({
      roundCount: 5,
      vowelCost: VOWEL_COST,
      minRoundPrize: MIN_ROUND_PRIZE,
      bonusPrize: BONUS_PRIZE,
    })
  })

  it.each([
    [0, MIN_ROUNDS],
    [-4, MIN_ROUNDS],
    [999, MAX_ROUNDS],
    [3.7, 3],
    [Number.NaN, MIN_ROUNDS],
  ])('borne %s manches à %s', (asked, expected) => {
    expect(configFrom({ ...BASE, roundCount: asked }).roundCount).toBe(expected)
  })
})

describe('playersFrom', () => {
  it('place l’humain au siège 0', () => {
    const players = playersFrom({ ...BASE, opponents: 2 })
    expect(players[0]?.id).toBe(HUMAN_ID)
    expect(players[0]?.kind).toEqual({ type: 'human' })
  })

  it('nomme les bots à partir de 1 et leur donne le niveau réglé', () => {
    const players = playersFrom({ ...BASE, opponents: 2, botLevel: 'easy' })
    expect(players.map((player) => player.name)).toEqual(['Vous', 'Bot 1', 'Bot 2'])
    expect(players.slice(1).map((player) => player.kind)).toEqual([
      { type: 'bot', level: 'easy' },
      { type: 'bot', level: 'easy' },
    ])
  })

  it('donne des identifiants distincts', () => {
    const ids = playersFrom({ ...BASE, opponents: MAX_OPPONENTS }).map((player) => player.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('part de scores et de cagnottes à zéro', () => {
    for (const player of playersFrom({ ...BASE, opponents: 3 })) {
      expect([player.total, player.pot]).toEqual([0, 0])
    }
  })

  it.each([
    [-1, 1],
    [0, 1],
    [3, 4],
    [12, 1 + MAX_OPPONENTS],
  ])('borne %s adversaires à %s joueurs', (asked, expected) => {
    expect(playersFrom({ ...BASE, opponents: asked })).toHaveLength(expected)
  })
})
