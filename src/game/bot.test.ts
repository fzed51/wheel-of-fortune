import { describe, expect, it } from 'vitest'
import {
  BOT_ATTEMPT,
  BOT_EASY_RESOLVE_HANDICAP,
  botResolveIsCorrect,
  botTurnKey,
  decideBotAction,
} from './bot'
import { initialState, reduce } from './engine'
import { CONSONANTS } from './puzzle'
import { createRng } from './rng'
import { currentPlayerOf, legalActions, remainingConsonants } from './rules'
import type { GameState, Player } from './types'
import {
  PASSE,
  avecLettres,
  avecPhase,
  avecPot,
  bot,
  cash,
  demarrer,
  enigme,
  jeu,
  jouer,
  joueur,
  manche,
  resoudre,
  tourner,
} from '../test/game'

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

describe('botTurnKey', () => {
  it('vaut null hors partie', () => {
    expect(botTurnKey(initialState)).toBeNull()
  })

  it('vaut null quand la manche vient de se terminer', () => {
    const state = resoudre(demarrer({ players: [bot('Bot')], config: { roundCount: 1 } }), true)
    expect(jeu(state).progress.kind).toBe('round-over')
    expect(botTurnKey(state)).toBeNull()
  })

  it('vaut null quand la partie est terminée', () => {
    const apres = resoudre(demarrer({ players: [bot('Bot')], config: { roundCount: 1 } }), true)
    const fini = jouer(apres, {
      type: 'round/next',
      puzzle: enigme('la mer'),
      firstPlayer: 0,
    })
    expect(jeu(fini).progress.kind).toBe('game-over')
    expect(botTurnKey(fini)).toBeNull()
  })

  it('vaut null quand le joueur courant est humain', () => {
    const state = demarrer({ players: [joueur('Alice'), bot('Bot')], firstPlayer: 0 })
    expect(botTurnKey(state)).toBeNull()
  })

  it('vaut null pendant la rotation de la roue', () => {
    const state = avecPhase(demarrer({ players: [bot('Bot')] }), {
      kind: 'spinning',
      segment: { kind: 'cash', index: 0, value: 100 },
      spin: { index: 0, offset: 0, spinId: 1 },
    })
    expect(botTurnKey(state)).toBeNull()
  })

  it('vaut null en attente de verdict', () => {
    const state = avecPhase(demarrer({ players: [bot('Bot')] }), {
      kind: 'resolving',
      attempt: 'x',
      requestId: 'r',
    })
    expect(botTurnKey(state)).toBeNull()
  })

  it('vaut null quand tout le monde est bloqué', () => {
    const state = avecPhase(demarrer({ players: [bot('Bot')] }), { kind: 'blocked' })
    expect(botTurnKey(state)).toBeNull()
  })

  it('rend une clé non nulle pour un bot en attente d’action', () => {
    expect(botTurnKey(demarrer({ players: [bot('Bot')] }))).not.toBeNull()
  })

  it('rend une clé non nulle pour un bot en attente de consonne', () => {
    const state = tourner(demarrer({ players: [bot('Bot')] }), cash(500))
    expect(botTurnKey(state)).not.toBeNull()
  })

  it('est stable pour un même état', () => {
    const state = demarrer({ players: [bot('Bot')] })
    expect(botTurnKey(state)).toBe(botTurnKey(state))
  })

  it('change quand la cagnotte du bot change', () => {
    const state = demarrer({ players: [bot('Bot')] })
    expect(botTurnKey(avecPot(state, 0, 500))).not.toBe(botTurnKey(state))
  })

  it('change quand une lettre rejoint les lettres proposées', () => {
    const state = demarrer({ players: [bot('Bot')] })
    expect(botTurnKey(avecLettres(state, ['T']))).not.toBe(botTurnKey(state))
  })

  it('change quand la main passe à un autre bot', () => {
    const debut = demarrer({ players: [bot('Bot 1'), bot('Bot 2')] })
    const passe = tourner(debut, PASSE)
    expect(currentPlayerOf(jeu(passe)).id).not.toBe(currentPlayerOf(jeu(debut)).id)
    expect(botTurnKey(passe)).not.toBe(botTurnKey(debut))
  })

  it('change quand la phase change', () => {
    const action = demarrer({ players: [bot('Bot')] })
    const consonne = tourner(action, cash(500))
    expect(botTurnKey(consonne)).not.toBe(botTurnKey(action))
  })
})

describe('botResolveIsCorrect', () => {
  it('est faux pour un joueur humain, même avec un tirage favorable', () => {
    const state = demarrer({ players: [joueur('Alice')], answer: 'le vent' })
    expect(botResolveIsCorrect(jeu(state), () => 0)).toBe(false)
  })

  it('bascule au seuil, pour un bot normal', () => {
    // « LE VENT » : 5 lettres distinctes, 4 révélées (E manque) => avancement 0,8.
    const state = avecLettres(
      demarrer({ players: [bot('Bot')], answer: 'le vent' }),
      ['L', 'V', 'N', 'T'],
    )
    expect(botResolveIsCorrect(jeu(state), () => 0.79)).toBe(true)
    expect(botResolveIsCorrect(jeu(state), () => 0.81)).toBe(false)
  })

  it('un bot facile échoue là où un bot normal réussit, à avancement et tirage identiques', () => {
    const avancement = ['L', 'V', 'N', 'T'] as const
    const normal = avecLettres(demarrer({ players: [bot('Bot')], answer: 'le vent' }), [
      ...avancement,
    ])
    const facile = avecLettres(demarrer({ players: [bot('Bot', 'easy')], answer: 'le vent' }), [
      ...avancement,
    ])
    const avancement08 = 0.8
    // Sous le seuil normal (0,8) mais au-dessus du seuil facile, handicapé.
    const rng = () => (avancement08 + avancement08 * BOT_EASY_RESOLVE_HANDICAP) / 2
    expect(botResolveIsCorrect(jeu(normal), rng)).toBe(true)
    expect(botResolveIsCorrect(jeu(facile), rng)).toBe(false)
  })
})
