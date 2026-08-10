import { describe, expect, it } from 'vitest'
import { reduce } from '../game/engine'
import { CONSONANTS } from '../game/puzzle'
import type { Game, GameState } from '../game/types'
import {
  BANQUEROUTE,
  PASSE,
  avecLettres,
  avecPot,
  bonus,
  cash,
  courant,
  demarrer,
  enigme,
  jeu,
  jouer,
  joueur,
  manche,
  partieTerminee,
  proposer,
  repondre,
  resoudre,
  tourner,
} from '../test/game'
import { fromPersisted, toPersisted } from './snapshot'

/** Lance la roue sans la laisser s'arrêter : c'est l'état `spinning`. */
function enRotation(state: GameState, index: number): Game {
  const by = courant(state).id
  return jeu(jouer(state, { type: 'wheel/spin', by, spin: { index, offset: 12.5, spinId: 7 } }))
}

/**
 * Manche finale d'une partie à une seule manche, dont l'énigme est une
 * question : atteint `{ kind: 'bonus' }` par de vraies actions (résolution
 * puis `round/next`), plutôt qu'en construisant l'état à la main — un état
 * bricolé pourrait être un état que le reducer ne produit jamais.
 */
function versEtapeBonus(expected = 'CANBERRA'): GameState {
  const state = demarrer({ bonusAnswer: expected, config: { roundCount: 1 } })
  const resolu = resoudre(state, manche(state).puzzle.answer)
  return jouer(resolu, { type: 'round/next', puzzle: enigme('la mer', 'suite'), firstPlayer: 0 })
}

describe('toPersisted', () => {
  it('conserve tel quel un état déjà persistable', () => {
    const game = jeu(proposer(tourner(demarrer(), cash(500)), 'V'))
    expect(toPersisted(game)).toEqual(game)
  })

  it('applique l’issue du segment plutôt que d’escamoter le tirage', () => {
    // Banqueroute pendant l'animation : recharger ne doit pas rendre la cagnotte.
    const game = enRotation(avecPot(demarrer(), 0, 800), BANQUEROUTE)
    const persisted = toPersisted(game)

    expect(persisted.players[0]?.pot).toBe(0)
    expect(persisted.progress).toMatchObject({ kind: 'round', currentPlayer: 1 })
  })

  it('applique aussi un « Passe » interrompu', () => {
    const persisted = toPersisted(enRotation(demarrer(), PASSE))
    expect(persisted.progress).toMatchObject({ kind: 'round', currentPlayer: 1 })
  })

  it('garde la consonne due quand la roue s’est arrêtée sur un montant', () => {
    const persisted = toPersisted(enRotation(demarrer(), cash(400)))
    expect(persisted.progress).toMatchObject({
      kind: 'round',
      currentPlayer: 0,
      round: { phase: { kind: 'awaiting-consonant', value: 400 } },
    })
  })

  it('conserve une manche bloquée, qui est un état stable', () => {
    // Solo, toutes les consonnes proposées, voyelle inabordable (pot à zéro) :
    // « Passer » devient légal, et une seule passe suffit à bloquer un solo.
    const state = avecLettres(demarrer({ players: [joueur('Solo')] }), [...CONSONANTS])
    const bloque = jeu(reduce(state, { type: 'turn/pass', by: courant(state).id }))

    expect(bloque.progress).toMatchObject({ kind: 'round', round: { phase: { kind: 'blocked' } } })
    expect(toPersisted(bloque).progress).toEqual(bloque.progress)
  })

  it('n’écrit aucune donnée éphémère', () => {
    // L'état en rotation ne porte ni `requestId` ni `attempt` : le seul état du
    // moteur qui en porte est l'étape bonus en cours de jugement, ci-dessous.
    const enJugement = jeu(repondre(versEtapeBonus(), 'Une réponse', 'req-9'))
    expect(bonus({ kind: 'playing', game: enJugement }).phase.kind).toBe('judging')

    const ecrit = [
      JSON.stringify(toPersisted(enRotation(demarrer(), cash(400)))),
      JSON.stringify(toPersisted(enJugement)),
    ].join(' ')
    for (const champ of ['spinId', 'offset', 'requestId', 'attempt', 'spin']) {
      expect(ecrit, `${champ} ne doit pas être persisté`).not.toContain(champ)
    }
  })

  it('réduit l’étape bonus à `by`, `question` et `expected`, sans sa phase', () => {
    const persisted = toPersisted(jeu(versEtapeBonus('CANBERRA')))
    expect(persisted.progress).toEqual({
      kind: 'bonus',
      bonus: { by: expect.any(String), question: expect.any(Object), expected: 'CANBERRA' },
    })
  })

  it('conserve la réponse attendue d’une question dans le puzzle persisté', () => {
    const persisted = toPersisted(jeu(demarrer({ bonusAnswer: 'CANBERRA' })))
    expect(persisted.progress).toMatchObject({
      kind: 'round',
      round: { puzzle: { bonusAnswer: 'CANBERRA' } },
    })
  })

  it('ne fait jamais apparaître de `bonusAnswer` pour une énigme ordinaire', () => {
    // `copyPuzzle` recopie champ par champ : un champ oublié n'est pas ici
    // absent par accident, il ne doit simplement jamais y être posé.
    const persisted = toPersisted(jeu(demarrer()))
    if (persisted.progress.kind !== 'round') throw new Error('manche attendue')
    expect(Object.hasOwn(persisted.progress.round.puzzle, 'bonusAnswer')).toBe(false)
  })
})

