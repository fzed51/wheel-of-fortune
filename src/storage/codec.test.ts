import { describe, expect, it } from 'vitest'
import { cash, demarrer, jeu, partieTerminee, proposer, tourner } from '../test/game'
import { decodeGame, decodePuzzles, decodeRecord, decodeSettings, encodeRecord } from './codec'
import { DEFAULT_SETTINGS } from './settings'
import { toPersisted } from './snapshot'

/**
 * Enveloppe écrite à la main, version en littéral : si le format du fil change,
 * ces tests doivent le dire, pas s'adapter en silence à la nouvelle constante.
 */
function enveloppe(value: unknown): string {
  return JSON.stringify({ version: 1, value })
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
    expect(decodeRecord(JSON.stringify({ version: 2, value: {} }))).toEqual({
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
    ['manche au-delà du compte', (g) => (g.progress.round.index = 3)],
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
