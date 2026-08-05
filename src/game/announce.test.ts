import { describe, expect, it } from 'vitest'
import {
  BANQUEROUTE,
  PASSE,
  avecLettres,
  avecPhase,
  avecPot,
  cash,
  courant,
  demarrer,
  enigme,
  jeu,
  joueur,
  jouer,
  manche,
  proposer,
  resoudre,
  tourner,
} from '../test/game'
import {
  announceJudgeFailure,
  announcePuzzle,
  announceTransition,
  announceTurn,
  formatEuros,
  spellPuzzle,
} from './announce'
import type { Letter } from './types'

const BOT_1 = joueur('Bot 1', { kind: { type: 'bot', level: 'easy' } })

describe('formatEuros', () => {
  it('accorde « euro » au singulier à zéro', () => {
    expect(formatEuros(0)).toBe('0 euro')
  })

  it('accorde « euro » au singulier à un', () => {
    expect(formatEuros(1)).toBe('1 euro')
  })

  it('accorde « euros » au pluriel sans regroupement sous le millier', () => {
    expect(formatEuros(250)).toBe('250 euros')
  })

  it('groupe les milliers par une espace insécable', () => {
    expect(formatEuros(1500)).toBe('1 500 euros')
  })

  it('groupe les dizaines de milliers de la même façon', () => {
    expect(formatEuros(12500)).toBe('12 500 euros')
  })
})

describe('spellPuzzle', () => {
  it('épelle L’ARBRE DE VIE lettre par lettre, apostrophe et blancs compris', () => {
    const revealed = new Set<Letter>(['E', 'R'])
    expect(spellPuzzle("L'ARBRE DE VIE", revealed)).toBe(
      "blanc apostrophe blanc R blanc R E, blanc E, blanc blanc E.",
    )
  })

  it('replie un accent sur sa lettre de jeu pour savoir si une lettre accentuée est révélée', () => {
    // Seul E est révélé : T doit rester « blanc », pas apparaître en clair.
    const revealed = new Set<Letter>(['E'])
    expect(spellPuzzle('ÉTÉ', revealed)).toBe('E blanc E.')
  })

  it('rend blanc une lettre accentuée non révélée', () => {
    const revealed = new Set<Letter>()
    expect(spellPuzzle('ÉTÉ', revealed)).toBe('blanc blanc blanc.')
  })
})

describe('announcePuzzle', () => {
  it('préfixe le nombre de mots avant d’épeler la réponse', () => {
    const state = avecLettres(demarrer({ answer: "l'arbre de vie" }), ['E', 'R'])
    expect(announcePuzzle(manche(state))).toBe(
      "3 mots. blanc apostrophe blanc R blanc R E, blanc E, blanc blanc E.",
    )
  })

  it('accorde « mot » au singulier pour une réponse en un seul mot', () => {
    const state = demarrer({ answer: 'terre' })
    expect(announcePuzzle(manche(state))).toBe('1 mot. blanc blanc blanc blanc blanc.')
  })
})

describe('announceTurn', () => {
  it('dit « À vous de jouer » quand le joueur courant est humain', () => {
    expect(announceTurn(jeu(demarrer()))).toBe('À vous de jouer.')
  })

  it('nomme le bot quand le joueur courant est un bot', () => {
    const state = demarrer({ players: [joueur('Alice'), BOT_1], firstPlayer: 1 })
    expect(announceTurn(jeu(state))).toBe('Au tour de Bot 1.')
  })

  it('rend une chaîne vide hors d’une manche', () => {
    const fini = jouer(resoudre(demarrer({ config: { roundCount: 1 } }), true), {
      type: 'round/next',
      puzzle: manche(demarrer()).puzzle,
      firstPlayer: 0,
    })
    expect(announceTurn(jeu(fini))).toBe('')
  })
})

describe('announceJudgeFailure', () => {
  it('propose de vérifier la connexion sur une panne réseau', () => {
    expect(announceJudgeFailure('network')).toBe(
      'Le juge est injoignable. Vérifiez votre connexion, puis réessayez.',
    )
  })

  it('invite à réessayer sur un délai dépassé', () => {
    expect(announceJudgeFailure('timeout')).toBe("Le juge n'a pas répondu à temps. Réessayez.")
  })

  it('signale une réponse illisible', () => {
    expect(announceJudgeFailure('bad-response')).toBe('Réponse du juge illisible. Réessayez.')
  })

  it('renvoie vers les réglages sur une clé refusée', () => {
    expect(announceJudgeFailure('unauthorized')).toBe(
      "Clé d'API refusée. Vérifiez-la dans les Réglages.",
    )
  })
})

