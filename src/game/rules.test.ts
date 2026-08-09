import { describe, expect, it } from 'vitest'
import {
  BANQUEROUTE,
  acheter,
  avecLettres,
  avecPhase,
  avecPot,
  bot,
  cash,
  courant,
  demarrer,
  jeu,
  jouer,
  manche,
  proposer,
  resoudre,
  tourner,
} from '../test/game'
import {
  canBuyVowel,
  canGuess,
  canResolve,
  canSpin,
  currentPlayerOf,
  isBotTurn,
  isStuck,
  keyState,
  legalActions,
  multiplierFor,
  progressRatio,
  remainingConsonants,
  remainingVowels,
} from './rules'
import { CONSONANTS } from './puzzle'

describe('multiplierFor', () => {
  it('applique ×1, ×2 puis ×3 sur les trois manches', () => {
    expect(multiplierFor(0)).toBe(1)
    expect(multiplierFor(1)).toBe(2)
    expect(multiplierFor(2)).toBe(3)
  })
})

describe('remainingConsonants et remainingVowels', () => {
  it('retirent les lettres déjà proposées, présentes ou non dans l’énigme', () => {
    const state = avecLettres(demarrer({ answer: 'le vent' }), ['T', 'Z', 'E'])
    const round = manche(state)
    expect(remainingConsonants(round)).not.toContain('T')
    expect(remainingConsonants(round)).not.toContain('Z')
    expect(remainingConsonants(round)).toHaveLength(19)
    expect(remainingVowels(round)).toEqual(['A', 'I', 'O', 'U'])
  })
})

describe('progressRatio', () => {
  it('vaut 0 sur une manche neuve', () => {
    expect(progressRatio(manche(demarrer({ answer: 'le vent' })))).toBe(0)
  })

  it('compte les lettres distinctes révélées, pas leurs occurrences', () => {
    // « LE VENT » : 5 lettres distinctes (L, E, V, N, T), dont E deux fois.
    const state = avecLettres(demarrer({ answer: 'le vent' }), ['E'])
    expect(progressRatio(manche(state))).toBeCloseTo(1 / 5)
  })

  it('vaut 1 quand tout est révélé', () => {
    const state = avecLettres(demarrer({ answer: 'le vent' }), ['L', 'E', 'V', 'N', 'T'])
    expect(progressRatio(manche(state))).toBe(1)
  })
})

describe('currentPlayerOf', () => {
  it('rend le joueur au siège courant', () => {
    expect(currentPlayerOf(jeu(demarrer({ firstPlayer: 1 }))).name).toBe('Bob')
  })

  it('lève hors d’une manche plutôt que de rendre undefined', () => {
    const depart = demarrer({ config: { roundCount: 1 } })
    const fini = resoudre(depart, manche(depart).puzzle.answer)
    expect(() => currentPlayerOf(jeu(fini))).toThrow()
  })
})

describe('isBotTurn', () => {
  it('est vrai quand le joueur courant est un bot', () => {
    const state = demarrer({ players: [bot('Bot')], firstPlayer: 0 })
    expect(isBotTurn(jeu(state))).toBe(true)
  })

  it('est faux quand le joueur courant est humain', () => {
    const state = demarrer({ firstPlayer: 0 })
    expect(isBotTurn(jeu(state))).toBe(false)
  })

  it('est faux hors d’une manche', () => {
    const depart = demarrer({ players: [bot('Bot')], config: { roundCount: 1 } })
    const fini = resoudre(depart, manche(depart).puzzle.answer)
    expect(jeu(fini).progress.kind).toBe('round-over')
    expect(isBotTurn(jeu(fini))).toBe(false)
  })
})

describe('canSpin', () => {
  it('est vrai en début de manche', () => {
    expect(canSpin(jeu(demarrer()))).toBe(true)
  })

  it('est faux quand plus aucune consonne n’est disponible', () => {
    // La garde est là et pas ailleurs : on n'entre jamais en `awaiting-consonant`
    // sans consonne jouable.
    const state = avecLettres(demarrer(), [...CONSONANTS])
    expect(canSpin(jeu(state))).toBe(false)
  })

  it('est faux hors de la phase d’action', () => {
    const state = tourner(demarrer(), cash(500))
    expect(manche(state).phase.kind).toBe('awaiting-consonant')
    expect(canSpin(jeu(state))).toBe(false)
  })
})

describe('canBuyVowel', () => {
  it('est vrai à la cagnotte exactement égale au prix', () => {
    expect(canBuyVowel(jeu(avecPot(demarrer(), 0, 250)))).toBe(true)
  })

  it('est faux à un euro près', () => {
    expect(canBuyVowel(jeu(avecPot(demarrer(), 0, 249)))).toBe(false)
  })

  it('est faux quand toutes les voyelles sont sorties', () => {
    const state = avecLettres(avecPot(demarrer(), 0, 5000), ['A', 'E', 'I', 'O', 'U'])
    expect(canBuyVowel(jeu(state))).toBe(false)
  })
})

describe('canResolve', () => {
  it('est toujours vrai en phase d’action, quel que soit l’état de la cagnotte', () => {
    expect(canResolve(jeu(demarrer()))).toBe(true)
    expect(canResolve(jeu(avecLettres(demarrer(), [...CONSONANTS])))).toBe(true)
  })

  it('est faux hors de la phase d’action', () => {
    const state = tourner(demarrer(), cash(500))
    expect(manche(state).phase.kind).toBe('awaiting-consonant')
    expect(canResolve(jeu(state))).toBe(false)
  })

  it('est faux pendant le blocage général', () => {
    const state = avecPhase(demarrer(), { kind: 'blocked' })
    expect(canResolve(jeu(state))).toBe(false)
  })
})

