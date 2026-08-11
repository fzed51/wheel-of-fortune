import { describe, expect, it } from 'vitest'
import type { GameAction } from './actions'
import { isFinalRound } from './bonus'
import { initialState, reduce } from './engine'
import { CONSONANTS } from './puzzle'
import { createRng, pick } from './rng'
import {
  bonusPlayerOf,
  canSpin,
  currentPlayerOf,
  isStuck,
  legalActions,
  remainingConsonants,
  remainingVowels,
} from './rules'
import type { Game, GameState, Puzzle } from './types'
import { asPlayerId } from './types'
import { throwFromForce } from './wheel'
import {
  BANQUEROUTE,
  CASH_ZERO,
  CONFIG,
  PASSE,
  acheter,
  avecLettres,
  avecPot,
  bonus,
  cash,
  courant,
  demarrer,
  enigme,
  jeu,
  joueur,
  joueurNomme,
  jouer,
  lancer,
  manche,
  proposer,
  question,
  repondre,
  resoudre,
  tourner,
} from '../test/game'

describe('game/start', () => {
  it('ouvre une première manche sur le joueur désigné', () => {
    const state = demarrer({ firstPlayer: 1 })
    const game = jeu(state)
    expect(game.progress.kind).toBe('round')
    expect(courant(state).name).toBe('Bob')
    expect(manche(state).index).toBe(0)
    expect(manche(state).guessed).toEqual([])
    expect(manche(state).phase.kind).toBe('awaiting-action')
    expect(game.playedPuzzleIds).toHaveLength(1)
  })

  it('démarre la roue à l’angle de repos de montage', () => {
    // La partie neuve ne branche encore aucun lancer sur cet angle (ce sera T3) :
    // seule sa valeur initiale est garantie ici.
    expect(jeu(demarrer()).wheelAngle).toBe(0)
  })

  it('range l’énigme par valeur, pas par référence', () => {
    const puzzle = enigme('le vent')
    const state = reduce(initialState, {
      type: 'game/start',
      config: CONFIG,
      players: [joueur('Alice')],
      puzzle,
      firstPlayer: 0,
    })
    expect(manche(state).puzzle).not.toBe(puzzle)
    expect(manche(state).puzzle).toEqual(puzzle)
  })

  it('ramène un siège hors bornes dans la table', () => {
    expect(courant(demarrer({ firstPlayer: 5 }))).toEqual(courant(demarrer({ firstPlayer: 1 })))
  })
})

describe('règlement du tirage', () => {
  it('la banqueroute vide la cagnotte, laisse la banque intacte et passe la main', () => {
    const gagne = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const avecBanque = jouer(resoudre(gagne, manche(gagne).puzzle.answer), {
      type: 'round/next',
      puzzle: enigme('mon chat'),
      firstPlayer: 0,
    })
    expect(joueurNomme(avecBanque, 'Alice').total).toBe(500)

    const relance = proposer(tourner(avecBanque, cash(500)), 'C')
    expect(courant(relance).pot).toBe(1000)

    const ruine = tourner(relance, BANQUEROUTE)
    expect(joueurNomme(ruine, 'Alice').pot).toBe(0)
    expect(joueurNomme(ruine, 'Alice').total).toBe(500)
    expect(courant(ruine).name).toBe('Bob')
  })

  it('la passe conserve la cagnotte et passe la main', () => {
    const gagne = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const passe = tourner(gagne, PASSE)
    expect(joueurNomme(passe, 'Alice').pot).toBe(500)
    expect(courant(passe).name).toBe('Bob')
  })

  it('un montant met en attente de consonne, sans changer de joueur', () => {
    const state = tourner(demarrer(), cash(500))
    const phase = manche(state).phase
    expect(phase.kind).toBe('awaiting-consonant')
    if (phase.kind === 'awaiting-consonant') expect(phase.value).toBe(500)
    expect(courant(state).name).toBe('Alice')
  })

  it('ignore un règlement dont le spinId est périmé', () => {
    const depart = demarrer()
    const by = courant(depart).id
    const lance = jouer(depart, lancer(jeu(depart), by, cash(500), 7))
    expect(reduce(lance, { type: 'wheel/settled', by, spinId: 8 })).toBe(lance)
  })

  it('refuse de lancer quand plus aucune consonne n’est disponible', () => {
    const state = avecLettres(demarrer(), [...CONSONANTS])
    expect(canSpin(jeu(state))).toBe(false)
    const rejet = reduce(state, lancer(jeu(state), courant(state).id, cash(500)))
    expect(rejet).toBe(state)
  })
})

describe('wheel/spin — angle de la roue', () => {
  it('avance wheelAngle jusqu’à l’angle où la phase spinning atterrit', () => {
    const depart = demarrer()
    expect(jeu(depart).wheelAngle).toBe(0)
    const apres = jouer(depart, lancer(jeu(depart), courant(depart).id, cash(500)))
    const game = jeu(apres)
    expect(game.wheelAngle).not.toBe(0)
    const phase = manche(apres).phase
    expect(phase.kind).toBe('spinning')
    if (phase.kind === 'spinning') expect(phase.spin.angle).toBe(game.wheelAngle)
  })

  it('un même lancer atterrit sur des cases différentes selon l’angle de repos précédent', () => {
    const base = jeu(demarrer())
    const by = currentPlayerOf(base).id
    const action = { type: 'wheel/spin' as const, by, thrown: { spinId: 1, travel: 800, durationMs: 3000 } }

    const depuisZero = manche(reduce({ kind: 'playing', game: base }, action)).phase
    const depuis180 = manche(
      reduce({ kind: 'playing', game: { ...base, wheelAngle: 180 } }, action),
    ).phase

    expect(depuisZero.kind).toBe('spinning')
    expect(depuis180.kind).toBe('spinning')
    if (depuisZero.kind === 'spinning' && depuis180.kind === 'spinning') {
      expect(depuisZero.spin.index).not.toBe(depuis180.spin.index)
    }
  })

  it('un travel calibré vers Banqueroute y fait bien atterrir la roue', () => {
    const depart = demarrer()
    const apres = jouer(depart, lancer(jeu(depart), courant(depart).id, BANQUEROUTE))
    const phase = manche(apres).phase
    expect(phase.kind).toBe('spinning')
    if (phase.kind === 'spinning') expect(phase.segment.kind).toBe('bankrupt')
  })
})

