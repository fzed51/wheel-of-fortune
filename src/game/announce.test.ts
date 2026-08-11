import { describe, expect, it } from 'vitest'
import {
  BANQUEROUTE,
  PASSE,
  avecLettres,
  avecPhase,
  avecPot,
  bonus,
  bot,
  cash,
  courant,
  demarrer,
  enigme,
  jeu,
  joueur,
  jouer,
  lancer,
  manche,
  proposer,
  question,
  repondre,
  resoudre,
  tourner,
} from '../test/game'
import { foldForCompare } from './compare'
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
    const depart = demarrer({ config: { roundCount: 1 } })
    const fini = jouer(resoudre(depart, manche(depart).puzzle.answer), {
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
})

describe('announceTransition — démarrage et enchaînement de manche', () => {
  it('annonce la manche, le multiplicateur, la catégorie, l’énigme et le joueur au démarrage', () => {
    const prev = { kind: 'no-game' as const }
    const action = {
      type: 'game/start' as const,
      config: { roundCount: 3, vowelCost: 250, minRoundPrize: 500, bonusPrize: 500, bonusEnabled: false },
      players: [joueur('Alice')],
      puzzle: enigme('terre'),
      firstPlayer: 0,
    }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action).status).toBe(
      'Manche 1 sur 3, gains ×1. Catégorie : Test. 1 mot. blanc blanc blanc blanc blanc. À vous de jouer.',
    )
  })

  it('ne rend rien à l’œil au démarrage : l’énigme épelée n’a de sens que pour le lecteur d’écran', () => {
    // L'en-tête de `GameRoute` affiche déjà la manche et le multiplicateur, et
    // `PuzzleBoard` les cases : rien à ajouter à l'écran.
    const prev = { kind: 'no-game' as const }
    const action = {
      type: 'game/start' as const,
      config: { roundCount: 3, vowelCost: 250, minRoundPrize: 500, bonusPrize: 500, bonusEnabled: false },
      players: [joueur('Alice')],
      puzzle: enigme('terre'),
      firstPlayer: 0,
    }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action).visible).toBe('')
  })
})

