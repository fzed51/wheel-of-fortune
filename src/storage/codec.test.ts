import { describe, expect, it } from 'vitest'
import { asPuzzleId } from '../game/types'
import type { GameState } from '../game/types'
import {
  cash,
  demarrer,
  enigme,
  jeu,
  jouer,
  manche,
  partieTerminee,
  proposer,
  repondre,
  resoudre,
  tourner,
} from '../test/game'
import {
  decodeGame,
  decodePuzzleFile,
  decodePuzzles,
  decodeRecord,
  decodeSettings,
  encodePuzzleFile,
  encodeRecord,
} from './codec'
import { SCHEMA_VERSION } from './keys'
import { DEFAULT_SETTINGS } from './settings'
import { fromPersisted, toPersisted } from './snapshot'

/**
 * Enveloppe écrite à la main, version lue sur `SCHEMA_VERSION` : un littéral
 * fige la version courante et casse à chaque bump du schéma, exactement le bug
 * que ce fichier corrige plus bas pour les tests qui, eux, veulent une version
 * étrangère volontaire.
 */
function enveloppe(value: unknown): string {
  return JSON.stringify({ version: SCHEMA_VERSION, value })
}

/** Sauvegarde vue comme une donnée brute : ces tests abîment exprès sa forme. */
// oxlint-disable-next-line typescript/no-explicit-any
type Brut = Record<string, any>

/** Sauvegarde valide, éventuellement abîmée avant écriture. */
function sauvegarde(patch: (game: Brut) => void = () => undefined): string {
  const game: Brut = JSON.parse(
    JSON.stringify(toPersisted(jeu(proposer(tourner(demarrer(), cash(500)), 'V')))),
  )
  patch(game)
  return enveloppe(game)
}

/**
 * Manche finale d'une partie à une seule manche, dont l'énigme est une
 * question : atteint `{ kind: 'bonus' }` par de vraies actions plutôt qu'en
 * bricolant l'état, qui pourrait ne jamais être produit par le reducer.
 */
function versEtapeBonus(expected = 'CANBERRA'): GameState {
  const state = demarrer({ bonusAnswer: expected, config: { roundCount: 1 } })
  const resolu = resoudre(state, manche(state).puzzle.answer)
  return jouer(resolu, { type: 'round/next', puzzle: enigme('la mer', 'suite'), firstPlayer: 0 })
}

/** Étape bonus tranchée, gagnée : mène jusqu'à `game-over` avec `bonus.outcome.kind === 'won'`. */
function versGameOverAvecBonusGagne(): GameState {
  return jouer(repondre(versEtapeBonus(), 'Canberra', 'req-1'), {
    type: 'bonus/verdict',
    requestId: 'req-1',
    correct: true,
  })
}

/** Sauvegarde valide d'une étape bonus, éventuellement abîmée avant écriture. */
function sauvegardeBonus(patch: (game: Brut) => void = () => undefined): string {
  const game: Brut = JSON.parse(JSON.stringify(toPersisted(jeu(versEtapeBonus()))))
  patch(game)
  return enveloppe(game)
}

describe('enveloppe', () => {
  it('relit ce qu’elle a écrit', () => {
    expect(decodeRecord(encodeRecord({ bonjour: 1 }))).toEqual({ ok: true, value: { bonjour: 1 } })
  })

  it('signale un contenu illisible plutôt que de laisser lever JSON.parse', () => {
    expect(decodeRecord('{ceci n’est pas du JSON')).toEqual({ ok: false, reason: 'unreadable' })
  })

  it('distingue une version étrangère d’une donnée invalide', () => {
    // Dérivée de `SCHEMA_VERSION` : un littéral casserait ce test au prochain bump,
    // qui rendrait justement cette version « étrangère » égale à la courante.
    expect(decodeRecord(JSON.stringify({ version: SCHEMA_VERSION + 1, value: {} }))).toEqual({
      ok: false,
      reason: 'version',
    })
    expect(decodeRecord('[]')).toEqual({ ok: false, reason: 'invalid' })
    expect(decodeRecord('"du texte"')).toEqual({ ok: false, reason: 'invalid' })
  })

  it('rejette une sauvegarde écrite en version 2, avant l’étape bonus', () => {
    // Littéral volontaire : contrairement au test ci-dessus, celui-ci vérifie
    // précisément que la version antérieure à ce bump est éconduite, pas
    // n'importe quelle version étrangère — `SCHEMA_VERSION + 1` ne le prouverait pas.
    expect(decodeRecord(JSON.stringify({ version: 2, value: {} }))).toEqual({
      ok: false,
      reason: 'version',
    })
  })
})

