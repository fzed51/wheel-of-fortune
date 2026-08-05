import { describe, expect, it } from 'vitest'
import type { GameAction } from './actions'
import { initialState, reduce } from './engine'
import { CONSONANTS } from './puzzle'
import { createRng, pick } from './rng'
import {
  canSpin,
  currentPlayerOf,
  legalActions,
  remainingConsonants,
  remainingVowels,
} from './rules'
import type { Game, GameState, Puzzle } from './types'
import { asPlayerId } from './types'
import { pickSpinOutcome } from './wheel'
import {
  BANQUEROUTE,
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
      config: { roundCount: 3, vowelCost: 250, minRoundPrize: 500, resolveEnabled: false },
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
    const avecBanque = jouer(resoudre(gagne, true), {
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
      expect(progress.summary.outcome.amount).toBe(500)
    }
    expect(joueurNomme(state, 'Alice').total).toBe(500)
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

describe('résolution', () => {
  it('est refusée quand aucun juge n’est configuré', () => {
    const state = demarrer({ config: { resolveEnabled: false } })
    const rejet = reduce(state, {
      type: 'resolve/start',
      by: courant(state).id,
      attempt: 'le vent',
      requestId: 'r1',
    })
    expect(rejet).toBe(state)
  })

  it('verrouille tout pendant l’attente du verdict', () => {
    const state = demarrer()
    const attente = jouer(state, {
      type: 'resolve/start',
      by: courant(state).id,
      attempt: 'le vent',
      requestId: 'r1',
    })
    expect(manche(attente).phase.kind).toBe('resolving')
    expect(legalActions(jeu(attente))).toEqual(['resolve/verdict', 'resolve/failed'])
  })

  it('un verdict favorable clôt la manche au crédit du joueur', () => {
    const gagne = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const state = resoudre(gagne, true)
    const progress = jeu(state).progress
    expect(progress.kind).toBe('round-over')
    if (progress.kind === 'round-over' && progress.summary.outcome.kind === 'solved') {
      expect(progress.summary.outcome.how).toBe('resolve')
      expect(progress.summary.outcome.amount).toBe(500)
    }
    expect(joueurNomme(state, 'Alice').total).toBe(500)
  })

  it('un verdict défavorable passe la main sans toucher à la cagnotte', () => {
    const gagne = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const state = resoudre(gagne, false)
    expect(courant(state).name).toBe('Bob')
    expect(joueurNomme(state, 'Alice').pot).toBe(500)
    expect(manche(state).phase.kind).toBe('awaiting-action')
  })

  it('un juge injoignable ne coûte ni la main ni la cagnotte', () => {
    const gagne = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const state = jouer(
      gagne,
      { type: 'resolve/start', by: courant(gagne).id, attempt: 'le vent', requestId: 'r1' },
      { type: 'resolve/failed', requestId: 'r1', reason: 'network' },
    )
    expect(courant(state).name).toBe('Alice')
    expect(courant(state).pot).toBe(500)
    expect(manche(state).phase.kind).toBe('awaiting-action')
  })

  it('ignore un verdict au requestId périmé', () => {
    const state = demarrer()
    const attente = jouer(state, {
      type: 'resolve/start',
      by: courant(state).id,
      attempt: 'le vent',
      requestId: 'r1',
    })
    expect(reduce(attente, { type: 'resolve/verdict', requestId: 'r2', correct: true })).toBe(
      attente,
    )
    expect(
      reduce(attente, { type: 'resolve/failed', requestId: 'r2', reason: 'timeout' }),
    ).toBe(attente)
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
      { type: 'resolve/start', by: intrus, attempt: 'x', requestId: 'r1' },
    ]
    for (const action of actions) {
      expect(reduce(state, action), `action ${action.type} acceptée à tort`).toBe(state)
    }
  })
})

describe('blocage général', () => {
  it('bloque la manche quand plus personne ne peut jouer, puis la déclare nulle', () => {
    const coince = avecLettres(demarrer({ config: { resolveEnabled: false } }), [...CONSONANTS])
    expect(legalActions(jeu(coince))).toEqual(['turn/pass'])

    const bloque = jouer(coince, { type: 'turn/pass', by: courant(coince).id })
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
    // Solo sans juge : sans ce rattrapage, le premier « Passe » figerait la partie.
    const solo = avecPot(
      demarrer({ players: [joueur('Alice')], config: { resolveEnabled: false } }),
      0,
      0,
    )
    const gagne = proposer(tourner(solo, cash(500)), 'T')
    const passe = tourner(gagne, PASSE)
    expect(courant(passe).name).toBe('Alice')
    expect(manche(passe).phase.kind).toBe('awaiting-action')
  })
})

describe('enchaînement des manches', () => {
  it('remet les cagnottes à zéro, conserve les banques et incrémente la manche', () => {
    const gagne = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    const suivante = jouer(resoudre(gagne, true), {
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
    const manche1 = jouer(resoudre(demarrer({ answer: 'le vent' }), true), {
      type: 'round/next',
      puzzle: enigme('mon chat'),
      firstPlayer: 0,
    })
    const double = proposer(tourner(manche1, cash(500)), 'C')
    expect(courant(double).pot).toBe(1000)

    const manche2 = jouer(resoudre(double, true), {
      type: 'round/next',
      puzzle: enigme('la mer'),
      firstPlayer: 0,
    })
    const triple = proposer(tourner(manche2, cash(500)), 'R')
    expect(courant(triple).pot).toBe(1500)
  })

  it('termine la partie après la dernière manche', () => {
    const state = jouer(resoudre(demarrer({ config: { roundCount: 1 } }), true), {
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
    const config = { roundCount: 2, resolveEnabled: true }
    const manche1 = jouer(resoudre(demarrer({ config }), true), {
      type: 'round/next',
      puzzle: enigme('mon chat'),
      firstPlayer: 1,
    })
    const state = jouer(resoudre(manche1, true), {
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

describe('config/set-resolve-enabled', () => {
  it('ouvre la résolution en cours de partie', () => {
    const state = demarrer({ config: { resolveEnabled: false } })
    const ouvert = reduce(state, { type: 'config/set-resolve-enabled', enabled: true })
    expect(legalActions(jeu(ouvert))).toContain('resolve/start')
  })

  it('ne change pas de référence sans changement de valeur', () => {
    const state = demarrer({ config: { resolveEnabled: false } })
    expect(reduce(state, { type: 'config/set-resolve-enabled', enabled: false })).toBe(state)
  })

  it('est sans effet hors partie', () => {
    expect(reduce(initialState, { type: 'config/set-resolve-enabled', enabled: true })).toBe(
      initialState,
    )
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
    state = proposer(tourner(state, cash(1000)), 'V')
    state = proposer(tourner(state, cash(250)), 'L')
    expect(courant(state).pot).toBe(1250)
    state = acheter(state, 'E')
    expect(jeu(state).progress.kind).toBe('round-over')
    expect(joueurNomme(state, 'Bob').total).toBe(1000)

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
    state = proposer(tourner(state, cash(750)), 'R')
    expect(courant(state).pot).toBe(2250)
    state = resoudre(state, true)
    expect(joueurNomme(state, 'Bob').total).toBe(3250)

    state = jouer(state, { type: 'round/next', puzzle: enigme('au revoir'), firstPlayer: 0 })
    const game = jeu(state)
    expect(game.progress.kind).toBe('game-over')
    if (game.progress.kind === 'game-over') {
      expect(game.progress.winners).toEqual([asPlayerId('bob')])
    }
    expect(joueurNomme(state, 'Alice').total).toBe(2000)
    expect(joueurNomme(state, 'Bob').total).toBe(3250)
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
    case 'resolve/start':
      return { type, by, attempt: `essai ${tick}`, requestId: `req-${tick}` }
    case 'resolve/verdict': {
      if (round.phase.kind !== 'resolving') throw new Error('Verdict hors résolution')
      // Un verdict favorable de temps en temps : sinon la boucle
      // « résoudre / se tromper » n'aurait aucune raison de finir.
      return { type, requestId: round.phase.requestId, correct: rng() < 0.35 }
    }
    case 'resolve/failed': {
      if (round.phase.kind !== 'resolving') throw new Error('Échec hors résolution')
      return { type, requestId: round.phase.requestId, reason: 'network' }
    }
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

function fuzz(seed: number, resolveEnabled: boolean): { pas: number; state: GameState } {
  const rng = createRng(seed)
  let state = demarrer({
    players: [joueur('Alice'), joueur('Bob'), joueur('Chloé')],
    config: { resolveEnabled },
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

describe('fuzz d’invariants', () => {
  it('termine sans violer un invariant, juge disponible', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const { state } = fuzz(seed, true)
      expect(jeu(state).history).toHaveLength(3)
    }
  })

  it('termine aussi sans juge, où seules les lettres font avancer la partie', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const { state } = fuzz(seed, false)
      expect(jeu(state).history).toHaveLength(3)
    }
  })
})