describe('announceTransition — roue', () => {
  it('annonce un lancer faible', () => {
    const prev = demarrer()
    const by = courant(prev).id
    // `over` = 900 − 720 = 180, sous 480 (un tiers de TRAVEL_SPAN_DEGREES) : faible.
    const action = { type: 'wheel/spin' as const, by, thrown: { spinId: 1, travel: 900, durationMs: 3000 } }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'La roue tourne — lancer faible.',
      alert: '',
    })
  })

  it('annonce un lancer moyen', () => {
    const prev = demarrer()
    const by = courant(prev).id
    // `over` = 1500 − 720 = 780, entre 480 et 960 : moyen.
    const action = { type: 'wheel/spin' as const, by, thrown: { spinId: 1, travel: 1500, durationMs: 3000 } }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'La roue tourne — lancer moyen.',
      alert: '',
    })
  })

  it('annonce un lancer fort', () => {
    const prev = demarrer()
    const by = courant(prev).id
    // `over` = 2000 − 720 = 1280, au-dessus de 960 : fort.
    const action = { type: 'wheel/spin' as const, by, thrown: { spinId: 1, travel: 2000, durationMs: 3000 } }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'La roue tourne — lancer fort.',
      alert: '',
    })
  })

  it('replie sur « La roue tourne… » si la phase résultante n’est pas spinning', () => {
    // Cas défensif : le reducer aurait refusé l'action, ou une forme future de
    // l'état. On force une phase `awaiting-action` sans passer par le reducer,
    // pour isoler ce repli sans dépendre d'un vrai rejet d'action.
    const prev = demarrer()
    const by = courant(prev).id
    const forced = avecPhase(prev, { kind: 'awaiting-action' })
    const action = { type: 'wheel/spin' as const, by, thrown: { spinId: 1, travel: 900, durationMs: 3000 } }
    expect(announceTransition(prev, forced, action)).toEqual({ status: 'La roue tourne…', alert: '' })
  })

  it('annonce le montant sur un segment payant, sans changer de joueur', () => {
    const depart = demarrer()
    const prev = jouer(depart, lancer(jeu(depart), courant(depart).id, cash(500)))
    const action = { type: 'wheel/settled' as const, by: courant(prev).id, spinId: 1 }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: "La roue s'arrête sur 500 euros.",
      alert: '',
    })
  })

  it('annonce le segment à 0 : la lettre compte mais ne rapporte rien, sans changer de joueur', () => {
    const depart = demarrer()
    const prev = jouer(depart, lancer(jeu(depart), courant(depart).id, cash(0)))
    const action = { type: 'wheel/settled' as const, by: courant(prev).id, spinId: 1 }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: "La roue s'arrête sur 0 euro : la lettre compte, mais ne rapporte rien.",
      alert: '',
    })
  })

  it('annonce la banqueroute et nomme le joueur suivant', () => {
    const depart = demarrer({ players: [joueur('Alice'), BOT_1] })
    const prev = jouer(depart, lancer(jeu(depart), courant(depart).id, BANQUEROUTE))
    const action = { type: 'wheel/settled' as const, by: courant(prev).id, spinId: 1 }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'Banqueroute. Vous perdez votre cagnotte. Au tour de Bot 1.',
      alert: '',
    })
  })

  it('annonce la passe et nomme le joueur suivant', () => {
    const depart = demarrer({ players: [joueur('Alice'), BOT_1] })
    const prev = jouer(depart, lancer(jeu(depart), courant(depart).id, PASSE))
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
    const announcement = announceTransition(prev, next, action)
    expect(announcement).toEqual({
      status: 'Pas de S. Au tour de Bot 1.',
      alert: '',
    })
    // Évènement ordinaire, sans retour visible autre que `status` : `visible`
    // reste absent, la valeur `toEqual` ci-dessus le confirme déjà en creux —
    // cette assertion le rend explicite pour ne pas reposer sur un oubli.
    expect(announcement.visible).toBeUndefined()
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

  it('annonce une consonne trouvée sur un segment à 0 sans dire un gain absurde, et garde la main', () => {
    const prev = tourner(demarrer({ answer: 'terre' }), cash(0))
    const action = { type: 'letter/consonant' as const, by: courant(prev).id, letter: 'R' as const }
    const next = jouer(prev, action)
    // La cagnotte reste à 0 : le segment n'a rien rapporté, la phrase le dit
    // sans jamais prétendre à un gain — ni « gagnez 0 euros » ni faute de sens.
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'R, 2 fois. Cagnotte : 0 euro.',
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
    // Fin de manche : la même phrase est déjà portée par la carte « Manche
    // terminée » de `GameRoute`, `visible` se vide pour ne pas la doubler.
    expect(announceTransition(prev, next, action)).toEqual({
      status: 'Manche gagnée par Vous : 600 euros. Réponse : R R.',
      alert: '',
      visible: '',
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

  it('remplace l’annonce par la manche gagnée quand la voyelle achetée révèle la dernière lettre', () => {
    // « EE » : les deux seules lettres sont des E, la voyelle achetée solde donc
    // la manche d'un coup, sans qu'aucune consonne n'ait jamais été jouée.
    const depart = avecPot(demarrer({ answer: 'ee', players: [joueur('Alice'), BOT_1] }), 0, 1000)
    const action = { type: 'letter/buy-vowel' as const, by: courant(depart).id, letter: 'E' as const }
    const next = jouer(depart, action)
    // Même raison que pour la consonne gagnante : la carte « Manche terminée »
    // de `GameRoute` porte déjà cette phrase, `visible` se vide pour l'éviter en double.
    expect(announceTransition(depart, next, action)).toEqual({
      status: 'Manche gagnée par Vous : 750 euros. Réponse : EE.',
      alert: '',
      visible: '',
    })
  })
})

describe('announceTransition — résolution', () => {
  it('annonce la manche gagnée sur une réponse juste', () => {
    const prev = tourner(demarrer({ answer: 'le vent' }), cash(500))
    const avecPropose = proposer(prev, 'T')
    const action = { type: 'resolve/attempt' as const, by: courant(avecPropose).id, attempt: 'le vent' }
    const next = jouer(avecPropose, action)
    // Fin de manche : la carte « Manche terminée » de `GameRoute` porte déjà
    // cette phrase, `visible` se vide pour ne pas la doubler.
    expect(announceTransition(avecPropose, next, action)).toEqual({
      status: 'Manche gagnée par Vous : 500 euros. Réponse : LE VENT.',
      alert: '',
      visible: '',
    })
  })

  it('annonce une réponse fausse et nomme le joueur suivant', () => {
    const depart = demarrer({ players: [joueur('Alice'), BOT_1] })
    const action = { type: 'resolve/attempt' as const, by: courant(depart).id, attempt: 'x' }
    const next = jouer(depart, action)
    expect(announceTransition(depart, next, action)).toEqual({
      status: 'Mauvaise réponse. Au tour de Bot 1.',
      alert: '',
    })
  })

  it('nomme le bot qui se trompe sur une réponse fausse', () => {
    const depart = demarrer({ players: [joueur('Alice'), BOT_1], firstPlayer: 1 })
    const action = { type: 'resolve/attempt' as const, by: courant(depart).id, attempt: 'x' }
    const next = jouer(depart, action)
    expect(announceTransition(depart, next, action)).toEqual({
      status: 'Mauvaise réponse de Bot 1. À vous de jouer.',
      alert: '',
    })
  })

  it('ne laisse fuiter la tentative d’un bot dans aucun champ quand elle est fausse', () => {
    // Une tentative de bot **contient la solution** en conditions réelles (voir
    // `game/bot.ts`) : si jamais elle ne matchait pas (bug de comparaison
    // ailleurs, ou reconstruction directe comme ici), `announce.ts` ne doit la
    // laisser fuiter dans aucun des trois champs qu'un lecteur d'écran ou
    // l'écran affichent. La chaîne choisie n'a aucun mot commun avec les
    // phrases d'annonce, pour que le test ne passe pas par accident.
    const attempt = 'ZBRAXOFINGUE'
    const depart = demarrer({ answer: 'terre', players: [joueur('Alice'), BOT_1], firstPlayer: 1 })
    const action = { type: 'resolve/attempt' as const, by: courant(depart).id, attempt }
    const next = jouer(depart, action)
    // La manche continue : la tentative n'a pas été jugée correcte.
    expect(jeu(next).progress.kind).toBe('round')

    const announcement = announceTransition(depart, next, action)
    const visible = announcement.visible ?? announcement.status

    expect(announcement.status).not.toContain(attempt)
    expect(announcement.alert).not.toContain(attempt)
    expect(visible).not.toContain(attempt)

    const folded = foldForCompare(attempt)
    expect(foldForCompare(announcement.status)).not.toContain(folded)
    expect(foldForCompare(announcement.alert)).not.toContain(folded)
    expect(foldForCompare(visible)).not.toContain(folded)
  })
})

describe('announceTransition — passage de main forcé', () => {
  it('annonce l’absence d’action et le joueur suivant', () => {
    const depart = demarrer({
      answer: 'terre',
      players: [joueur('Alice'), BOT_1],
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
    const depart = demarrer({ config: { roundCount: 3 } })
    const gagnee = resoudre(depart, manche(depart).puzzle.answer)
    const action = { type: 'round/next' as const, puzzle: enigme('la mer'), firstPlayer: 0 }
    const next = jouer(gagnee, action)
    expect(announceTransition(gagnee, next, action).status).toBe(
      'Manche 2 sur 3, gains ×2. Catégorie : Test. 2 mots. blanc blanc, blanc blanc blanc. À vous de jouer.',
    )
  })

  it('ne rend rien à l’œil au départ de la manche suivante : l’en-tête et le plateau portent déjà l’information', () => {
    const depart = demarrer({ config: { roundCount: 3 } })
    const gagnee = resoudre(depart, manche(depart).puzzle.answer)
    const action = { type: 'round/next' as const, puzzle: enigme('la mer'), firstPlayer: 0 }
    const next = jouer(gagnee, action)
    expect(announceTransition(gagnee, next, action).visible).toBe('')
  })

  it('annonce la victoire finale d’un joueur unique', () => {
    let etat = demarrer({ config: { roundCount: 2 } })
    etat = resoudre(etat, manche(etat).puzzle.answer)
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('la mer'), firstPlayer: 0 })
    etat = resoudre(etat, manche(etat).puzzle.answer)
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
    etat = resoudre(etat, manche(etat).puzzle.answer)
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('la mer'), firstPlayer: 1 })
    etat = resoudre(etat, manche(etat).puzzle.answer)
    const action = { type: 'round/next' as const, puzzle: enigme('x'), firstPlayer: 0 }
    const next = jouer(etat, action)
    expect(jeu(next).progress.kind).toBe('game-over')
    expect(announceTransition(etat, next, action)).toEqual({
      status: 'Partie terminée. Égalité entre Vous et Bot 1 avec 500 euros.',
      alert: '',
    })
  })
})

describe('announceTransition — entrée en étape bonus', () => {
  it('annonce la manche finale gagnée, le montant du bonus et la question, sans révéler la réponse attendue', () => {
    const gagnee = resoudre(
      demarrer({ config: { roundCount: 1 }, answer: 'quelle est la capitale', bonusAnswer: 'CANBERRA' }),
      'quelle est la capitale',
    )
    const action = { type: 'round/next' as const, puzzle: enigme('x'), firstPlayer: 0 }
    const next = jouer(gagnee, action)
    expect(jeu(next).progress.kind).toBe('bonus')

    const announcement = announceTransition(gagnee, next, action)
    expect(announcement.status).toBe(
      'Manche finale gagnée. La question donne droit à un bonus de 500 euros : QUELLE EST LA CAPITALE. À vous de répondre.',
    )
    // La réponse attendue ne doit jamais transiter par cette phrase : c'est
    // elle qu'il reste à trouver, pas l'énoncé qui est, lui, déjà résolu.
    expect(announcement.status).not.toContain('CANBERRA')
    expect(foldForCompare(announcement.status)).not.toContain(foldForCompare('CANBERRA'))
  })

  it('nomme le bot quand c’est lui qui a gagné la manche finale', () => {
    const bot1 = bot('Bot 1', 'easy')
    const gagnee = resoudre(
      demarrer({
        config: { roundCount: 1 },
        answer: 'quelle est la capitale',
        bonusAnswer: 'CANBERRA',
        players: [joueur('Alice'), bot1],
        firstPlayer: 1,
      }),
      'quelle est la capitale',
    )
    const action = { type: 'round/next' as const, puzzle: enigme('x'), firstPlayer: 0 }
    const next = jouer(gagnee, action)
    expect(announceTransition(gagnee, next, action).status).toBe(
      'Manche finale gagnée. La question donne droit à un bonus de 500 euros : QUELLE EST LA CAPITALE. Au tour de Bot 1 de répondre.',
    )
  })

  it('masque la phrase à l’écran : la carte bonus porte déjà la question et le montant', () => {
    const gagnee = resoudre(
      demarrer({ config: { roundCount: 1 }, answer: 'quelle est la capitale', bonusAnswer: 'CANBERRA' }),
      'quelle est la capitale',
    )
    const action = { type: 'round/next' as const, puzzle: enigme('x'), firstPlayer: 0 }
    const next = jouer(gagnee, action)
    expect(announceTransition(gagnee, next, action).visible).toBe('')
  })
})

describe('announceTransition — réponse à la question bonus', () => {
  it('nomme l’auteur bot sans jamais rendre sa tentative ni la réponse attendue', () => {
    const bot1 = bot('Bot 1', 'easy')
    const attempt = 'ZBRAXOFINGUE'
    let etat = demarrer({
      config: { roundCount: 1 },
      bonusAnswer: 'CANBERRA',
      players: [joueur('Alice'), bot1],
      firstPlayer: 1,
    })
    etat = resoudre(etat, manche(etat).puzzle.answer)
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('x'), firstPlayer: 0 })
    expect(bonus(etat).by).toBe(bot1.id)

    const action = { type: 'bonus/answer' as const, by: bonus(etat).by, attempt, requestId: 'req-1' }
    const next = jouer(etat, action)
    expect(jeu(next).progress.kind).toBe('bonus')

    const announcement = announceTransition(etat, next, action)
    const visible = announcement.visible ?? announcement.status
    expect(announcement.status).toBe("Bot 1 a proposé une réponse. Le juge l'examine…")

    for (const text of [announcement.status, announcement.alert, visible]) {
      expect(text).not.toContain(attempt)
      expect(text).not.toContain('CANBERRA')
    }
    const foldedAttempt = foldForCompare(attempt)
    const foldedExpected = foldForCompare('CANBERRA')
    for (const text of [announcement.status, announcement.alert, visible]) {
      expect(foldForCompare(text)).not.toContain(foldedAttempt)
      expect(foldForCompare(text)).not.toContain(foldedExpected)
    }
  })
})

