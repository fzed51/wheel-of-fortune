import { describe, expect, it } from 'vitest'
import { asPuzzleId } from '../game/types'
import { cash, demarrer, jeu, partieTerminee, proposer, tourner } from '../test/game'
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
import { toPersisted } from './snapshot'

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
