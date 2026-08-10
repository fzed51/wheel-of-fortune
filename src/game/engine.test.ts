import { describe, expect, it } from 'vitest'
import type { GameAction } from './actions'
import { initialState, reduce } from './engine'
import { CONSONANTS } from './puzzle'
import { createRng, pick } from './rng'
import {
  canSpin,
  currentPlayerOf,
  isStuck,
  legalActions,
  remainingConsonants,
  remainingVowels,
} from './rules'
import type { Game, GameState, Puzzle } from './types'
import { asPlayerId } from './types'
import { pickSpinOutcome } from './wheel'
import {
  BANQUEROUTE,
  CASH_ZERO,
  CONFIG,
  PASSE,
  acheter,
  avecLettres,
  avecPot,
  cash,
  courant,
  demarrer,
  enigme,
  jeu,
  joueur,
  joueurNomme,
  jouer,
  manche,
  proposer,
  question,
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

  it('range l’énigme par valeur, pas par référence', () => {
    const puzzle = enigme('le vent')
    const state = reduce(initialState, {
      type: 'game/start',
      config: { roundCount: 3, vowelCost: 250, minRoundPrize: 500, bonusPrize: 500 },
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
    const by = courant(demarrer()).id
    const lance = jouer(demarrer(), {
      type: 'wheel/spin',
      by,
      spin: { index: cash(500), offset: 0, spinId: 7 },
    })
    expect(reduce(lance, { type: 'wheel/settled', by, spinId: 8 })).toBe(lance)
  })

  it('refuse de lancer quand plus aucune consonne n’est disponible', () => {
    const state = avecLettres(demarrer(), [...CONSONANTS])
    expect(canSpin(jeu(state))).toBe(false)
    const rejet = reduce(state, {
      type: 'wheel/spin',
      by: courant(state).id,
      spin: { index: cash(500), offset: 0, spinId: 1 },
    })
    expect(rejet).toBe(state)
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
      { type: 'wheel/spin', by: intrus, spin: { index: cash(500), offset: 0, spinId: 1 } },
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

const ENIGMES = ['le vent', 'mon chat', 'la mer', 'au revoir', 'bonne nuit', 'petit ours'] as const

function enigmeSuivante(game: Game): Puzzle {
  const answer = ENIGMES[(game.history.length + 1) % ENIGMES.length] ?? 'le vent'
  return enigme(answer, `fuzz-${game.history.length + 1}`)
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

  if (game.progress.kind !== 'round') throw new Error(`Type ${type} hors manche`)
  const round = game.progress.round
  const by = currentPlayerOf(game).id

  switch (type) {
    case 'wheel/spin':
      return { type, by, spin: pickSpinOutcome(rng, tick) }
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