describe('consonnes', () => {
  it('crédite le montant par occurrence et garde la main', () => {
    // « LE VENT » ne contient qu'un T : 500 × 1 × ×1.
    const state = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    expect(courant(state).name).toBe('Alice')
    expect(courant(state).pot).toBe(500)
  })

  it('crédite trois fois une lettre présente trois fois', () => {
    const state = proposer(tourner(demarrer({ answer: 'sans souci' }), cash(300)), 'S')
    expect(courant(state).pot).toBe(900)
  })

  it('passe la main sur une consonne absente, sans rien débiter', () => {
    const state = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'Z')
    expect(courant(state).name).toBe('Bob')
    expect(joueurNomme(state, 'Alice').pot).toBe(0)
    expect(manche(state).guessed).toEqual(['Z'])
  })

  it('termine la manche dans la même transition quand la dernière lettre tombe', () => {
    let state = demarrer({ answer: 'as' })
    state = proposer(tourner(state, cash(500)), 'S')
    state = acheter(state, 'A')

    const progress = jeu(state).progress
    expect(progress.kind).toBe('round-over')
    if (progress.kind === 'round-over' && progress.summary.outcome.kind === 'solved') {
      expect(progress.summary.outcome.how).toBe('last-letter')
      expect(progress.summary.outcome.by).toBe(asPlayerId('alice'))
    }
  })

  it('ignore une lettre déjà proposée', () => {
    const state = tourner(avecLettres(demarrer({ answer: 'le vent' }), ['T']), cash(500))
    expect(reduce(state, { type: 'letter/consonant', by: courant(state).id, letter: 'T' })).toBe(
      state,
    )
  })

  it('ignore une voyelle envoyée comme consonne', () => {
    const state = tourner(demarrer({ answer: 'le vent' }), cash(500))
    const rejet = reduce(state, {
      type: 'letter/consonant',
      by: courant(state).id,
      // Une voyelle n'a rien à faire ici : l'UI ne l'offre pas, le reducer refuse.
      letter: 'E' as never,
    })
    expect(rejet).toBe(state)
  })
})

describe('achat de voyelle', () => {
  it('est accepté à la cagnotte exactement égale au prix', () => {
    const state = avecPot(demarrer({ answer: 'le vent' }), 0, 250)
    const achat = acheter(state, 'E')
    expect(achat).not.toBe(state)
    expect(joueurNomme(achat, 'Alice').pot).toBe(0)
  })

  it('est refusé à un euro près', () => {
    const state = avecPot(demarrer({ answer: 'le vent' }), 0, 249)
    expect(acheter(state, 'E')).toBe(state)
  })

  it('débite et passe la main quand la voyelle est absente', () => {
    const state = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const achat = acheter(state, 'O')
    expect(joueurNomme(achat, 'Alice').pot).toBe(250)
    expect(courant(achat).name).toBe('Bob')
    expect(manche(achat).guessed).toContain('O')
  })

  it('garde la main quand la voyelle est présente', () => {
    const state = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const achat = acheter(state, 'E')
    expect(courant(achat).name).toBe('Alice')
    expect(courant(achat).pot).toBe(250)
  })

  it('applique le gain minimum quand la voyelle finale vide la cagnotte', () => {
    // « AS » : S rapporte 250, la voyelle A le reprend — sans plancher, la manche
    // gagnée ne rapporterait rien.
    let state = demarrer({ answer: 'as' })
    state = proposer(tourner(state, cash(250)), 'S')
    expect(courant(state).pot).toBe(250)

    state = acheter(state, 'A')
    const progress = jeu(state).progress
    if (progress.kind === 'round-over' && progress.summary.outcome.kind === 'solved') {
      expect(progress.summary.outcome.amount).toBe(CONFIG.minRoundPrize)
    }
    expect(joueurNomme(state, 'Alice').total).toBe(CONFIG.minRoundPrize)
  })

  it('rapporte quand même le plancher pour une manche jouée entièrement sur des cases à 0', () => {
    // La case à 0 ne rapporte rien mais garde la main : sans ce test, un plancher
    // qui ne s'appliquerait qu'aux voyelles laisserait un « 0 » de bout en bout
    // rapporter zéro à la résolution.
    let state = tourner(demarrer({ answer: 'as' }), CASH_ZERO)
    state = proposer(state, 'S')
    expect(courant(state).pot).toBe(0)
    expect(courant(state).name).toBe('Alice')

    state = resoudre(state, 'as')
    const progress = jeu(state).progress
    if (progress.kind === 'round-over' && progress.summary.outcome.kind === 'solved') {
      expect(progress.summary.outcome.amount).toBe(CONFIG.minRoundPrize)
    }
    expect(joueurNomme(state, 'Alice').total).toBe(CONFIG.minRoundPrize)
  })

  it('ignore une consonne envoyée comme voyelle', () => {
    const state = avecPot(demarrer(), 0, 250)
    const rejet = reduce(state, {
      type: 'letter/buy-vowel',
      by: courant(state).id,
      letter: 'T' as never,
    })
    expect(rejet).toBe(state)
  })
})

describe('resolve/attempt', () => {
  it('une réponse juste clôt la manche par résolution', () => {
    const gagne = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const state = resoudre(gagne, 'le vent')
    const progress = jeu(state).progress
    expect(progress.kind).toBe('round-over')
    if (progress.kind === 'round-over' && progress.summary.outcome.kind === 'solved') {
      expect(progress.summary.outcome.how).toBe('resolve')
      expect(progress.summary.outcome.amount).toBe(500)
    }
    expect(joueurNomme(state, 'Alice').total).toBe(500)
  })

  it('accepte une réponse juste écrite sans accents ni espaces', () => {
    const state = resoudre(demarrer({ answer: 'la clé' }), 'lacle')
    const progress = jeu(state).progress
    expect(progress.kind).toBe('round-over')
    if (progress.kind === 'round-over' && progress.summary.outcome.kind === 'solved') {
      expect(progress.summary.outcome.how).toBe('resolve')
    }
  })

  it('une réponse fausse passe la main, conserve la cagnotte et remet les passes à zéro', () => {
    const gagne = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const state = resoudre(gagne, 'reponse fausse')
    expect(courant(state).name).toBe('Bob')
    expect(joueurNomme(state, 'Alice').pot).toBe(500)
    expect(manche(state).passes).toBe(0)
    expect(manche(state).phase.kind).toBe('awaiting-action')
  })

  it('ignore une tentative venue d’un joueur qui n’a pas la main', () => {
    const state = demarrer()
    const intrus = joueurNomme(state, 'Bob').id
    const rejet = reduce(state, { type: 'resolve/attempt', by: intrus, attempt: 'le vent' })
    expect(rejet).toBe(state)
  })

  it('ignore une tentative de résolution pendant l’attente d’une consonne', () => {
    const state = tourner(demarrer(), cash(500))
    expect(manche(state).phase.kind).toBe('awaiting-consonant')
    const rejet = reduce(state, {
      type: 'resolve/attempt',
      by: courant(state).id,
      attempt: 'le vent',
    })
    expect(rejet).toBe(state)
  })

  it('ignore une seconde tentative juste après la première : le double clic ne rejoue rien', () => {
    const state = demarrer({ answer: 'le vent' })
    const by = courant(state).id
    const resolu = resoudre(state, 'le vent')
    expect(jeu(resolu).progress.kind).toBe('round-over')
    // `turnOf` sort déjà sur `progress.kind !== 'round'` : plus aucune tentative
    // ne peut s'appliquer, quel que soit son émetteur.
    const rejeu = reduce(resolu, { type: 'resolve/attempt', by, attempt: 'le vent' })
    expect(rejeu).toBe(resolu)
  })
})