describe('announceTransition — état inchangé', () => {
  it('ne rend rien quand le reducer refuse l’action (même référence)', () => {
    const prev = demarrer()
    // `turn/pass` hors blocage est une action illégale : le reducer la rejette.
    const action = { type: 'turn/pass' as const, by: courant(prev).id }
    const next = jouer(prev, action)
    expect(next).toBe(prev)
    expect(announceTransition(prev, next, action)).toEqual({ status: '', alert: '' })
  })

  it('ne rend rien pour un changement de réglage, même appliqué', () => {
    const prev = demarrer()
    const action = { type: 'config/set-resolve-enabled' as const, enabled: false }
    const next = jouer(prev, action)
    expect(next).not.toBe(prev)
    expect(announceTransition(prev, next, action)).toEqual({ status: '', alert: '' })
  })
})

describe('announceTransition — démarrage et enchaînement de manche', () => {
  it('annonce la manche, le multiplicateur, la catégorie, l’énigme et le joueur au démarrage', () => {
    const prev = { kind: 'no-game' as const }
    const action = {
      type: 'game/start' as const,
      config: { roundCount: 3, vowelCost: 250, minRoundPrize: 500, resolveEnabled: true },
      players: [joueur('Alice')],
      puzzle: enigme('terre'),
      firstPlayer: 0,
    }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action).status).toBe(
      'Manche 1 sur 3, gains ×1. Catégorie : Test. 1 mot. blanc blanc blanc blanc blanc. À vous de jouer.',
    )
  })
})

describe('announceTransition — roue', () => {
  it('annonce le lancer sans révéler le résultat', () => {
    const prev = demarrer()
    const by = courant(prev).id
    const action = { type: 'wheel/spin' as const, by, spin: { index: cash(500), offset: 0, spinId: 1 } }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({ status: 'La roue tourne…', alert: '' })
  })

  it('annonce le montant sur un segment payant, sans changer de joueur', () => {
    const prev = jouer(demarrer(), {
      type: 'wheel/spin',
      by: courant(demarrer()).id,
      spin: { index: cash(500), offset: 0, spinId: 1 },
    })
    const action = { type: 'wheel/settled' as const, by: courant(prev).id, spinId: 1 }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: "La roue s'arrête sur 500 euros.",
      alert: '',
    })
  })

  it('annonce la banqueroute et nomme le joueur suivant', () => {
    const depart = demarrer({ players: [joueur('Alice'), BOT_1] })
    const prev = jouer(depart, {
      type: 'wheel/spin',
      by: courant(depart).id,
      spin: { index: BANQUEROUTE, offset: 0, spinId: 1 },
    })
    const action = { type: 'wheel/settled' as const, by: courant(prev).id, spinId: 1 }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'Banqueroute. Vous perdez votre cagnotte. Au tour de Bot 1.',
      alert: '',
    })
  })

  it('annonce la passe et nomme le joueur suivant', () => {
    const depart = demarrer({ players: [joueur('Alice'), BOT_1] })
    const prev = jouer(depart, {
      type: 'wheel/spin',
      by: courant(depart).id,
      spin: { index: PASSE, offset: 0, spinId: 1 },
    })
    const action = { type: 'wheel/settled' as const, by: courant(prev).id, spinId: 1 }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'Passe. Vous passez la main. Au tour de Bot 1.',
      alert: '',
    })
  })
})