describe('announceTransition — verdict du juge, étape bonus', () => {
  it('annonce le montant crédité, et la fin de partie mentionne le total avec le bonus', () => {
    let etat = demarrer({ config: { roundCount: 1 }, bonusAnswer: 'CANBERRA' })
    etat = resoudre(etat, manche(etat).puzzle.answer)
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('x'), firstPlayer: 0 })
    const prev = repondre(etat, 'canberra', 'req-1')
    const action = { type: 'bonus/verdict' as const, requestId: 'req-1', correct: true }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action).status).toBe(
      'Bonne réponse ! Bonus de 500 euros crédité. Partie terminée. Vous gagnez avec 1 000 euros (dont 500 euros de bonus).',
    )
  })

  it('révèle la réponse attendue sur un verdict perdant, sans mentionner de bonus dans le total', () => {
    let etat = demarrer({ config: { roundCount: 1 }, bonusAnswer: 'CANBERRA' })
    etat = resoudre(etat, manche(etat).puzzle.answer)
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('x'), firstPlayer: 0 })
    const prev = repondre(etat, 'sydney', 'req-1')
    const action = { type: 'bonus/verdict' as const, requestId: 'req-1', correct: false }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action).status).toBe(
      'Mauvaise réponse. La bonne réponse était CANBERRA. Partie terminée. Vous gagnez avec 500 euros.',
    )
  })

  it('le bonus gagné casse une égalité de totaux, et la fin de partie nomme le bon vainqueur pour le bon montant', () => {
    const bot1 = bot('Bot 1', 'easy')
    const alice = joueur('Alice')
    // Bot 1 gagne la première manche (500 euros), Alice gagne la manche
    // finale (500 euros aussi) : les totaux sont à égalité avant le bonus.
    let etat = demarrer({
      config: { roundCount: 2 },
      players: [alice, bot1],
      firstPlayer: 1,
    })
    etat = resoudre(etat, manche(etat).puzzle.answer)
    etat = jouer(etat, {
      type: 'round/next',
      puzzle: question('quelle est la capitale', 'CANBERRA', 'finale'),
      firstPlayer: 0,
    })
    etat = resoudre(etat, manche(etat).puzzle.answer)
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('x'), firstPlayer: 0 })
    expect(jeu(etat).progress.kind).toBe('bonus')
    expect(jeu(etat).players.map((player) => player.total)).toEqual([500, 500])
    expect(bonus(etat).by).toBe(alice.id)

    const prev = repondre(etat, 'canberra', 'req-1')
    const action = { type: 'bonus/verdict' as const, requestId: 'req-1', correct: true }
    const next = jouer(prev, action)
    const nextGame = jeu(next)
    // Le reducer calcule `winners` après le crédit du bonus : Alice bascule
    // seule en tête, Bot 1 reste à 500 — l'égalité de départ est cassée.
    expect(nextGame.progress.kind === 'game-over' && nextGame.progress.winners).toEqual([alice.id])
    expect(announceTransition(prev, next, action).status).toBe(
      'Bonne réponse ! Bonus de 500 euros crédité. Partie terminée. Vous gagnez avec 1 000 euros (dont 500 euros de bonus).',
    )
  })
})