describe('compteur de passes', () => {
  it('bloque la manche après autant de passes consécutifs que de joueurs', () => {
    const coince = avecLettres(demarrer(), [...CONSONANTS])
    expect(isStuck(jeu(coince))).toBe(true)

    const unePasse = jouer(coince, { type: 'turn/pass', by: courant(coince).id })
    expect(manche(unePasse).passes).toBe(1)
    expect(manche(unePasse).phase.kind).toBe('awaiting-action')
    expect(courant(unePasse).name).toBe('Bob')

    const bloque = jouer(unePasse, { type: 'turn/pass', by: courant(unePasse).id })
    expect(manche(bloque).passes).toBe(2)
    expect(manche(bloque).phase.kind).toBe('blocked')
  })

  it('une lettre jouée entre deux passes remet le compteur à zéro : la manche ne se bloque pas', () => {
    // « LA MER » garde deux voyelles (A et E) : acheter l'une des deux ne suffit
    // pas à résoudre, ce qui laisse la manche observable en `awaiting-action`.
    let state = avecPot(avecLettres(demarrer({ answer: 'la mer' }), [...CONSONANTS]), 0, 0)
    expect(isStuck(jeu(state))).toBe(true)

    state = jouer(state, { type: 'turn/pass', by: courant(state).id })
    expect(manche(state).passes).toBe(1)
    expect(courant(state).name).toBe('Bob')

    state = avecPot(state, 1, 250)
    state = acheter(state, 'E')
    expect(manche(state).passes).toBe(0)
    expect(manche(state).phase.kind).not.toBe('blocked')
  })

  it('une tentative fausse entre deux passes le remet aussi à zéro', () => {
    let state = avecLettres(demarrer({ answer: 'la mer' }), [...CONSONANTS])
    state = avecPot(state, 0, 0)
    state = jouer(state, { type: 'turn/pass', by: courant(state).id })
    expect(manche(state).passes).toBe(1)

    state = resoudre(state, 'reponse fausse')
    expect(manche(state).passes).toBe(0)
    expect(manche(state).phase.kind).not.toBe('blocked')
  })
})

describe('appropriation des actions', () => {
  it('ignore toute action venue d’un autre que le joueur courant', () => {
    const state = avecPot(demarrer(), 0, 250)
    const intrus = joueurNomme(state, 'Bob').id
    const actions: readonly GameAction[] = [
      lancer(jeu(state), intrus, cash(500)),
      { type: 'wheel/settled', by: intrus, spinId: 1 },
      { type: 'letter/consonant', by: intrus, letter: 'T' },
      { type: 'letter/buy-vowel', by: intrus, letter: 'E' },
      { type: 'turn/pass', by: intrus },
      { type: 'resolve/attempt', by: intrus, attempt: 'x' },
    ]
    for (const action of actions) {
      expect(reduce(state, action), `action ${action.type} acceptée à tort`).toBe(state)
    }
  })
})

describe('blocage général', () => {
  it('bloque la manche quand plus personne ne peut jouer, puis la déclare nulle', () => {
    const coince = avecLettres(demarrer(), [...CONSONANTS])
    expect(legalActions(jeu(coince))).toContain('turn/pass')

    const alice = jouer(coince, { type: 'turn/pass', by: courant(coince).id })
    expect(manche(alice).phase.kind).toBe('awaiting-action')

    const bloque = jouer(alice, { type: 'turn/pass', by: courant(alice).id })
    expect(manche(bloque).phase.kind).toBe('blocked')
    expect(legalActions(jeu(bloque))).toEqual(['round/next'])

    const suivante = jouer(bloque, {
      type: 'round/next',
      puzzle: enigme('mon chat'),
      firstPlayer: 0,
    })
    const game = jeu(suivante)
    expect(game.history).toHaveLength(1)
    expect(game.history[0]?.outcome).toEqual({ kind: 'void', reason: 'blocked' })
    expect(game.players.every((player) => player.total === 0)).toBe(true)
  })

  it('rend la main au seul joueur encore capable de jouer', () => {
    // Solo : sans ce rattrapage, le premier « Passe » de la roue figerait la partie.
    const solo = avecPot(demarrer({ players: [joueur('Alice')] }), 0, 0)
    const gagne = proposer(tourner(solo, cash(500)), 'T')
    const passe = tourner(gagne, PASSE)
    expect(courant(passe).name).toBe('Alice')
    expect(manche(passe).phase.kind).toBe('awaiting-action')
  })
})

