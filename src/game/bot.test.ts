import { describe, expect, it } from 'vitest'
import { BOT_ATTEMPT, decideBotAction } from './bot'
import { reduce } from './engine'
import { CONSONANTS } from './puzzle'
import { createRng } from './rng'
import { currentPlayerOf, legalActions, remainingConsonants } from './rules'
import type { GameState, Player } from './types'
import {
  avecLettres,
  avecPot,
  cash,
  demarrer,
  enigme,
  jeu,
  joueur,
  manche,
  tourner,
} from '../test/game'

function bot(name: string, level: 'easy' | 'normal' = 'normal'): Player {
  return joueur(name, { kind: { type: 'bot', level } })
}

const ENIGMES = ['le vent', 'mon chat', 'la mer', 'au revoir', 'bonne nuit'] as const

/**
 * Driver de test : il ne décide rien du jeu, il ne fait que ce qu'un vrai driver
 * fera — régler la rotation, rendre un verdict, enchaîner les manches — et laisse
 * toutes les décisions au bot.
 */
function partieAutomatique(
  seed: number,
  players: readonly Player[],
  resolveEnabled: boolean,
): { pas: number; state: GameState } {
  const rng = createRng(seed)
  let state = demarrer({ players, config: { resolveEnabled } })
  let pas = 0

  while (jeu(state).progress.kind !== 'game-over') {
    pas += 1
    if (pas > 1500) {
      throw new Error(`Partie non terminée : ${JSON.stringify(jeu(state).progress)}`)
    }

    const game = jeu(state)
    const progress = game.progress
    const suivante = () => ({
      type: 'round/next' as const,
      puzzle: enigme(ENIGMES[game.history.length % ENIGMES.length] ?? 'le vent', `auto-${pas}`),
      firstPlayer: Math.floor(rng() * game.players.length),
    })

    if (progress.kind === 'round-over') {
      state = reduce(state, suivante())
      continue
    }

    // La condition de boucle l'exclut déjà, mais elle porte sur un autre appel :
    // c'est ici que le typage se resserre.
    if (progress.kind === 'game-over') break

    const phase = progress.round.phase
    if (phase.kind === 'spinning') {
      state = reduce(state, {
        type: 'wheel/settled',
        by: currentPlayerOf(game).id,
        spinId: phase.spin.spinId,
      })
      continue
    }
    if (phase.kind === 'resolving') {
      // Le verdict est rendu par le driver, jamais par le bot : côté reducer, un
      // bot et un humain empruntent exactement le même chemin.
      state = reduce(state, {
        type: 'resolve/verdict',
        requestId: phase.requestId,
        correct: rng() < 0.4,
      })
      continue
    }
    if (phase.kind === 'blocked') {
      state = reduce(state, suivante())
      continue
    }

    const legales = legalActions(game)
    const action = decideBotAction(game, rng, { spinId: pas, requestId: `req-${pas}` })
    expect(action, `bot sans décision alors que ${legales.join(', ')} est légal`).not.toBeNull()
    if (action === null) throw new Error('bot sans décision')

    expect(legales, `action ${action.type} hors des actions légales`).toContain(action.type)
    const apres = reduce(state, action)
    expect(apres, `action ${action.type} rejetée par le reducer`).not.toBe(state)
    state = apres
  }

  return { pas, state }
}

describe('parties entièrement pilotées par des bots', () => {
  it('vont au bout sans jamais rester sans décision, avec juge', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const { state } = partieAutomatique(seed, [bot('Bot 1'), bot('Bot 2', 'easy')], true)
      expect(jeu(state).history).toHaveLength(3)
    }
  })

  it('vont au bout sans juge, où seules les lettres font avancer la partie', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const { state } = partieAutomatique(seed, [bot('Bot 1'), bot('Bot 2', 'easy')], false)
      expect(jeu(state).history).toHaveLength(3)
    }
  })

  it('vont au bout à trois bots, dont un facile', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { state } = partieAutomatique(
        seed,
        [bot('Bot 1'), bot('Bot 2', 'easy'), bot('Bot 3')],
        true,
      )
      expect(jeu(state).history).toHaveLength(3)
    }
  })
})