describe('announceTransition — consonne', () => {
  it('annonce une consonne absente et le joueur suivant', () => {
    const depart = demarrer({ answer: 'terre', players: [joueur('Alice'), BOT_1] })
    const prev = tourner(depart, cash(500))
    const action = { type: 'letter/consonant' as const, by: courant(prev).id, letter: 'S' as const }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'Pas de S. Au tour de Bot 1.',
      alert: '',
    })
  })

  it('annonce une occurrence unique au singulier, sans changer de joueur', () => {
    const prev = tourner(demarrer({ answer: 'le vent' }), cash(500))
    const action = { type: 'letter/consonant' as const, by: courant(prev).id, letter: 'T' as const }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'T, une fois. Cagnotte : 500 euros.',
      alert: '',
    })
  })

  it('annonce plusieurs occurrences avec le total de la cagnotte', () => {
    const prev = tourner(demarrer({ answer: 'terre' }), cash(500))
    const action = { type: 'letter/consonant' as const, by: courant(prev).id, letter: 'R' as const }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'R, 2 fois. Cagnotte : 1 000 euros.',
      alert: '',
    })
  })

  it('nomme le bot auteur avant l’annonce du gain, sans changer la phrase pour un humain', () => {
    const depart = demarrer({ answer: 'terre', players: [joueur('Alice'), BOT_1], firstPlayer: 1 })
    const prev = tourner(depart, cash(500))
    const action = { type: 'letter/consonant' as const, by: courant(prev).id, letter: 'R' as const }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'Bot 1 : R, 2 fois. Cagnotte : 1 000 euros.',
      alert: '',
    })

    // Même coup, même énigme, mais un auteur humain : la phrase garde son absence de sujet.
    const humain = tourner(demarrer({ answer: 'terre' }), cash(500))
    const actionHumain = { type: 'letter/consonant' as const, by: courant(humain).id, letter: 'R' as const }
    const nextHumain = jouer(humain, actionHumain)
    expect(announceTransition(humain, nextHumain, actionHumain)).toEqual({
      status: 'R, 2 fois. Cagnotte : 1 000 euros.',
      alert: '',
    })
  })

  it('nomme le bot auteur sur une consonne absente, en plus du joueur suivant', () => {
    const depart = demarrer({ answer: 'terre', players: [joueur('Alice'), BOT_1], firstPlayer: 1 })
    const prev = tourner(depart, cash(500))
    const action = { type: 'letter/consonant' as const, by: courant(prev).id, letter: 'S' as const }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'Bot 1 : Pas de S. À vous de jouer.',
      alert: '',
    })
  })

  it('remplace l’annonce du gain par la manche gagnée quand la dernière lettre tombe', () => {
    const depart = demarrer({ answer: 'r r', players: [joueur('Alice'), BOT_1] })
    const prev = tourner(depart, cash(300))
    const action = { type: 'letter/consonant' as const, by: courant(prev).id, letter: 'R' as const }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'Manche gagnée par Vous : 600 euros. Réponse : R R.',
      alert: '',
    })
  })
})

describe('announceTransition — voyelle', () => {
  it('annonce une voyelle absente, le débit et le joueur suivant', () => {
    const depart = avecPot(demarrer({ answer: 'zzzz', players: [joueur('Alice'), BOT_1] }), 0, 1000)
    const action = { type: 'letter/buy-vowel' as const, by: courant(depart).id, letter: 'E' as const }
    const next = jouer(depart, action)
    expect(announceTransition(depart, next, action)).toEqual({
      status: 'Pas de E. Voyelle payée 250 euros. Au tour de Bot 1.',
      alert: '',
    })
  })

  it('annonce les occurrences, le débit puis la cagnotte restante', () => {
    const depart = avecPot(demarrer({ answer: 'eeez' }), 0, 1000)
    const action = { type: 'letter/buy-vowel' as const, by: courant(depart).id, letter: 'E' as const }
    const next = jouer(depart, action)
    expect(announceTransition(depart, next, action)).toEqual({
      status: 'E, 3 fois. Voyelle payée 250 euros. Cagnotte : 750 euros.',
      alert: '',
    })
  })

  it('nomme le bot auteur avant l’annonce des occurrences d’une voyelle achetée', () => {
    const depart = avecPot(
      demarrer({ answer: 'eeez', players: [joueur('Alice'), BOT_1], firstPlayer: 1 }),
      1,
      1000,
    )
    const action = { type: 'letter/buy-vowel' as const, by: courant(depart).id, letter: 'E' as const }
    const next = jouer(depart, action)
    expect(announceTransition(depart, next, action)).toEqual({
      status: 'Bot 1 : E, 3 fois. Voyelle payée 250 euros. Cagnotte : 750 euros.',
      alert: '',
    })
  })

  it('nomme le bot même sans changement de tour, sur une voyelle absente en solo', () => {
    // Partie solo : le tour ne change jamais, donc `withTurnAnnounce` ne peut
    // pas nommer l'auteur à la place — le sujet doit être dans la phrase elle-même.
    const solo = avecPot(demarrer({ answer: 'zzzz', players: [BOT_1] }), 0, 1000)
    const action = { type: 'letter/buy-vowel' as const, by: courant(solo).id, letter: 'E' as const }
    const next = jouer(solo, action)
    expect(announceTransition(solo, next, action)).toEqual({
      status: 'Bot 1 : Pas de E. Voyelle payée 250 euros.',
      alert: '',
    })
  })
})