describe('enchaînement des manches', () => {
  it('remet les cagnottes à zéro, conserve les banques et incrémente la manche', () => {
    const gagne = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const suivante = jouer(resoudre(gagne, manche(gagne).puzzle.answer), {
      type: 'round/next',
      puzzle: enigme('mon chat'),
      firstPlayer: 1,
    })
    const game = jeu(suivante)
    expect(game.players.every((player) => player.pot === 0)).toBe(true)
    expect(joueurNomme(suivante, 'Alice').total).toBe(500)
    expect(manche(suivante).index).toBe(1)
    expect(game.playedPuzzleIds).toHaveLength(2)
    expect(courant(suivante).name).toBe('Bob')
  })

  it('applique le multiplicateur ×2 en deuxième manche et ×3 en troisième', () => {
    const depart = demarrer({ answer: 'le vent' })
    const manche1 = jouer(resoudre(depart, manche(depart).puzzle.answer), {
      type: 'round/next',
      puzzle: enigme('mon chat'),
      firstPlayer: 0,
    })
    const double = proposer(tourner(manche1, cash(500)), 'C')
    expect(courant(double).pot).toBe(1000)

    const manche2 = jouer(resoudre(double, manche(double).puzzle.answer), {
      type: 'round/next',
      puzzle: enigme('la mer'),
      firstPlayer: 0,
    })
    const triple = proposer(tourner(manche2, cash(500)), 'R')
    expect(courant(triple).pot).toBe(1500)
  })

  it('termine la partie après la dernière manche', () => {
    const depart = demarrer({ config: { roundCount: 1 } })
    const state = jouer(resoudre(depart, manche(depart).puzzle.answer), {
      type: 'round/next',
      puzzle: enigme('mon chat'),
      firstPlayer: 0,
    })
    const progress = jeu(state).progress
    expect(progress.kind).toBe('game-over')
    if (progress.kind === 'game-over') {
      expect(progress.winners).toEqual([asPlayerId('alice')])
    }
    // Aucune énigme consommée pour une manche qui n'aura pas lieu.
    expect(jeu(state).playedPuzzleIds).toHaveLength(1)
  })

  it('déclare deux vainqueurs à égalité parfaite', () => {
    const config = { roundCount: 2 }
    const depart = demarrer({ config })
    const manche1 = jouer(resoudre(depart, manche(depart).puzzle.answer), {
      type: 'round/next',
      puzzle: enigme('mon chat'),
      firstPlayer: 1,
    })
    const state = jouer(resoudre(manche1, manche(manche1).puzzle.answer), {
      type: 'round/next',
      puzzle: enigme('la mer'),
      firstPlayer: 0,
    })
    const progress = jeu(state).progress
    expect(progress.kind).toBe('game-over')
    if (progress.kind === 'game-over') {
      expect([...progress.winners].sort()).toEqual([asPlayerId('alice'), asPlayerId('bob')])
    }
  })
})

describe('réponse attendue de la manche finale', () => {
  // Le libellé respecte les contraintes du catalogue (10 à 42 caractères,
  // majuscules accentuées, espace, apostrophe droite, trait d'union — donc pas
  // de point d'interrogation) : c'est le même énoncé qu'accepterait l'éditeur.
  const enonce = "quelle est la capitale de l'australie"
  const attendue = 'CANBERRA'

  it('conserve la réponse attendue d’une partie démarrée sur une question', () => {
    const state = demarrer({ answer: enonce, bonusAnswer: attendue })
    expect(manche(state).puzzle.bonusAnswer).toBe(attendue)
  })

  it('ne pose jamais de clé bonusAnswer fantôme sur une énigme ordinaire', () => {
    // `toBeUndefined()` passerait même si `snapshotPuzzle` posait `bonusAnswer:
    // undefined` : seul `Object.hasOwn` distingue « absent » de « présent et vide ».
    const state = demarrer()
    expect(Object.hasOwn(manche(state).puzzle, 'bonusAnswer')).toBe(false)
  })

  it('porte la réponse attendue jusqu’au résumé d’une manche gagnée par résolution', () => {
    const state = demarrer({ answer: enonce, bonusAnswer: attendue })
    const resolu = resoudre(state, manche(state).puzzle.answer)
    const progress = jeu(resolu).progress
    expect(progress.kind).toBe('round-over')
    if (progress.kind === 'round-over') {
      expect(progress.summary.puzzle.bonusAnswer).toBe(attendue)
    }
  })

  it('porte la réponse attendue jusqu’au résumé d’une manche annulée pour blocage', () => {
    let state = avecLettres(demarrer({ answer: enonce, bonusAnswer: attendue }), [...CONSONANTS])
    state = jouer(state, { type: 'turn/pass', by: courant(state).id })
    state = jouer(state, { type: 'turn/pass', by: courant(state).id })
    expect(manche(state).phase.kind).toBe('blocked')

    const suivante = jouer(state, {
      type: 'round/next',
      puzzle: enigme('mon chat'),
      firstPlayer: 0,
    })
    const resume = jeu(suivante).history[0]
    expect(resume?.outcome).toEqual({ kind: 'void', reason: 'blocked' })
    expect(resume?.puzzle.bonusAnswer).toBe(attendue)
  })

  it('fait arriver intacte dans la manche suivante la réponse attendue passée à round/next', () => {
    const depart = demarrer({ answer: 'le vent' })
    const suivante = jouer(resoudre(depart, manche(depart).puzzle.answer), {
      type: 'round/next',
      puzzle: question('mon chat', attendue),
      firstPlayer: 0,
    })
    expect(manche(suivante).puzzle.bonusAnswer).toBe(attendue)
  })

  it('protège la réponse attendue d’une mutation de l’énigme après le démarrage', () => {
    const puzzle = question(enonce, attendue)
    const state = reduce(initialState, {
      type: 'game/start',
      config: CONFIG,
      players: [joueur('Alice')],
      puzzle,
      firstPlayer: 0,
    })
    // Mutation tardive de l'objet reçu par `game/start` : l'instantané doit être
    // une copie par valeur, jamais la référence — sinon l'éditeur d'énigmes
    // pourrait modifier une partie en cours.
    Object.assign(puzzle, { bonusAnswer: 'AUTRE REPONSE' })
    expect(manche(state).puzzle.bonusAnswer).toBe(attendue)
  })
})

