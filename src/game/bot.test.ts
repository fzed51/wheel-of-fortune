import { describe, expect, it } from 'vitest'
import { BOT_EASY_RESOLVE_HANDICAP, botTurnKey, decideBotAction } from './bot'
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
  courant,
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
 * fera — régler la rotation, enchaîner les manches — et laisse toutes les
 * décisions au bot. `resolve/attempt` n'a plus de traitement à part : il
 * emprunte le même chemin de reducer qu'un humain, il n'y a donc plus de
 * verdict à rendre séparément ici.
 */
function partieAutomatique(
  seed: number,
  players: readonly Player[],
): { pas: number; state: GameState } {
  const rng = createRng(seed)
  let state = demarrer({ players })
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
    if (phase.kind === 'blocked') {
      state = reduce(state, suivante())
      continue
    }

    const legales = legalActions(game)
    const action = decideBotAction(game, rng, { spinId: pas })
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
  it('vont au bout sans jamais rester sans décision', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const { state } = partieAutomatique(seed, [bot('Bot 1'), bot('Bot 2', 'easy')])
      expect(jeu(state).history).toHaveLength(3)
    }
  })

  it('vont au bout à trois bots, dont un facile', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { state } = partieAutomatique(seed, [bot('Bot 1'), bot('Bot 2', 'easy'), bot('Bot 3')])
      expect(jeu(state).history).toHaveLength(3)
    }
  })
})

describe('décisions figées', () => {
  const constant = () => 0.5

  it('un bot normal descend les fréquences du français', () => {
    const state = tourner(demarrer({ players: [bot('Bot')], answer: 'le vent' }), cash(500))
    const action = decideBotAction(jeu(state), constant, { spinId: 1 })
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
    const action = decideBotAction(jeu(state), createRng(7), { spinId: 1 })
    expect(action?.type).toBe('letter/consonant')
    if (action?.type === 'letter/consonant') {
      expect(remainingConsonants(manche(state))).toContain(action.letter)
    }
  })

  it('ne tente pas de résoudre avant le seuil d’avancement, et tourne la roue à la place', () => {
    // « LE VENT » : 5 lettres distinctes, 3 révélées (E et T manquent) => 0,6 < 0,7.
    const state = avecLettres(demarrer({ players: [bot('Bot')], answer: 'le vent' }), [
      'L',
      'V',
      'N',
    ])
    const action = decideBotAction(jeu(state), constant, { spinId: 3 })
    expect(action?.type).toBe('wheel/spin')
  })

  it('propose resolve/attempt, exactement la réponse, une fois le seuil d’avancement atteint', () => {
    // 4 lettres sur 5 révélées => 0,8 >= 0,7 : le bot tente, et sa tentative est
    // la vraie solution — jamais un texte de remplacement, condition sine qua
    // non pour que `botTurnKey` reparte après le coup (voir le commentaire de
    // `decideBotAction` dans `bot.ts`).
    const state = avecLettres(demarrer({ players: [bot('Bot')], answer: 'le vent' }), [
      'L',
      'V',
      'N',
      'T',
    ])
    const action = decideBotAction(jeu(state), constant, { spinId: 3 })
    expect(action).toEqual({
      type: 'resolve/attempt',
      by: currentPlayerOf(jeu(state)).id,
      attempt: manche(state).puzzle.answer,
    })
  })

  it('un bot facile résiste plus qu’un bot normal, à avancement et tirage identiques', () => {
    const avancement = ['L', 'V', 'N', 'T'] as const
    const normal = avecLettres(demarrer({ players: [bot('Bot')], answer: 'le vent' }), [
      ...avancement,
    ])
    const facile = avecLettres(demarrer({ players: [bot('Bot', 'easy')], answer: 'le vent' }), [
      ...avancement,
    ])
    const avancement08 = 0.8
    // Sous le seuil facile (0,85), mais au-dessus du seuil normal (0,7) une fois
    // le tirage handicapé pris en compte.
    const rng = () => (avancement08 + avancement08 * BOT_EASY_RESOLVE_HANDICAP) / 2
    expect(decideBotAction(jeu(normal), rng, { spinId: 1 })?.type).toBe('resolve/attempt')
    expect(decideBotAction(jeu(facile), rng, { spinId: 1 })?.type).not.toBe('resolve/attempt')
  })

  it('achète une voyelle quand il a de la marge et la manche est jeune', () => {
    const state = avecPot(demarrer({ players: [bot('Bot')], answer: 'le vent' }), 0, 500)
    const action = decideBotAction(jeu(state), constant, { spinId: 1 })
    expect(action).toEqual({
      type: 'letter/buy-vowel',
      by: currentPlayerOf(jeu(state)).id,
      letter: 'E',
    })
  })

  it('passe la main plutôt que de tenter une résolution à l’aveugle, quand il ne lui reste que ça de théoriquement légal', () => {
    // « OUI » n'a aucune consonne : toutes proposées, la roue ne sert plus à rien
    // et la cagnotte est vide. `resolve/attempt` reste légal — il l'est toujours
    // en `awaiting-action` — mais l'avancement est nul : le bot n'a rien deviné
    // et ne soumet pas de réponse au hasard. `turn/pass` reste la seule issue
    // qu'il emprunte, jamais `null`.
    const state = avecLettres(demarrer({ players: [bot('Bot 1'), bot('Bot 2')], answer: 'oui' }), [
      ...CONSONANTS,
    ])
    expect(legalActions(jeu(state))).toEqual(['resolve/attempt', 'turn/pass'])
    expect(decideBotAction(jeu(state), constant, { spinId: 1 })).toEqual({
      type: 'turn/pass',
      by: currentPlayerOf(jeu(state)).id,
    })
  })

  it('ne joue jamais à la place d’un humain', () => {
    const state = demarrer({ players: [joueur('Alice'), bot('Bot')], firstPlayer: 0 })
    expect(decideBotAction(jeu(state), constant, { spinId: 1 })).toBeNull()
  })

  it('ne décide rien pendant une rotation de la roue', () => {
    const state = demarrer({ players: [bot('Bot')] })
    const lance = reduce(state, {
      type: 'wheel/spin',
      by: currentPlayerOf(jeu(state)).id,
      spin: { index: cash(500), offset: 0, spinId: 1 },
    })
    expect(decideBotAction(jeu(lance), constant, { spinId: 2 })).toBeNull()
  })
})