describe('announceTransition — résolution', () => {
  it('annonce l’envoi au juge', () => {
    const prev = demarrer()
    const action = {
      type: 'resolve/start' as const,
      by: courant(prev).id,
      attempt: 'ma proposition',
      requestId: 'req-1',
    }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'Proposition envoyée au juge.',
      alert: '',
    })
  })

  it('annonce que le bot propose une réponse plutôt que l’envoi au juge', () => {
    // `attempt` est un texte de remplacement (`BOT_ATTEMPT`), jamais une vraie
    // réponse : il ne doit apparaître dans aucune phrase.
    const depart = demarrer({ players: [joueur('Alice'), BOT_1], firstPlayer: 1 })
    const action = {
      type: 'resolve/start' as const,
      by: courant(depart).id,
      attempt: 'texte de remplacement du bot',
      requestId: 'req-1',
    }
    const next = jouer(depart, action)
    expect(announceTransition(depart, next, action)).toEqual({
      status: 'Bot 1 propose une réponse.',
      alert: '',
    })
  })

  it('annonce la manche gagnée sur un verdict correct', () => {
    const prev = tourner(demarrer({ answer: 'le vent' }), cash(500))
    const avecPropose = proposer(prev, 'T')
    const action = { type: 'resolve/verdict' as const, requestId: 'req-1', correct: true }
    const enResolution = jouer(avecPropose, {
      type: 'resolve/start',
      by: courant(avecPropose).id,
      attempt: 'le vent',
      requestId: 'req-1',
    })
    const next = jouer(enResolution, action)
    expect(announceTransition(enResolution, next, action)).toEqual({
      status: 'Manche gagnée par Vous : 500 euros. Réponse : LE VENT.',
      alert: '',
    })
  })

  it('annonce un verdict faux et nomme le joueur suivant', () => {
    const depart = demarrer({ players: [joueur('Alice'), BOT_1] })
    const enResolution = jouer(depart, {
      type: 'resolve/start',
      by: courant(depart).id,
      attempt: 'x',
      requestId: 'req-1',
    })
    const action = { type: 'resolve/verdict' as const, requestId: 'req-1', correct: false }
    const next = jouer(enResolution, action)
    expect(announceTransition(enResolution, next, action)).toEqual({
      status: 'Mauvaise réponse. Au tour de Bot 1.',
      alert: '',
    })
  })

  it('nomme le bot qui se trompe sur un verdict faux', () => {
    const depart = demarrer({ players: [joueur('Alice'), BOT_1], firstPlayer: 1 })
    const enResolution = jouer(depart, {
      type: 'resolve/start',
      by: courant(depart).id,
      attempt: 'texte de remplacement du bot',
      requestId: 'req-1',
    })
    const action = { type: 'resolve/verdict' as const, requestId: 'req-1', correct: false }
    const next = jouer(enResolution, action)
    expect(announceTransition(enResolution, next, action)).toEqual({
      status: 'Mauvaise réponse de Bot 1. À vous de jouer.',
      alert: '',
    })
  })

  it('distingue un verdict faux d’un échec technique sur des états identiques, en solo', () => {
    const depart = demarrer({ players: [joueur('Solo')] })
    const enResolution = jouer(depart, {
      type: 'resolve/start',
      by: courant(depart).id,
      attempt: 'x',
      requestId: 'req-1',
    })
    const verdictAction = { type: 'resolve/verdict' as const, requestId: 'req-1', correct: false }
    const failedAction = {
      type: 'resolve/failed' as const,
      requestId: 'req-1',
      reason: 'timeout' as const,
    }
    const apresVerdict = jouer(enResolution, verdictAction)
    const apresEchec = jouer(enResolution, failedAction)

    // Les deux transitions atterrissent sur le même état : seule l'action distingue les annonces.
    expect(apresVerdict).toEqual(apresEchec)

    expect(announceTransition(enResolution, apresVerdict, verdictAction)).toEqual({
      status: 'Mauvaise réponse.',
      alert: '',
    })
    expect(announceTransition(enResolution, apresEchec, failedAction)).toEqual({
      status: '',
      alert: "Le juge n'a pas répondu à temps. Réessayez.",
    })
  })
})