describe('scénario complet', () => {
  it('déroule trois manches et désigne le bon vainqueur', () => {
    // Manche 1 (×1) — Alice encaisse puis se ruine, Bob termine à la voyelle.
    let state = demarrer({ answer: 'le vent', firstPlayer: 0 })
    state = proposer(tourner(state, cash(500)), 'T')
    expect(courant(state).pot).toBe(500)
    state = proposer(tourner(state, cash(300)), 'N')
    expect(courant(state).pot).toBe(800)
    state = tourner(state, BANQUEROUTE)
    expect(joueurNomme(state, 'Alice').pot).toBe(0)
    expect(courant(state).name).toBe('Bob')
    state = proposer(tourner(state, cash(600)), 'V')
    state = proposer(tourner(state, cash(250)), 'L')
    expect(courant(state).pot).toBe(850)
    state = acheter(state, 'E')
    expect(jeu(state).progress.kind).toBe('round-over')
    expect(joueurNomme(state, 'Bob').total).toBe(600)

    // Manche 2 (×2) — Bob passe, Alice enchaîne et achète les deux voyelles.
    state = jouer(state, { type: 'round/next', puzzle: enigme('mon chat'), firstPlayer: 1 })
    expect(manche(state).index).toBe(1)
    state = proposer(tourner(state, cash(500)), 'C')
    expect(courant(state).pot).toBe(1000)
    state = tourner(state, PASSE)
    expect(joueurNomme(state, 'Bob').pot).toBe(1000)
    expect(courant(state).name).toBe('Alice')
    state = proposer(tourner(state, cash(400)), 'T')
    state = proposer(tourner(state, cash(300)), 'N')
    state = proposer(tourner(state, cash(200)), 'M')
    state = proposer(tourner(state, cash(350)), 'H')
    expect(courant(state).pot).toBe(2500)
    state = acheter(state, 'O')
    expect(courant(state).name).toBe('Alice')
    expect(courant(state).pot).toBe(2250)
    state = acheter(state, 'A')
    expect(jeu(state).progress.kind).toBe('round-over')
    expect(joueurNomme(state, 'Alice').total).toBe(2000)

    // Manche 3 (×3) — Alice se trompe, Bob résout et emporte la partie.
    state = jouer(state, { type: 'round/next', puzzle: enigme('la mer'), firstPlayer: 0 })
    expect(manche(state).index).toBe(2)
    state = proposer(tourner(state, cash(100)), 'Z')
    expect(courant(state).name).toBe('Bob')
    state = proposer(tourner(state, cash(500)), 'R')
    expect(courant(state).pot).toBe(1500)
    state = resoudre(state, manche(state).puzzle.answer)
    expect(joueurNomme(state, 'Bob').total).toBe(2100)

    state = jouer(state, { type: 'round/next', puzzle: enigme('au revoir'), firstPlayer: 0 })
    const game = jeu(state)
    expect(game.progress.kind).toBe('game-over')
    if (game.progress.kind === 'game-over') {
      expect(game.progress.winners).toEqual([asPlayerId('bob')])
    }
    expect(joueurNomme(state, 'Alice').total).toBe(2000)
    expect(joueurNomme(state, 'Bob').total).toBe(2100)
    expect(game.history).toHaveLength(3)
  })
})

const ENONCE_FINALE = "quelle est la capitale de l'australie"
const REPONSE_FINALE = 'CANBERRA'

/**
 * Mène jusqu'à l'étape bonus par de vraies actions plutôt que par un état
 * fabriqué à la main : `roundCount: 1` fait de la première manche la manche
 * finale, la question y est gagnée par le joueur courant (Alice, siège 0).
 */
function versBonus(expected = REPONSE_FINALE): GameState {
  const depart = demarrer({
    answer: ENONCE_FINALE,
    bonusAnswer: expected,
    config: { roundCount: 1 },
  })
  const gagne = resoudre(depart, manche(depart).puzzle.answer)
  return jouer(gagne, { type: 'round/next', puzzle: enigme('mon chat'), firstPlayer: 0 })
}

/**
 * Même chemin, mais sur une manche finale d'index 1 (`roundCount: 2`), dont le
 * multiplicateur ×2 n'est pas ×1 : sert à distinguer le forfait bonus, jamais
 * multiplié, d'un gain de manche qui le serait.
 */
function versBonusManche2(expected = REPONSE_FINALE): GameState {
  const depart = demarrer({ config: { roundCount: 2 } })
  const manche1 = jouer(resoudre(depart, manche(depart).puzzle.answer), {
    type: 'round/next',
    puzzle: question('mon chat', expected),
    firstPlayer: 0,
  })
  const gagne = resoudre(manche1, manche(manche1).puzzle.answer)
  return jouer(gagne, { type: 'round/next', puzzle: enigme('la mer'), firstPlayer: 0 })
}

describe('entrée dans l’étape bonus', () => {
  it('une manche finale gagnée sur une question mène au bonus, avec le bon gagnant et la bonne réponse attendue', () => {
    const depart = demarrer({
      answer: ENONCE_FINALE,
      bonusAnswer: REPONSE_FINALE,
      config: { roundCount: 1 },
    })
    const gagnant = courant(depart).id
    const enonceInitial = manche(depart).puzzle.answer
    const gagne = resoudre(depart, enonceInitial)
    const suivante = jouer(gagne, { type: 'round/next', puzzle: enigme('mon chat'), firstPlayer: 0 })
    const progress = jeu(suivante).progress
    expect(progress.kind).toBe('bonus')
    if (progress.kind === 'bonus') {
      expect(progress.bonus.by).toBe(gagnant)
      expect(progress.bonus.expected).toBe(REPONSE_FINALE)
      expect(progress.bonus.question.answer).toBe(enonceInitial)
    }
  })

  it('ne calcule pas encore les vainqueurs à l’entrée du bonus : winners n’existe pas dans ce progress', () => {
    const state = versBonus()
    const progress = jeu(state).progress
    expect(progress.kind).toBe('bonus')
    // `Object.hasOwn` et pas `toBeUndefined()` : la clé doit être absente, pas
    // seulement vide — c'est ce qui permet au verdict de créer ou de casser une
    // égalité entre les totaux figés à la fin de la dernière manche.
    expect(Object.hasOwn(progress, 'winners')).toBe(false)
  })

  it('une manche finale annulée termine la partie sans bonus, même sur une question', () => {
    let state = avecLettres(
      demarrer({ answer: ENONCE_FINALE, bonusAnswer: REPONSE_FINALE, config: { roundCount: 1 } }),
      [...CONSONANTS],
    )
    state = jouer(state, { type: 'turn/pass', by: courant(state).id })
    state = jouer(state, { type: 'turn/pass', by: courant(state).id })
    expect(manche(state).phase.kind).toBe('blocked')

    const suivante = jouer(state, { type: 'round/next', puzzle: enigme('mon chat'), firstPlayer: 0 })
    const progress = jeu(suivante).progress
    expect(progress.kind).toBe('game-over')
    if (progress.kind === 'game-over') expect(progress.bonus).toBeNull()
  })

  it('un juge indisponible (bonusEnabled: false) termine directement la partie, sans bonus', () => {
    const depart = demarrer({
      answer: ENONCE_FINALE,
      bonusAnswer: REPONSE_FINALE,
      config: { roundCount: 1, bonusEnabled: false },
    })
    const gagne = resoudre(depart, manche(depart).puzzle.answer)
    const suivante = jouer(gagne, { type: 'round/next', puzzle: enigme('mon chat'), firstPlayer: 0 })
    const progress = jeu(suivante).progress
    expect(progress.kind).toBe('game-over')
    if (progress.kind === 'game-over') expect(progress.bonus).toBeNull()
  })

  it('une énigme finale ordinaire (sans bonusAnswer) termine directement la partie', () => {
    const depart = demarrer({ config: { roundCount: 1 } })
    const gagne = resoudre(depart, manche(depart).puzzle.answer)
    const suivante = jouer(gagne, { type: 'round/next', puzzle: enigme('mon chat'), firstPlayer: 0 })
    expect(jeu(suivante).progress.kind).toBe('game-over')
  })

  it('une manche non finale gagnée sur une question enchaîne une manche ordinaire, jamais le bonus', () => {
    // `roundCount: 3` par défaut : la manche 0 n'est pas la dernière.
    const depart = demarrer({ answer: ENONCE_FINALE, bonusAnswer: REPONSE_FINALE })
    const gagne = resoudre(depart, manche(depart).puzzle.answer)
    const suivante = jouer(gagne, { type: 'round/next', puzzle: enigme('mon chat'), firstPlayer: 0 })
    expect(jeu(suivante).progress.kind).toBe('round')
  })
})