describe('announceTransition — échec technique du juge, étape bonus', () => {
  it('reprend la phrase d’échec réseau, sans révéler la réponse attendue, et invite à réessayer', () => {
    let etat = demarrer({ config: { roundCount: 1 }, bonusAnswer: 'CANBERRA' })
    etat = resoudre(etat, manche(etat).puzzle.answer)
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('x'), firstPlayer: 0 })
    etat = repondre(etat, 'sydney', 'req-1')
    const action = { type: 'bonus/failed' as const, requestId: 'req-1', reason: 'network' }
    const next = jouer(etat, action)
    const status = announceTransition(etat, next, action).status
    expect(status).toBe(
      'Le juge est injoignable. Vérifiez votre connexion, puis réessayez. Aucune pénalité, vous pouvez retaper votre réponse.',
    )
    expect(status).not.toContain('CANBERRA')
  })

  it('retombe sur la phrase réseau pour une raison inconnue plutôt que de rester muette', () => {
    let etat = demarrer({ config: { roundCount: 1 }, bonusAnswer: 'CANBERRA' })
    etat = resoudre(etat, manche(etat).puzzle.answer)
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('x'), firstPlayer: 0 })
    etat = repondre(etat, 'sydney', 'req-1')
    const action = { type: 'bonus/failed' as const, requestId: 'req-1', reason: 'n’importe quoi' }
    const next = jouer(etat, action)
    expect(announceTransition(etat, next, action).status).toBe(
      'Le juge est injoignable. Vérifiez votre connexion, puis réessayez. Aucune pénalité, vous pouvez retaper votre réponse.',
    )
  })
})

describe('announceTransition — renoncement à la question bonus', () => {
  it('annonce le renoncement puis la fin de partie, sans mention de bonus dans le total', () => {
    let etat = demarrer({ config: { roundCount: 1 }, bonusAnswer: 'CANBERRA' })
    etat = resoudre(etat, manche(etat).puzzle.answer)
    etat = jouer(etat, { type: 'round/next', puzzle: enigme('x'), firstPlayer: 0 })
    const action = { type: 'bonus/skip' as const, by: bonus(etat).by }
    const next = jouer(etat, action)
    expect(announceTransition(etat, next, action).status).toBe(
      'Vous renoncez à la question bonus. Partie terminée. Vous gagnez avec 500 euros.',
    )
  })
})

describe('announceTransition — réglage du bonus', () => {
  it('ne produit aucune annonce : ce n’est pas un coup de partie', () => {
    const prev = demarrer()
    const action = { type: 'config/set-bonus-enabled' as const, enabled: false }
    const next = jouer(prev, action)
    expect(announceTransition(prev, next, action)).toEqual({ status: '', alert: '' })
  })
})