describe('announceTransition — passage de main forcé', () => {
  it('annonce l’absence d’action et le joueur suivant', () => {
    const depart = demarrer({
      answer: 'terre',
      players: [joueur('Alice'), BOT_1],
      config: { resolveEnabled: false },
    })
    const bloque = avecLettres(depart, ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'])
    const action = { type: 'turn/pass' as const, by: courant(bloque).id }
    const next = jouer(bloque, action)
    expect(announceTransition(bloque, next, action)).toEqual({
      status: 'Plus aucune action possible pour vous. Au tour de Bot 1.',
      alert: '',
    })
  })

  it('nomme le bot bloqué plutôt que de dire « vous »', () => {
    const depart = demarrer({
      answer: 'terre',
      players: [joueur('Alice'), BOT_1],
      firstPlayer: 1,
      config: { resolveEnabled: false },
    })
    const bloque = avecLettres(depart, ['B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z'])
    const action = { type: 'turn/pass' as const, by: courant(bloque).id }
    const next = jouer(bloque, action)
    expect(announceTransition(bloque, next, action)).toEqual({
      status: 'Plus aucune action possible pour Bot 1. À vous de jouer.',
      alert: '',
    })
  })
})

describe('announceTransition — fin de manche et de partie', () => {
  it('remplace l’annonce par « manche annulée » quand plus aucune lettre n’est jouable', () => {
    const depart = demarrer({ answer: 'le vent', players: [joueur('Solo')] })
    const bloque = avecPhase(depart, { kind: 'blocked' })
    const action = { type: 'round/next' as const, puzzle: enigme('la mer'), firstPlayer: 0 }
    const next = jouer(bloque, action)
    expect(announceTransition(bloque, next, action)).toEqual({
      status: 'Manche annulée, plus aucune lettre jouable. Réponse : LE VENT.',
      alert: '',
    })
  })

  it('annonce la manche suivante après une manche gagnée', () => {
    const gagnee = resoudre(demarrer({ config: { roundCount: 3 } }), true, 'req-1')
    const action = { type: 'round/next' as const, puzzle: enigme('la mer'), firstPlayer: 0 }
    const next = jouer(gagnee, action)
    expect(announceTransition(gagnee, next, action).status).toBe(
      'Manche 2 sur 3, gains ×2. Catégorie : Test. 2 mots. blanc blanc, blanc blanc blanc. À vous de jouer.',
    )
  })

  it('annonce la victoire finale d’un joueur unique', () => {
    let etat = demarrer({ config: { roundCount: 2 } })
    etat = resoudre(etat, true, 'req-0')
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('la mer'), firstPlayer: 0 })
    etat = resoudre(etat, true, 'req-1')
    const action = { type: 'round/next' as const, puzzle: enigme('x'), firstPlayer: 0 }
    const next = jouer(etat, action)
    expect(jeu(next).progress.kind).toBe('game-over')
    expect(announceTransition(etat, next, action)).toEqual({
      status: 'Partie terminée. Vous gagnez avec 1 000 euros.',
      alert: '',
    })
  })

  it('annonce l’égalité entre le joueur humain et un bot', () => {
    let etat = demarrer({ config: { roundCount: 2 }, players: [joueur('Alice'), BOT_1] })
    etat = resoudre(etat, true, 'req-0')
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('la mer'), firstPlayer: 1 })
    etat = resoudre(etat, true, 'req-1')
    const action = { type: 'round/next' as const, puzzle: enigme('x'), firstPlayer: 0 }
    const next = jouer(etat, action)
    expect(jeu(next).progress.kind).toBe('game-over')
    expect(announceTransition(etat, next, action)).toEqual({
      status: 'Partie terminée. Égalité entre Vous et Bot 1 avec 500 euros.',
      alert: '',
    })
  })
})