describe('les quatre actions de l’étape bonus', () => {
  it('bonus/answer fait passer en jugement, avec la tentative et le requestId', () => {
    const state = versBonus()
    const jugee = repondre(state, 'PARIS', 'req-9')
    const phase = bonus(jugee).phase
    expect(phase.kind).toBe('judging')
    if (phase.kind === 'judging') {
      expect(phase.attempt).toBe('PARIS')
      expect(phase.requestId).toBe('req-9')
    }
  })

  it('ignore une réponse envoyée par un autre joueur que le gagnant de la manche finale', () => {
    const state = versBonus()
    const intrus = joueurNomme(state, 'Bob').id
    const rejet = reduce(state, {
      type: 'bonus/answer',
      by: intrus,
      attempt: REPONSE_FINALE,
      requestId: 'req-1',
    })
    expect(rejet).toBe(state)
  })

  it('ignore une tentative vide ou faite d’espaces', () => {
    const state = versBonus()
    const by = bonus(state).by
    expect(reduce(state, { type: 'bonus/answer', by, attempt: '   ', requestId: 'req-1' })).toBe(
      state,
    )
    expect(reduce(state, { type: 'bonus/answer', by, attempt: '', requestId: 'req-1' })).toBe(
      state,
    )
  })

  it('ignore une seconde réponse envoyée pendant le jugement de la première (double clic)', () => {
    const state = versBonus()
    const jugee = repondre(state, REPONSE_FINALE)
    const rejeu = reduce(jugee, {
      type: 'bonus/answer',
      by: bonus(state).by,
      attempt: 'AUTRE',
      requestId: 'req-2',
    })
    expect(rejeu).toBe(jugee)
  })

  it('un verdict correct crédite exactement le forfait, jamais multiplié par le multiplicateur de la manche finale', () => {
    // Manche finale d'index 1 : son multiplicateur ×2 n'est pas ×1, ce qui
    // distingue un crédit multiplié (bogué) d'un forfait fixe (correct).
    const state = versBonusManche2()
    const avant = joueurNomme(state, 'Alice').total
    const jugee = jouer(repondre(state, REPONSE_FINALE), {
      type: 'bonus/verdict',
      requestId: 'req-1',
      correct: true,
    })
    expect(joueurNomme(jugee, 'Alice').total).toBe(avant + CONFIG.bonusPrize)
    expect(joueurNomme(jugee, 'Alice').total).not.toBe(avant + CONFIG.bonusPrize * 2)
  })

  it('un verdict incorrect termine la partie sans créditer personne', () => {
    const state = versBonus()
    const avantAlice = joueurNomme(state, 'Alice').total
    const avantBob = joueurNomme(state, 'Bob').total
    const jugee = jouer(repondre(state, 'FAUX'), {
      type: 'bonus/verdict',
      requestId: 'req-1',
      correct: false,
    })
    const progress = jeu(jugee).progress
    expect(progress.kind).toBe('game-over')
    expect(joueurNomme(jugee, 'Alice').total).toBe(avantAlice)
    expect(joueurNomme(jugee, 'Bob').total).toBe(avantBob)
    if (progress.kind === 'game-over' && progress.bonus !== null) {
      expect(progress.bonus.outcome.kind).toBe('lost')
    }
  })

  it('le bonus peut créer une égalité entre deux joueurs auparavant séparés', () => {
    // Bob remporte deux manches ordinaires (1000), Alice la finale-question
    // (500) : avant le bonus, Bob mène. Le forfait de 500 ramène Alice à égalité.
    let state = demarrer({ config: { roundCount: 3 }, firstPlayer: 1 })
    state = resoudre(state, manche(state).puzzle.answer)
    state = jouer(state, { type: 'round/next', puzzle: enigme('mon chat'), firstPlayer: 1 })
    state = resoudre(state, manche(state).puzzle.answer)
    state = jouer(state, {
      type: 'round/next',
      puzzle: question(ENONCE_FINALE, REPONSE_FINALE),
      firstPlayer: 0,
    })
    state = resoudre(state, manche(state).puzzle.answer)
    state = jouer(state, { type: 'round/next', puzzle: enigme('la mer'), firstPlayer: 0 })
    expect(jeu(state).progress.kind).toBe('bonus')
    expect(joueurNomme(state, 'Alice').total).toBe(500)
    expect(joueurNomme(state, 'Bob').total).toBe(1000)

    const jugee = jouer(repondre(state, REPONSE_FINALE), {
      type: 'bonus/verdict',
      requestId: 'req-1',
      correct: true,
    })
    const progress = jeu(jugee).progress
    expect(progress.kind).toBe('game-over')
    if (progress.kind === 'game-over') {
      expect([...progress.winners].sort()).toEqual([asPlayerId('alice'), asPlayerId('bob')])
    }
  })

  it('le bonus peut casser une égalité entre deux joueurs', () => {
    // Bob remporte la première manche (500), Alice la finale-question (500) :
    // égalité avant le bonus. Le forfait fait basculer Alice seule en tête.
    let state = demarrer({ config: { roundCount: 2 }, firstPlayer: 1 })
    state = resoudre(state, manche(state).puzzle.answer)
    state = jouer(state, {
      type: 'round/next',
      puzzle: question(ENONCE_FINALE, REPONSE_FINALE),
      firstPlayer: 0,
    })
    state = resoudre(state, manche(state).puzzle.answer)
    state = jouer(state, { type: 'round/next', puzzle: enigme('la mer'), firstPlayer: 0 })
    expect(jeu(state).progress.kind).toBe('bonus')
    expect(joueurNomme(state, 'Alice').total).toBe(500)
    expect(joueurNomme(state, 'Bob').total).toBe(500)

    const jugee = jouer(repondre(state, REPONSE_FINALE), {
      type: 'bonus/verdict',
      requestId: 'req-1',
      correct: true,
    })
    const progress = jeu(jugee).progress
    expect(progress.kind).toBe('game-over')
    if (progress.kind === 'game-over') {
      expect(progress.winners).toEqual([asPlayerId('alice')])
    }
  })

  it('ignore un verdict dont le requestId est périmé', () => {
    const state = versBonus()
    const jugee = repondre(state, REPONSE_FINALE)
    const rejet = reduce(jugee, { type: 'bonus/verdict', requestId: 'req-perime', correct: true })
    expect(rejet).toBe(jugee)
  })

  it('ignore un verdict hors de la phase de jugement', () => {
    const state = versBonus() // encore en awaiting-answer
    const rejet = reduce(state, { type: 'bonus/verdict', requestId: 'req-1', correct: true })
    expect(rejet).toBe(state)
  })

  it('un échec de juge ramène en attente de réponse, sans pénalité, et bonus/answer redevient légale', () => {
    const state = versBonus()
    const avantAlice = joueurNomme(state, 'Alice').total
    const jugee = repondre(state, REPONSE_FINALE)
    const echoue = reduce(jugee, { type: 'bonus/failed', requestId: 'req-1', reason: 'panne du juge' })
    expect(bonus(echoue).phase.kind).toBe('awaiting-answer')
    expect(joueurNomme(echoue, 'Alice').total).toBe(avantAlice)
    expect(legalActions(jeu(echoue))).toContain('bonus/answer')
  })

  it('ignore un échec de juge dont le requestId est périmé', () => {
    const state = versBonus()
    const jugee = repondre(state, REPONSE_FINALE)
    const rejet = reduce(jugee, { type: 'bonus/failed', requestId: 'req-perime', reason: 'panne' })
    expect(rejet).toBe(jugee)
  })

  it('le forfait (bonus/skip) termine la partie sans créditer personne', () => {
    const state = versBonus()
    const avantAlice = joueurNomme(state, 'Alice').total
    const skip = reduce(state, { type: 'bonus/skip', by: bonus(state).by })
    const progress = jeu(skip).progress
    expect(progress.kind).toBe('game-over')
    expect(joueurNomme(skip, 'Alice').total).toBe(avantAlice)
    if (progress.kind === 'game-over' && progress.bonus !== null) {
      expect(progress.bonus.outcome.kind).toBe('skipped')
    }
  })

  it('ignore un forfait envoyé par un autre joueur que le gagnant', () => {
    const state = versBonus()
    const intrus = joueurNomme(state, 'Bob').id
    expect(reduce(state, { type: 'bonus/skip', by: intrus })).toBe(state)
  })

  it('le forfait termine la partie même pendant le jugement d’une réponse : un juge cassé ne bloque jamais la fin', () => {
    const state = versBonus()
    const jugee = repondre(state, REPONSE_FINALE)
    const skip = reduce(jugee, { type: 'bonus/skip', by: bonus(state).by })
    expect(jeu(skip).progress.kind).toBe('game-over')
  })

  it('ignore toute action bonus/* hors de l’étape bonus', () => {
    const state = demarrer()
    const actions: readonly GameAction[] = [
      { type: 'bonus/answer', by: courant(state).id, attempt: 'x', requestId: 'req-1' },
      { type: 'bonus/verdict', requestId: 'req-1', correct: true },
      { type: 'bonus/failed', requestId: 'req-1', reason: 'panne' },
      { type: 'bonus/skip', by: courant(state).id },
    ]
    for (const action of actions) {
      expect(reduce(state, action), `action ${action.type} acceptée à tort`).toBe(state)
    }
  })
})