describe('botTurnKey', () => {
  it('vaut null hors partie', () => {
    expect(botTurnKey(initialState)).toBeNull()
  })

  it('vaut null quand la manche vient de se terminer', () => {
    const depart = demarrer({ players: [bot('Bot')], config: { roundCount: 1 } })
    const state = resoudre(depart, manche(depart).puzzle.answer)
    expect(jeu(state).progress.kind).toBe('round-over')
    expect(botTurnKey(state)).toBeNull()
  })

  it('vaut null quand la partie est terminée', () => {
    const depart = demarrer({ players: [bot('Bot')], config: { roundCount: 1 } })
    const apres = resoudre(depart, manche(depart).puzzle.answer)
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

  it('change de valeur autour d’une résolution ratée d’un bot : c’est ce qui empêche la partie de se figer', () => {
    // Deux bots, pour que le siège change réellement après l'échec : avec un
    // seul joueur, `rotation(seat + 1, 1)` reboucle sur le même siège et rien
    // ne distinguerait la clé — précisément le piège que `resolve/attempt`
    // évite en ne soumettant jamais sciemment une réponse fausse (voir
    // `decideBotAction`). Ce test rejoue l'action par le vrai reducer, pas une
    // fixture à la main, pour éprouver la garantie sur le chemin réel.
    const state = demarrer({ players: [bot('Bot 1'), bot('Bot 2')] })
    const avant = botTurnKey(state)
    const apres = reduce(state, {
      type: 'resolve/attempt',
      by: courant(state).id,
      attempt: 'réponse fausse',
    })
    expect(botTurnKey(apres)).not.toBe(avant)
  })
})