describe('fromPersisted', () => {
  it('reconstitue une partie identique, aller-retour compris', () => {
    const game = jeu(proposer(tourner(demarrer(), cash(500)), 'V'))
    expect(fromPersisted(toPersisted(game))).toEqual(game)
  })

  it('reconstitue une manche terminée', () => {
    const game = jeu(resoudre(demarrer(), 'le vent'))
    expect(game.progress.kind).toBe('round-over')
    expect(fromPersisted(toPersisted(game))).toEqual(game)
  })

  it('conserve `passes`, aller-retour compris', () => {
    // Aucune `Phase` ne porte ce compteur : une régression qui l'oublierait
    // dans `copyPhase`/`shell` ne bloquerait une manche que bien plus tard,
    // jamais dès le rechargement qui suit la première passe.
    const state = avecLettres(demarrer(), [...CONSONANTS])
    const passe = reduce(state, { type: 'turn/pass', by: courant(state).id })

    expect(manche(passe).passes).toBe(1)
    expect(fromPersisted(toPersisted(jeu(passe))).progress).toMatchObject({
      kind: 'round',
      round: { passes: 1 },
    })
  })

  it('reconstitue une partie terminée', () => {
    const game = jeu(partieTerminee())
    expect(game.progress.kind).toBe('game-over')
    expect(fromPersisted(toPersisted(game))).toEqual(game)
  })

  it('reconstitue une étape bonus, aller-retour compris, `bonusAnswer` du puzzle inclus', () => {
    const game = jeu(versEtapeBonus('CANBERRA'))
    expect(game.progress).toMatchObject({
      kind: 'bonus',
      bonus: { question: { bonusAnswer: 'CANBERRA' }, phase: { kind: 'awaiting-answer' } },
    })
    expect(fromPersisted(toPersisted(game))).toEqual(game)
  })

  it('ramène un verdict en vol à `awaiting-answer` après un aller-retour', () => {
    const enJugement = repondre(versEtapeBonus(), 'Une réponse', 'req-9')
    expect(bonus(enJugement).phase).toEqual({
      kind: 'judging',
      attempt: 'Une réponse',
      requestId: 'req-9',
    })

    const rejoue = fromPersisted(toPersisted(jeu(enJugement)))
    expect(rejoue.progress).toMatchObject({
      kind: 'bonus',
      bonus: { phase: { kind: 'awaiting-answer' } },
    })
  })

  it('reconstitue une partie terminée avec bonus gagné, montant compris', () => {
    const game = jeu(
      jouer(repondre(versEtapeBonus('CANBERRA'), 'Canberra', 'req-1'), {
        type: 'bonus/verdict',
        requestId: 'req-1',
        correct: true,
      }),
    )
    expect(game.progress).toMatchObject({
      kind: 'game-over',
      bonus: { outcome: { kind: 'won', amount: expect.any(Number) } },
    })
    expect(fromPersisted(toPersisted(game))).toEqual(game)
  })

  it('reconstitue une partie terminée sans étape bonus, `bonus` à `null`', () => {
    const game = jeu(partieTerminee())
    if (game.progress.kind !== 'game-over') throw new Error('partie terminée attendue')
    expect(game.progress.bonus).toBeNull()

    const persisted = toPersisted(game)
    if (persisted.progress.kind !== 'game-over') throw new Error('partie terminée attendue')
    expect(Object.hasOwn(persisted.progress, 'bonus')).toBe(true)
    expect(persisted.progress.bonus).toBeNull()
    expect(fromPersisted(persisted)).toEqual(game)
  })

  it('recopie tout : muter l’enregistrement relu ne touche pas la partie', () => {
    const persisted = toPersisted(jeu(tourner(demarrer(), cash(500))))
    const game = fromPersisted(persisted)

    // Ce que ferait n'importe quel objet sorti d'un `JSON.parse` et gardé partagé.
    const premier = persisted.players[0] as { total: number } | undefined
    if (premier !== undefined) premier.total = 999_999

    expect(game.players[0]?.total).toBe(0)
  })
})