describe('config/set-bonus-enabled', () => {
  it('change la valeur du réglage', () => {
    const state = demarrer()
    const desactive = reduce(state, { type: 'config/set-bonus-enabled', enabled: false })
    expect(jeu(desactive).config.bonusEnabled).toBe(false)
  })

  it('renvoie la même référence quand la valeur ne change pas', () => {
    const state = demarrer() // bonusEnabled: true par défaut, voir CONFIG
    const inchange = reduce(state, { type: 'config/set-bonus-enabled', enabled: true })
    expect(inchange).toBe(state)
  })

  it('ne referme pas une étape bonus déjà ouverte, ni ne recalcule sa phase', () => {
    const state = versBonus()
    const desactive = reduce(state, { type: 'config/set-bonus-enabled', enabled: false })
    expect(jeu(desactive).progress.kind).toBe('bonus')
    expect(jeu(desactive).config.bonusEnabled).toBe(false)
  })
})

const ENIGMES = ['le vent', 'mon chat', 'la mer', 'au revoir', 'bonne nuit', 'petit ours'] as const

/**
 * `game.history.length + 1` et pas `game.history.length` : au moment d'un
 * `round/next`, `history` n'a pas encore reçu le résumé de la manche qui
 * s'achève (`game.history.length` est son index), donc la manche à venir
 * porte l'index suivant. Sans le `+ 1`, la manche finale ne serait jamais une
 * question et la branche bonus ne serait jamais fuzzée.
 */
function enigmeSuivante(game: Game): Puzzle {
  const index = game.history.length + 1
  const answer = ENIGMES[index % ENIGMES.length] ?? 'le vent'
  const id = `fuzz-${index}`
  return isFinalRound(index, game.config.roundCount) ? question(answer, 'REPONSE', id) : enigme(answer, id)
}

/**
 * Construit une action valide du type demandé. Elle doit être **acceptée** par le
 * reducer : une action rejetée ferait tourner le fuzz sur place et masquerait un
 * vrai interblocage derrière un dépassement de compteur.
 */