describe('décisions figées', () => {
  const constant = () => 0.5

  it('un bot normal descend les fréquences du français', () => {
    const state = tourner(demarrer({ players: [bot('Bot')], answer: 'le vent' }), cash(500))
    const action = decideBotAction(jeu(state), constant, { spinId: 1, requestId: 'r1' })
    expect(action).toEqual({
      type: 'letter/consonant',
      by: currentPlayerOf(jeu(state)).id,
      letter: 'S',
    })
  })

  it('un bot facile pioche une consonne encore disponible, sans ordre', () => {
    const state = tourner(
      demarrer({ players: [bot('Bot', 'easy')], answer: 'le vent' }),
      cash(500),
    )
    const action = decideBotAction(jeu(state), createRng(7), { spinId: 1, requestId: 'r1' })
    expect(action?.type).toBe('letter/consonant')
    if (action?.type === 'letter/consonant') {
      expect(remainingConsonants(manche(state))).toContain(action.letter)
    }
  })

  it('ne tente jamais de résoudre sans juge configuré', () => {
    // Quatre lettres sur cinq révélées : un bot avec juge répondrait ici.
    const state = avecLettres(
      demarrer({ players: [bot('Bot')], answer: 'le vent', config: { resolveEnabled: false } }),
      ['L', 'V', 'N', 'T'],
    )
    const action = decideBotAction(jeu(state), constant, { spinId: 3, requestId: 'r1' })
    expect(action?.type).toBe('wheel/spin')
  })

  it('répond dès que l’énigme est assez avancée', () => {
    const state = avecLettres(
      demarrer({ players: [bot('Bot')], answer: 'le vent', config: { resolveEnabled: true } }),
      ['L', 'V', 'N', 'T'],
    )
    const action = decideBotAction(jeu(state), constant, { spinId: 3, requestId: 'r9' })
    expect(action).toEqual({
      type: 'resolve/start',
      by: currentPlayerOf(jeu(state)).id,
      attempt: BOT_ATTEMPT,
      requestId: 'r9',
    })
  })

  it('ne divulgue pas la solution dans sa tentative', () => {
    const state = avecLettres(
      demarrer({ players: [bot('Bot')], answer: 'le vent' }),
      ['L', 'V', 'N', 'T'],
    )
    const action = decideBotAction(jeu(state), constant, { spinId: 3, requestId: 'r1' })
    if (action?.type === 'resolve/start') {
      expect(action.attempt).not.toContain('VENT')
    }
  })

  it('achète une voyelle quand il a de la marge et la manche est jeune', () => {
    const state = avecPot(demarrer({ players: [bot('Bot')], answer: 'le vent' }), 0, 500)
    const action = decideBotAction(jeu(state), constant, { spinId: 1, requestId: 'r1' })
    expect(action).toEqual({
      type: 'letter/buy-vowel',
      by: currentPlayerOf(jeu(state)).id,
      letter: 'E',
    })
  })

  it('résout à contrecœur plutôt que de laisser la partie se figer', () => {
    // « OUI » n'a aucune consonne : toutes proposées, la roue ne sert plus à rien
    // et la cagnotte est vide. Seule la résolution reste légale, très en dessous
    // du seuil de stratégie.
    const state = avecLettres(
      demarrer({ players: [bot('Bot')], answer: 'oui', config: { resolveEnabled: true } }),
      [...CONSONANTS],
    )
    expect(legalActions(jeu(state))).toEqual(['resolve/start'])
    const action = decideBotAction(jeu(state), constant, { spinId: 1, requestId: 'r1' })
    expect(action?.type).toBe('resolve/start')
  })

  it('passe la main quand il n’a plus rien du tout', () => {
    const state = avecLettres(
      demarrer({ players: [bot('Bot 1'), bot('Bot 2')], config: { resolveEnabled: false } }),
      [...CONSONANTS],
    )
    expect(legalActions(jeu(state))).toEqual(['turn/pass'])
    expect(decideBotAction(jeu(state), constant, { spinId: 1, requestId: 'r1' })?.type).toBe(
      'turn/pass',
    )
  })

  it('ne joue jamais à la place d’un humain', () => {
    const state = demarrer({ players: [joueur('Alice'), bot('Bot')], firstPlayer: 0 })
    expect(decideBotAction(jeu(state), constant, { spinId: 1, requestId: 'r1' })).toBeNull()
  })

  it('ne décide rien pendant une rotation ou une attente de verdict', () => {
    const state = demarrer({ players: [bot('Bot')] })
    const lance = reduce(state, {
      type: 'wheel/spin',
      by: currentPlayerOf(jeu(state)).id,
      spin: { index: cash(500), offset: 0, spinId: 1 },
    })
    expect(decideBotAction(jeu(lance), constant, { spinId: 2, requestId: 'r1' })).toBeNull()
  })
})
