import { describe, expect, it } from 'vitest'
import { reduce } from '../game/engine'
import { CONSONANTS } from '../game/puzzle'
import type { Game, GameState } from '../game/types'
import {
  BANQUEROUTE,
  PASSE,
  avecLettres,
  avecPot,
  cash,
  courant,
  demarrer,
  jeu,
  jouer,
  joueur,
  manche,
  partieTerminee,
  proposer,
  resoudre,
  tourner,
} from '../test/game'
import { fromPersisted, toPersisted } from './snapshot'

/** Lance la roue sans la laisser s'arrêter : c'est l'état `spinning`. */
function enRotation(state: GameState, index: number): Game {
  const by = courant(state).id
  return jeu(jouer(state, { type: 'wheel/spin', by, spin: { index, offset: 12.5, spinId: 7 } }))
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
    const ecrit = JSON.stringify(toPersisted(enRotation(demarrer(), cash(400))))
    for (const champ of ['spinId', 'offset', 'requestId', 'attempt', 'spin']) {
      expect(ecrit, `${champ} ne doit pas être persisté`).not.toContain(champ)
    }
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

  it('recopie tout : muter l’enregistrement relu ne touche pas la partie', () => {
    const persisted = toPersisted(jeu(tourner(demarrer(), cash(500))))
    const game = fromPersisted(persisted)

    // Ce que ferait n'importe quel objet sorti d'un `JSON.parse` et gardé partagé.
    const premier = persisted.players[0] as { total: number } | undefined
    if (premier !== undefined) premier.total = 999_999

    expect(game.players[0]?.total).toBe(0)
  })
})