function actionPour(
  game: Game,
  type: GameAction['type'],
  rng: () => number,
  tick: number,
): GameAction {
  if (type === 'round/next') {
    return {
      type,
      puzzle: enigmeSuivante(game),
      firstPlayer: Math.floor(rng() * game.players.length),
    }
  }

  // Les quatre actions de l'étape bonus, à traiter avant la garde
  // `progress.kind !== 'round'` ci-dessous : l'étape bonus n'est pas une manche.
  if (
    type === 'bonus/answer' ||
    type === 'bonus/verdict' ||
    type === 'bonus/failed' ||
    type === 'bonus/skip'
  ) {
    if (game.progress.kind !== 'bonus') throw new Error(`Type ${type} hors étape bonus`)
    const bonusState = game.progress.bonus
    switch (type) {
      case 'bonus/answer':
        return { type, by: bonusState.by, attempt: bonusState.expected, requestId: `req-${tick}` }
      case 'bonus/skip':
        return { type, by: bonusState.by }
      case 'bonus/verdict': {
        if (bonusState.phase.kind !== 'judging') throw new Error('Verdict hors jugement')
        // `requestId` de la phase courante, jamais inventé : sinon l'action est
        // rejetée et le fuzz tourne sur place. Tiré sur le `rng` de la partie,
        // jamais `Math.random`, pour rester reproductible depuis la graine.
        return { type, requestId: bonusState.phase.requestId, correct: rng() < 0.5 }
      }
      case 'bonus/failed': {
        if (bonusState.phase.kind !== 'judging') throw new Error('Échec hors jugement')
        return { type, requestId: bonusState.phase.requestId, reason: 'panne simulée du juge' }
      }
    }
  }

  if (game.progress.kind !== 'round') throw new Error(`Type ${type} hors manche`)
  const round = game.progress.round
  const by = currentPlayerOf(game).id

  switch (type) {
    case 'wheel/spin':
      // Deux tirages consommés (force puis imprécision), comme l'ancien
      // `pickSpinOutcome` : les graines du fuzz restent valables telles quelles.
      return { type, by, thrown: throwFromForce(rng(), rng, tick) }
    case 'wheel/settled': {
      if (round.phase.kind !== 'spinning') throw new Error('Règlement hors rotation')
      return { type, by, spinId: round.phase.spin.spinId }
    }
    case 'letter/consonant': {
      const letter = pick(rng, remainingConsonants(round))
      if (letter === undefined) throw new Error('Aucune consonne disponible')
      return { type, by, letter }
    }
    case 'letter/buy-vowel': {
      const letter = pick(rng, remainingVowels(round))
      if (letter === undefined) throw new Error('Aucune voyelle disponible')
      return { type, by, letter }
    }
    case 'turn/pass':
      return { type, by }
    case 'resolve/attempt':
      // Une réponse juste de temps en temps : sinon aucune manche ne se termine
      // jamais par résolution, et la branche gagnante du reducer n'est jamais fuzzée.
      return { type, by, attempt: rng() < 0.35 ? round.puzzle.answer : 'reponse fausse' }
    default:
      throw new Error(`Type non gérable par le fuzz : ${type}`)
  }
}

function verifierInvariants(game: Game, totauxPrecedents: readonly number[]): void {
  game.players.forEach((player, seat) => {
    expect(player.pot, `cagnotte négative pour ${player.name}`).toBeGreaterThanOrEqual(0)
    expect(player.total, `banque en baisse pour ${player.name}`).toBeGreaterThanOrEqual(
      totauxPrecedents[seat] ?? 0,
    )
  })

  if (game.progress.kind === 'round') {
    const round = game.progress.round
    expect(new Set(round.guessed).size, 'lettre proposée deux fois').toBe(round.guessed.length)
    // Le compteur ne doit jamais dépasser le nombre de joueurs : au-delà, c'est
    // qu'une transition autre qu'une passe a oublié de le remettre à zéro.
    expect(round.passes, 'compteur de passes hors bornes').toBeLessThanOrEqual(
      game.players.length,
    )
    expect(game.progress.currentPlayer).toBeGreaterThanOrEqual(0)
    expect(game.progress.currentPlayer).toBeLessThan(game.players.length)
    expect(() => currentPlayerOf(game)).not.toThrow()
  }

  if (game.progress.kind === 'bonus') {
    // Le joueur du bonus est toujours un joueur connu, et la réponse attendue
    // n'y est jamais vide : un état bonus orphelin ou infondé serait un bug du
    // moteur, pas une variation légitime du fuzz.
    expect(bonusPlayerOf(game), 'joueur du bonus introuvable').not.toBeNull()
    expect(
      game.progress.bonus.expected.trim().length,
      'réponse attendue vide en étape bonus',
    ).toBeGreaterThan(0)
  }
}

/**
 * Le compteur est large parce qu'une manche coûte jusqu'à trois actions par
 * lettre (lancer, régler, proposer). Ce n'est pas lui qui détecte les
 * interblocages : c'est `legalActions` vide hors `game-over`, testé à chaque pas.
 */
const PAS_MAX = 1200

function fuzz(seed: number): { pas: number; state: GameState } {
  const rng = createRng(seed)
  let state = demarrer({
    players: [joueur('Alice'), joueur('Bob'), joueur('Chloé')],
  })
  let pas = 0

  while (jeu(state).progress.kind !== 'game-over') {
    pas += 1
    if (pas > PAS_MAX) {
      throw new Error(`Partie non terminée en ${PAS_MAX} pas : ${JSON.stringify(jeu(state).progress)}`)
    }

    const game = jeu(state)
    const types = legalActions(game)
    expect(types.length, `interblocage : ${JSON.stringify(game.progress)}`).toBeGreaterThan(0)

    const type = pick(rng, types)
    if (type === undefined) throw new Error('Aucune action tirée')

    const totaux = game.players.map((player) => player.total)
    const suivant = reduce(state, actionPour(game, type, rng, pas))
    expect(suivant, `action ${type} rejetée en plein fuzz`).not.toBe(state)

    state = suivant
    verifierInvariants(jeu(state), totaux)
  }

  return { pas, state }
}

/**
 * Deux cents parties complètes, chacune assertée à chaque pas : les quelques
 * secondes que ça prend dépassent le délai par défaut de Vitest sur un runner
 * de CI, plus lent que la machine de développement. Le délai est donc
 * explicite ici plutôt que global, pour que les autres tests gardent la garde
 * rapprochée qui repère une boucle infinie.
 */
const DELAI_FUZZ = 60_000

describe('fuzz d’invariants', () => {
  it(
    'termine sans violer un invariant, résolution comprise',
    () => {
      for (let seed = 1; seed <= 200; seed += 1) {
        const { state } = fuzz(seed)
        expect(jeu(state).history).toHaveLength(3)
      }
    },
    DELAI_FUZZ,
  )
})