describe('decodeGame', () => {
  it('accepte une sauvegarde produite par le jeu', () => {
    const game = jeu(proposer(tourner(demarrer(), cash(500)), 'V'))
    const decoded = decodeGame(encodeRecord(toPersisted(game)))
    expect(decoded).toEqual({ ok: true, value: toPersisted(game) })
  })

  it('accepte une partie terminée', () => {
    const persisted = toPersisted(jeu(partieTerminee()))
    expect(decodeGame(encodeRecord(persisted)).ok).toBe(true)
  })

  const abimees: readonly (readonly [string, (game: Brut) => void])[] = [
    ['phase inconnue', (g) => (g.progress.round.phase = { kind: 'spinning' })],
    ['lettre inventée', (g) => (g.progress.round.guessed = ['É'])],
    ['lettre en double', (g) => (g.progress.round.guessed = ['V', 'V'])],
    ['siège hors bornes', (g) => (g.progress.currentPlayer = 2)],
    ['aucun joueur', (g) => (g.players = [])],
    ['cagnotte négative', (g) => (g.players[0].pot = -100)],
    ['total fractionnaire', (g) => (g.players[0].total = 12.5)],
    ['niveau de bot inconnu', (g) => (g.players[0].kind = { type: 'bot', level: 'expert' })],
    ['zéro manche', (g) => (g.config.roundCount = 0)],
    [
      // `bonusPrize` a remplacé `resolveEnabled` : un enregistrement qui ne le
      // porte plus vient d'une version antérieure au refactor des règles.
      'config sans bonusPrize',
      (g) => {
        delete g.config.bonusPrize
      },
    ],
    [
      // `isConfig` doit l'exiger explicitement : sans ce contrôle, une config
      // sans `bonusEnabled` passerait pour valide et le reducer ne saurait
      // jamais s'il doit ouvrir l'étape bonus de la manche finale.
      'config sans bonusEnabled',
      (g) => {
        delete g.config.bonusEnabled
      },
    ],
    ['manche au-delà du compte', (g) => (g.progress.round.index = 3)],
    [
      // Sans ce compteur, un rechargement en cours de tour de table redonnerait
      // un tour gratuit à tout joueur déjà passé.
      'passes manquant',
      (g) => {
        delete g.progress.round.passes
      },
    ],
    ['passes non numérique', (g) => (g.progress.round.passes = 'zéro')],
    ['résumé de manche abîmé', (g) => (g.history = [{ ...g.progress.round, outcome: null }])],
    [
      // Résumé valide, mais une manche de plus que l'index courant : l'historique
      // compte exactement une entrée par manche jouée.
      'historique trop long',
      (g) => {
        g.history = [
          {
            index: 0,
            puzzle: g.progress.round.puzzle,
            outcome: { kind: 'void', reason: 'blocked' },
          },
        ]
      },
    ],
    ['énoncé non normalisé', (g) => (g.progress.round.puzzle.answer = 'le vent')],
    ['énoncé sans lettre', (g) => (g.progress.round.puzzle.answer = '— —')],
    ['bonusAnswer numérique', (g) => (g.progress.round.puzzle.bonusAnswer = 42)],
    ['bonusAnswer objet', (g) => (g.progress.round.puzzle.bonusAnswer = { texte: 'CANBERRA' })],
    [
      'segment hors de la roue',
      (g) => {
        g.progress.round.phase = {
          kind: 'awaiting-consonant',
          value: 500,
          segment: { kind: 'cash', index: 99, value: 500 },
        }
      },
    ],
  ]

  for (const [cas, patch] of abimees) {
    it(`refuse une sauvegarde avec ${cas}`, () => {
      expect(decodeGame(sauvegarde(patch))).toEqual({ ok: false, reason: 'invalid' })
    })
  }

  it('refuse un vainqueur qui n’est pas un joueur de la partie', () => {
    const persisted: Brut = JSON.parse(JSON.stringify(toPersisted(jeu(partieTerminee()))))
    persisted.progress.winners = ['fantome']
    expect(decodeGame(enveloppe(persisted))).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('decodeGame — étape bonus', () => {
  it('accepte une étape bonus valide', () => {
    const persisted = toPersisted(jeu(versEtapeBonus()))
    expect(decodeGame(encodeRecord(persisted))).toEqual({ ok: true, value: persisted })
  })

  const abimeesBonus: readonly (readonly [string, (game: Brut) => void])[] = [
    ['`by` qui n’est pas un joueur de la partie', (g) => (g.progress.bonus.by = 'fantome')],
    ['`expected` vide', (g) => (g.progress.bonus.expected = '')],
    [
      // Le résumé de la manche finale est poussé dans `history` avant l'entrée
      // dans l'étape bonus : un historique plus court signale une sauvegarde
      // incohérente, pas une manche encore en cours.
      'historique plus court que `roundCount`',
      (g) => {
        g.history = []
      },
    ],
  ]

  for (const [cas, patch] of abimeesBonus) {
    it(`refuse une étape bonus avec ${cas}`, () => {
      expect(decodeGame(sauvegardeBonus(patch))).toEqual({ ok: false, reason: 'invalid' })
    })
  }

  it('accepte une partie terminée avec bonus gagné, montant compris', () => {
    const persisted = toPersisted(jeu(versGameOverAvecBonusGagne()))
    expect(decodeGame(encodeRecord(persisted))).toEqual({ ok: true, value: persisted })
  })

  it('refuse un bonus dont l’issue est inconnue', () => {
    const persisted: Brut = JSON.parse(
      JSON.stringify(toPersisted(jeu(versGameOverAvecBonusGagne()))),
    )
    persisted.progress.bonus.outcome = { kind: 'mystere' }
    expect(decodeGame(enveloppe(persisted))).toEqual({ ok: false, reason: 'invalid' })
  })

  it('refuse un montant gagné négatif ou nul', () => {
    const persisted: Brut = JSON.parse(
      JSON.stringify(toPersisted(jeu(versGameOverAvecBonusGagne()))),
    )
    persisted.progress.bonus.outcome.amount = 0
    expect(decodeGame(enveloppe(persisted))).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('question de la manche finale, à travers la chaîne de persistance', () => {
  /**
   * Un seul test qui parcourt toute la chaîne — `snapshotPuzzle` au démarrage,
   * `finishRound` à la victoire, `toPersisted`, `encodeRecord`, `decodeGame`,
   * `fromPersisted` — plutôt qu'un test par maillon : c'est l'oubli du maillon
   * auquel on n'a pas pensé qui fait disparaître `bonusAnswer` en silence, et
   * seul un test de bout en bout l'attrape à coup sûr.
   */
  it('conserve la réponse attendue d’une question tout au long de la chaîne', () => {
    const state = demarrer({ bonusAnswer: 'CANBERRA', config: { roundCount: 1 } })
    const resolu = jeu(resoudre(state, manche(state).puzzle.answer))
    expect(resolu.progress.kind).toBe('round-over')

    const decoded = decodeGame(encodeRecord(toPersisted(resolu)))
    if (!decoded.ok) throw new Error('sauvegarde refusée alors qu’elle est valide')
    const rejoue = fromPersisted(decoded.value)

    expect(rejoue.progress).toMatchObject({
      kind: 'round-over',
      summary: { puzzle: { bonusAnswer: 'CANBERRA' } },
    })
  })

  it('ne fait jamais apparaître de clé `bonusAnswer` sur une énigme ordinaire', () => {
    // `toEqual` ne distingue pas `undefined` de l'absence de clé : seul
    // `Object.hasOwn` voit la différence entre « pas de question » et
    // « question à la réponse vide », qui casseraient toutes les deux `isQuestion`.
    const state = demarrer({ config: { roundCount: 1 } })
    const resolu = jeu(resoudre(state, manche(state).puzzle.answer))

    const decoded = decodeGame(encodeRecord(toPersisted(resolu)))
    if (!decoded.ok) throw new Error('sauvegarde refusée alors qu’elle est valide')
    const rejoue = fromPersisted(decoded.value)
    if (rejoue.progress.kind !== 'round-over') throw new Error('manche non terminée')

    expect(Object.hasOwn(rejoue.progress.summary.puzzle, 'bonusAnswer')).toBe(false)
  })

  it('relit une sauvegarde écrite avant cette fonctionnalité, sans `bonusAnswer`', () => {
    // Aucune sauvegarde antérieure ne porte ce champ : `SCHEMA_VERSION` ne bouge
    // pas pour C1, une entrée qui en manque doit donc rester valide et se lire
    // comme une énigme ordinaire, jamais comme une question à la réponse absente.
    const game = jeu(proposer(tourner(demarrer(), cash(500)), 'V'))
    const decoded = decodeGame(sauvegarde())
    expect(decoded).toEqual({ ok: true, value: toPersisted(game) })
    if (!decoded.ok) return
    if (decoded.value.progress.kind !== 'round') throw new Error('manche attendue')
    expect(Object.hasOwn(decoded.value.progress.round.puzzle, 'bonusAnswer')).toBe(false)
  })
})

describe('decodeSettings', () => {
  it('relit des réglages complets', () => {
    const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const, opponents: 2 }
    expect(decodeSettings(encodeRecord(settings))).toEqual({ ok: true, value: settings })
  })

  it('remplace champ par champ ce qui est hors bornes, sans perdre le reste', () => {
    // Un réglage abîmé ne doit pas coûter à l'utilisateur son thème.
    const decoded = decodeSettings(
      enveloppe({ theme: 'dark', roundCount: 99, opponents: 7, botLevel: 'expert' }),
    )
    expect(decoded).toEqual({
      ok: true,
      value: { ...DEFAULT_SETTINGS, theme: 'dark' },
    })
  })

  it('refuse ce qui n’est pas un objet', () => {
    expect(decodeSettings(enveloppe(42))).toEqual({ ok: false, reason: 'invalid' })
  })

  it('ignore une clé d’API glissée dans les réglages', () => {
    const decoded = decodeSettings(enveloppe({ ...DEFAULT_SETTINGS, apiKey: 'sk-secret' }))
    expect(decoded.ok && Object.keys(decoded.value)).toEqual(Object.keys(DEFAULT_SETTINGS))
  })
})

describe('decodePuzzles', () => {
  it('garde les énigmes valides et écarte les autres', () => {
    const decoded = decodePuzzles(
      enveloppe([
        { id: 'user-1', answer: 'la clé est sous le paillasson', category: 'Expression' },
        { id: 'user-2', answer: '   ', category: 'Vide' },
        { answer: 'sans identifiant', category: 'Expression' },
        'pas un objet',
      ]),
    )
    expect(decoded.ok && decoded.value).toEqual([
      {
        id: 'user-1',
        answer: 'LA CLÉ EST SOUS LE PAILLASSON',
        category: 'Expression',
        source: 'custom',
      },
    ])
  })

  it('normalise avant de valider, pour qu’un import écrit à la main passe', () => {
    const decompose = `cle${String.fromCodePoint(0x301)}`
    const decoded = decodePuzzles(enveloppe([{ id: 'user-3', answer: decompose, category: 'Mot' }]))
    expect(decoded.ok && decoded.value[0]?.answer).toBe('CLÉ')
  })

  it('force `source: custom`, quoi qu’annonce le fichier', () => {
    const decoded = decodePuzzles(
      enveloppe([{ id: 'user-4', answer: 'le vent', category: 'Nature', source: 'pack' }]),
    )
    expect(decoded.ok && decoded.value[0]?.source).toBe('custom')
  })

  it('conserve et normalise la réponse attendue d’une question perso', () => {
    const decompose = `canberra${String.fromCodePoint(0x301)}`
    const decoded = decodePuzzles(
      enveloppe([
        {
          id: 'user-5',
          answer: 'quelle est la capitale de l’australie',
          category: 'Question',
          bonusAnswer: decompose,
        },
      ]),
    )
    expect(decoded.ok && decoded.value[0]?.bonusAnswer).toBe('CANBERRÁ')
  })

  it('n’ajoute pas de `bonusAnswer` à une énigme perso qui n’en porte pas', () => {
    const decoded = decodePuzzles(
      enveloppe([{ id: 'user-6', answer: 'le vent', category: 'Nature' }]),
    )
    expect(decoded.ok && decoded.value[0] && Object.hasOwn(decoded.value[0], 'bonusAnswer')).toBe(
      false,
    )
  })

  it('refuse ce qui n’est pas un tableau', () => {
    expect(decodePuzzles(enveloppe({}))).toEqual({ ok: false, reason: 'invalid' })
  })
})

describe('fichier d’énigmes', () => {
  it('fait l’aller-retour en conservant identifiant, énoncé et catégorie', () => {
    const puzzles = [
      {
        id: asPuzzleId('user-1'),
        answer: 'LA CLÉ EST SOUS LE PAILLASSON',
        category: 'Expression',
        source: 'custom' as const,
      },
    ]
    const decoded = decodePuzzleFile(encodePuzzleFile(puzzles))
    expect(decoded).toEqual({
      ok: true,
      value: {
        entries: [{ id: 'user-1', answer: 'LA CLÉ EST SOUS LE PAILLASSON', category: 'Expression' }],
        rejected: 0,
      },
    })
  })

  it('n’exporte jamais le champ `source`', () => {
    const json = encodePuzzleFile([
      { id: asPuzzleId('user-1'), answer: 'LE VENT', category: 'Nature', source: 'custom' },
    ])
    expect(json).not.toContain('source')
  })

  it('fait l’aller-retour sur la réponse attendue d’une question', () => {
    const puzzles = [
      {
        id: asPuzzleId('user-2'),
        answer: 'QUELLE EST LA CAPITALE DE L\'AUSTRALIE',
        category: 'Question',
        source: 'custom' as const,
        bonusAnswer: 'CANBERRA',
      },
    ]
    const decoded = decodePuzzleFile(encodePuzzleFile(puzzles))
    expect(decoded.ok && decoded.value.entries[0]?.bonusAnswer).toBe('CANBERRA')
  })

  it('n’écrit aucune clé `bonusAnswer` pour une énigme ordinaire', () => {
    // Le fichier est fait pour être ouvert et corrigé à la main : une clé
    // `"bonusAnswer": null` y serait déroutante, elle doit rester absente.
    const json = encodePuzzleFile([
      { id: asPuzzleId('user-3'), answer: 'LE VENT', category: 'Nature', source: 'custom' },
    ])
    expect(json).not.toContain('bonusAnswer')
  })

  it('accepte un tableau nu écrit à la main, identifiants à `null`', () => {
    const decoded = decodePuzzleFile(
      JSON.stringify([{ answer: 'SANS IDENTIFIANT', category: 'Test' }]),
    )
    expect(decoded).toEqual({
      ok: true,
      value: { entries: [{ id: null, answer: 'SANS IDENTIFIANT', category: 'Test' }], rejected: 0 },
    })
  })

  it('refuse une version d’enveloppe inconnue', () => {
    expect(decodePuzzleFile(JSON.stringify({ version: SCHEMA_VERSION + 1, value: [] }))).toEqual({
      ok: false,
      reason: 'version',
    })
  })

  it('distingue un JSON illisible d’un JSON valide mais non exploitable', () => {
    expect(decodePuzzleFile('{ceci n’est pas du JSON')).toEqual({
      ok: false,
      reason: 'unreadable',
    })
    expect(decodePuzzleFile(JSON.stringify({ foo: 'bar' }))).toEqual({
      ok: false,
      reason: 'invalid',
    })
  })

  it('écarte une entrée sans `answer` et compte le rejet sans perdre les autres', () => {
    const decoded = decodePuzzleFile(
      JSON.stringify([
        { id: 'user-1', answer: 'VALIDE', category: 'Test' },
        { id: 'user-2', category: 'Sans énoncé' },
        'pas un objet',
      ]),
    )
    expect(decoded).toEqual({
      ok: true,
      value: {
        entries: [{ id: 'user-1', answer: 'VALIDE', category: 'Test' }],
        rejected: 2,
      },
    })
  })

  it('normalise un énoncé en forme décomposée ou avec apostrophe typographique', () => {
    const decompose = `cle${String.fromCodePoint(0x301)} d’or`
    const decoded = decodePuzzleFile(JSON.stringify([{ answer: decompose, category: 'Mot' }]))
    expect(decoded.ok && decoded.value.entries[0]?.answer).toBe('CLÉ D\'OR')
  })
})