describe('canGuess', () => {
  it('accepte une consonne en attente de consonne, refuse une voyelle', () => {
    const state = tourner(demarrer({ answer: 'le vent' }), cash(500))
    expect(canGuess(jeu(state), 'T')).toBe(true)
    expect(canGuess(jeu(state), 'A')).toBe(false)
  })

  it('accepte une voyelle en phase d’action si la cagnotte suffit', () => {
    const riche = avecPot(demarrer(), 0, 250)
    expect(canGuess(jeu(riche), 'A')).toBe(true)
    expect(canGuess(jeu(avecPot(demarrer(), 0, 0)), 'A')).toBe(false)
  })

  it('refuse une lettre déjà proposée', () => {
    const state = tourner(avecLettres(demarrer(), ['T']), cash(500))
    expect(canGuess(jeu(state), 'T')).toBe(false)
  })
})

describe('isStuck', () => {
  it('est faux tant que le joueur peut tourner', () => {
    expect(isStuck(jeu(demarrer()))).toBe(false)
  })

  it('est vrai sans consonne ni voyelle abordable, même si résoudre reste possible', () => {
    // `canResolve` étant désormais toujours vrai en `awaiting-action`, `isStuck`
    // ne peut plus le croiser : sans lui, plus aucun joueur ne serait jamais
    // « coincé », et `turn/pass` disparaîtrait de `legalActions`.
    const state = avecLettres(demarrer(), [...CONSONANTS])
    expect(isStuck(jeu(state))).toBe(true)
  })
})

describe('legalActions', () => {
  it('propose tourner et résoudre en phase d’action, sans cagnotte', () => {
    expect(legalActions(jeu(demarrer()))).toEqual(['wheel/spin', 'resolve/attempt'])
  })

  it('ajoute l’achat de voyelle dès que la cagnotte suffit', () => {
    expect(legalActions(jeu(avecPot(demarrer(), 0, 250)))).toEqual([
      'wheel/spin',
      'letter/buy-vowel',
      'resolve/attempt',
    ])
  })

  it('n’offre que le règlement du tirage pendant la rotation', () => {
    const by = courant(demarrer()).id
    const state = jouer(demarrer(), {
      type: 'wheel/spin',
      by,
      spin: { index: cash(500), offset: 0, spinId: 1 },
    })
    expect(legalActions(jeu(state))).toEqual(['wheel/settled'])
  })

  it('n’offre que la consonne après un montant', () => {
    expect(legalActions(jeu(tourner(demarrer(), cash(500))))).toEqual(['letter/consonant'])
  })

  it('n’offre que la manche suivante quand tout le monde est bloqué', () => {
    const state = avecPhase(demarrer(), { kind: 'blocked' })
    expect(legalActions(jeu(state))).toEqual(['round/next'])
  })

  it('ajoute le passage de main au joueur sans issue', () => {
    const state = avecLettres(demarrer(), [...CONSONANTS])
    expect(legalActions(jeu(state))).toContain('turn/pass')
  })

  it('n’offre plus rien après la fin de partie', () => {
    const depart = demarrer({ config: { roundCount: 1 } })
    const fini = jouer(resoudre(depart, manche(depart).puzzle.answer), {
      type: 'round/next',
      puzzle: manche(demarrer()).puzzle,
      firstPlayer: 0,
    })
    expect(jeu(fini).progress.kind).toBe('game-over')
    expect(legalActions(jeu(fini))).toEqual([])
  })
})

describe('keyState', () => {
  it('marque une lettre proposée comme utilisée', () => {
    const state = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    expect(keyState(jeu(state), 'T')).toBe('used')
  })

  it('marque disponible ce qui est jouable, verrouillé le reste', () => {
    const state = tourner(demarrer({ answer: 'le vent' }), cash(500))
    expect(keyState(jeu(state), 'T')).toBe('available')
    expect(keyState(jeu(state), 'A')).toBe('locked')
  })

  it('déverrouille les voyelles une fois la cagnotte constituée', () => {
    const state = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    expect(courant(state).pot).toBe(500)
    expect(keyState(jeu(state), 'A')).toBe('available')
  })

  it('verrouille pendant le tour d’un bot une lettre par ailleurs jouable', () => {
    const state = tourner(demarrer({ players: [bot('Bot')], answer: 'le vent' }), cash(500))
    expect(keyState(jeu(state), 'T')).toBe('locked')
  })

  it('garde « used » une lettre déjà proposée pendant le tour d’un bot', () => {
    const state = proposer(
      tourner(demarrer({ players: [bot('Bot')], answer: 'le vent' }), cash(500)),
      'T',
    )
    expect(keyState(jeu(state), 'T')).toBe('used')
  })
})

describe('cohérence avec le reducer', () => {
  it('la banqueroute vide la cagnotte, donc reverrouille les voyelles', () => {
    const gagne = proposer(tourner(demarrer({ answer: 'le vent' }), cash(500)), 'T')
    expect(canBuyVowel(jeu(gagne))).toBe(true)

    const ruine = tourner(gagne, BANQUEROUTE)
    expect(acheter(ruine, 'A')).toBe(ruine)
  })
})
