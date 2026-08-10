import { isLetter, lettersOf, normalizeAnswer } from '../game/puzzle'
import type {
  BonusResult,
  GameConfig,
  Letter,
  Player,
  Puzzle,
  RoundSummary,
  Segment,
} from '../game/types'
import { asPuzzleId } from '../game/types'
import { SEGMENT_COUNT } from '../game/wheel'
import { SCHEMA_VERSION } from './keys'
import type { PersistedBonus, PersistedGame, PersistedPhase, PersistedRound } from './snapshot'
import {
  BOT_LEVELS,
  DEFAULT_SETTINGS,
  MAX_OPPONENTS,
  MAX_ROUND_COUNT,
  THEMES,
  type BotLevel,
  type Settings,
  type Theme,
} from './settings'

/**
 * Validation à la frontière : « typé » n'est pas « validé ».
 *
 * Un `localStorage` bricolé à la main, une entrée écrite par une version
 * antérieure ou une donnée tronquée produisent un objet qui satisfait le
 * compilateur et fait tomber le premier `switch` exhaustif du reducer dans son
 * `default`. D'où des type guards écrits à la main — aucune dépendance ajoutée
 * pour quatre enregistrements — et un résultat explicite plutôt qu'une exception.
 */
export type DecodeFailure = 'absent' | 'unreadable' | 'invalid' | 'version'

export type Decoded<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: DecodeFailure }

function fail<T>(reason: DecodeFailure): Decoded<T> {
  return { ok: false, reason }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** Entier positif ou nul : tous les nombres du modèle en sont, aucun n'est fractionnaire. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isArrayOf<T>(value: unknown, guard: (item: unknown) => item is T): value is readonly T[] {
  return Array.isArray(value) && value.every(guard)
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
}

/**
 * L'index doit rester dans la roue courante : `segmentAt` lève au-delà, et une
 * sauvegarde écrite avant un changement de disposition pointerait dans le vide.
 */
function isSegment(value: unknown): value is Segment {
  if (!isRecord(value)) return false
  if (!isCount(value.index) || value.index >= SEGMENT_COUNT) return false
  if (value.kind === 'cash') return isCount(value.value)
  return value.kind === 'bankrupt' || value.kind === 'pass'
}

/**
 * L'énoncé doit être déjà normalisé et contenir au moins une lettre : sinon la
 * grille et `isSolved` divergent, et la manche est soit illisible soit gagnée
 * d'avance.
 */
function isPuzzle(value: unknown): value is Puzzle {
  if (!isRecord(value)) return false
  if (!isText(value.id) || !isText(value.answer) || typeof value.category !== 'string') return false
  if (value.source !== 'pack' && value.source !== 'custom') return false
  if (value.answer !== normalizeAnswer(value.answer)) return false
  if (value.bonusAnswer !== undefined && typeof value.bonusAnswer !== 'string') return false
  return lettersOf(value.answer).size > 0
}

function isPlayerKind(value: unknown): boolean {
  if (!isRecord(value)) return false
  if (value.type === 'human') return true
  return value.type === 'bot' && isOneOf(value.level, BOT_LEVELS)
}

function isPlayer(value: unknown): value is Player {
  if (!isRecord(value)) return false
  return (
    isText(value.id) &&
    isText(value.name) &&
    isPlayerKind(value.kind) &&
    isCount(value.total) &&
    isCount(value.pot)
  )
}

function isConfig(value: unknown): value is GameConfig {
  if (!isRecord(value)) return false
  return (
    isCount(value.roundCount) &&
    value.roundCount >= 1 &&
    isCount(value.vowelCost) &&
    isCount(value.minRoundPrize) &&
    typeof value.bonusPrize === 'number' &&
    typeof value.bonusEnabled === 'boolean'
  )
}

/** Un doublon dans `guessed` fausserait chaque compte de lettres restantes. */
function isGuessed(value: unknown): value is readonly Letter[] {
  const letters = (item: unknown): item is Letter => typeof item === 'string' && isLetter(item)
  if (!isArrayOf(value, letters)) return false
  return new Set(value).size === value.length
}

function isPersistedPhase(value: unknown): value is PersistedPhase {
  if (!isRecord(value)) return false
  if (value.kind === 'awaiting-action' || value.kind === 'blocked') return true
  if (value.kind !== 'awaiting-consonant') return false
  return isCount(value.value) && isSegment(value.segment)
}

function isPersistedRound(value: unknown): value is PersistedRound {
  if (!isRecord(value)) return false
  return (
    isCount(value.index) &&
    isPuzzle(value.puzzle) &&
    isGuessed(value.guessed) &&
    isPersistedPhase(value.phase) &&
    isCount(value.passes)
  )
}

/** `question` porte déjà sa propre validation via `isPuzzle` : une question sans réponse serait injouable. */
function isPersistedBonus(value: unknown, playerIds: ReadonlySet<string>): value is PersistedBonus {
  if (!isRecord(value)) return false
  return (
    isText(value.by) && playerIds.has(value.by) && isPuzzle(value.question) && isText(value.expected)
  )
}

/** `amount` forfaitaire, jamais nul ni négatif : un gain à zéro n'aurait pas de sens pour `won`. */
function isBonusOutcome(value: unknown): value is BonusResult['outcome'] {
  if (!isRecord(value)) return false
  if (value.kind === 'lost' || value.kind === 'skipped') return true
  if (value.kind !== 'won') return false
  return isCount(value.amount) && value.amount > 0
}

function isPersistedBonusResult(value: unknown, playerIds: ReadonlySet<string>): value is BonusResult {
  if (!isRecord(value)) return false
  return (
    isPuzzle(value.question) &&
    isText(value.expected) &&
    isText(value.by) &&
    playerIds.has(value.by) &&
    isBonusOutcome(value.outcome)
  )
}

function isSummary(value: unknown): value is RoundSummary {
  if (!isRecord(value)) return false
  if (!isCount(value.index) || !isPuzzle(value.puzzle)) return false
  const outcome = value.outcome
  if (!isRecord(outcome)) return false
  if (outcome.kind === 'void') return outcome.reason === 'blocked'
  if (outcome.kind !== 'solved') return false
  return (
    isText(outcome.by) &&
    isCount(outcome.amount) &&
    (outcome.how === 'last-letter' || outcome.how === 'resolve')
  )
}

/**
 * Contrôles croisés en plus de la forme. Ils tiennent lieu d'invariants du
 * moteur : le siège courant existe, et `history` compte exactement une entrée par
 * manche déjà jouée. Une sauvegarde qui les viole n'est pas rattrapable, autant
 * la jeter que faire dérailler l'affichage des scores.
 */
function isPersistedGame(value: unknown): value is PersistedGame {
  if (!isRecord(value)) return false

  const config = value.config
  const players = value.players
  const history = value.history
  const progress = value.progress

  if (!isConfig(config)) return false
  if (!isArrayOf(players, isPlayer) || players.length === 0) return false
  if (!isArrayOf(history, isSummary)) return false
  if (!isArrayOf(value.playedPuzzleIds, isText)) return false
  if (!isRecord(progress)) return false

  const ids = new Set<string>(players.map((player) => player.id))

  if (progress.kind === 'round') {
    const round = progress.round
    if (!isCount(progress.currentPlayer) || progress.currentPlayer >= players.length) return false
    if (!isPersistedRound(round)) return false
    return round.index < config.roundCount && history.length === round.index
  }

  if (progress.kind === 'round-over') {
    const summary = progress.summary
    if (!isSummary(summary)) return false
    return summary.index < config.roundCount && history.length === summary.index
  }

  if (progress.kind === 'bonus') {
    // Le résumé de la manche finale a déjà été poussé dans `history` (voir
    // `round/next` du reducer), avant l'entrée dans l'étape : `roundCount`
    // exact, jamais `roundCount - 1`.
    return isPersistedBonus(progress.bonus, ids) && history.length === config.roundCount
  }

  if (progress.kind === 'game-over') {
    const winners = progress.winners
    if (!isArrayOf(winners, isText)) return false
    if (winners.some((winner) => !ids.has(winner))) return false
    if (history.length !== config.roundCount) return false
    return progress.bonus === null || isPersistedBonusResult(progress.bonus, ids)
  }

  return false
}

interface Envelope {
  readonly version: number
  readonly value: unknown
}

export function encodeRecord(value: unknown): string {
  const envelope: Envelope = { version: SCHEMA_VERSION, value }
  return JSON.stringify(envelope)
}

/** Ouvre l'enveloppe et contrôle la version, sans rien dire du contenu. */
export function decodeRecord(raw: string): Decoded<unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail('unreadable')
  }
  if (!isRecord(parsed)) return fail('invalid')
  if (parsed.version !== SCHEMA_VERSION) return fail('version')
  return { ok: true, value: parsed.value }
}

export function decodeGame(raw: string): Decoded<PersistedGame> {
  const record = decodeRecord(raw)
  if (!record.ok) return record
  if (!isPersistedGame(record.value)) return fail('invalid')
  return { ok: true, value: record.value }
}

/**
 * Réglages **tolérants**, champ par champ : une valeur inconnue ou hors bornes
 * retombe sur son défaut au lieu de faire perdre les autres. Un utilisateur ne
 * doit pas perdre son thème parce qu'un réglage ajouté depuis manque à l'appel.
 */
export function decodeSettings(raw: string): Decoded<Settings> {
  const record = decodeRecord(raw)
  if (!record.ok) return record
  const stored = record.value
  if (!isRecord(stored)) return fail('invalid')

  const theme: Theme = isOneOf(stored.theme, THEMES) ? stored.theme : DEFAULT_SETTINGS.theme
  const botLevel: BotLevel = isOneOf(stored.botLevel, BOT_LEVELS)
    ? stored.botLevel
    : DEFAULT_SETTINGS.botLevel
  const roundCount =
    isCount(stored.roundCount) && stored.roundCount >= 1 && stored.roundCount <= MAX_ROUND_COUNT
      ? stored.roundCount
      : DEFAULT_SETTINGS.roundCount
  const opponents =
    isCount(stored.opponents) && stored.opponents <= MAX_OPPONENTS
      ? stored.opponents
      : DEFAULT_SETTINGS.opponents

  return {
    ok: true,
    value: {
      theme,
      mistralModel: isText(stored.mistralModel)
        ? stored.mistralModel
        : DEFAULT_SETTINGS.mistralModel,
      roundCount,
      opponents,
      botLevel,
    },
  }
}

/**
 * Énigmes perso : les entrées valides sont conservées, les autres écartées. Tout
 * jeter parce qu'une seule est cassée coûterait à l'utilisateur le seul contenu
 * qu'il ait écrit lui-même. L'énoncé est normalisé **avant** contrôle, pour qu'un
 * import JSON écrit à la main passe sans être rejeté sur un accent décomposé.
 *
 * `bonusAnswer` suit la même normalisation, et **absent plutôt que vide** quand
 * l'entrée n'en porte pas : une clé posée à `undefined` ou à `''` par défaut
 * ferait perdre sa réponse attendue à une question perso sans que rien ne
 * l'annonce — la manche finale redeviendrait une énigme ordinaire au rechargement.
 */
export function decodePuzzles(raw: string): Decoded<readonly Puzzle[]> {
  const record = decodeRecord(raw)
  if (!record.ok) return record
  if (!Array.isArray(record.value)) return fail('invalid')

  const puzzles: Puzzle[] = []
  for (const entry of record.value) {
    if (!isRecord(entry) || !isText(entry.id) || typeof entry.answer !== 'string') continue
    const bonusAnswer =
      typeof entry.bonusAnswer === 'string' ? normalizeAnswer(entry.bonusAnswer) : undefined
    const base = {
      id: asPuzzleId(entry.id),
      answer: normalizeAnswer(entry.answer),
      category: typeof entry.category === 'string' ? entry.category : '',
      source: 'custom' as const,
    }
    const candidate = bonusAnswer === undefined ? base : { ...base, bonusAnswer }
    if (isPuzzle(candidate)) puzzles.push(candidate)
  }
  return { ok: true, value: puzzles }
}

/** Énigme telle qu'elle sort d'un fichier : l'identifiant peut manquer, la fusion s'en chargera. */
export interface ImportedPuzzle {
  readonly id: string | null
  readonly answer: string
  readonly category: string
  /** Réponse attendue de la question bonus. Absent : l'énigme est ordinaire. */
  readonly bonusAnswer?: string
}

export interface PuzzleFile {
  readonly entries: readonly ImportedPuzzle[]
  /** Entrées écartées faute de forme exploitable. Sert au compte rendu d'import. */
  readonly rejected: number
}

/**
 * Fichier d'export/import des énigmes perso : le seul filet de sécurité du
 * projet en l'absence de backend. Ne transporte que `id`, `answer`,
 * `category` et `bonusAnswer` — surtout pas `source` (tout ce qui est importé
 * est perso par construction), et surtout jamais la clé d'API Mistral, qui vit
 * dans sa propre entrée de stockage précisément pour qu'aucun objet exportable
 * ne la contienne. Indenté, contrairement à `encodeRecord` : ce fichier est
 * destiné à être ouvert et corrigé à la main.
 *
 * `bonusAnswer` n'apparaît dans l'entrée que si l'énigme la porte : une clé
 * `"bonusAnswer": null` ou une clé vide serait déroutante dans un fichier
 * pensé pour être relu et corrigé à l'œil.
 */
export function encodePuzzleFile(puzzles: readonly Puzzle[]): string {
  const entries: ImportedPuzzle[] = puzzles.map((puzzle) => {
    const base = { id: puzzle.id, answer: puzzle.answer, category: puzzle.category }
    return puzzle.bonusAnswer === undefined ? base : { ...base, bonusAnswer: puzzle.bonusAnswer }
  })
  const envelope: Envelope = { version: SCHEMA_VERSION, value: entries }
  return JSON.stringify(envelope, null, 2)
}

/**
 * Forme seulement : un `answer` texte non vide, normalisé pour qu'un fichier
 * écrit à la main (accents décomposés, apostrophe typographique) passe sans
 * être rejeté. La jouabilité (longueur, nombre de consonnes, doublons) est
 * une règle de jeu qui vit ailleurs — la dupliquer ici créerait deux sources
 * de vérité pour la même question.
 */
function toImportedPuzzle(entry: unknown): ImportedPuzzle | null {
  if (!isRecord(entry) || !isText(entry.answer)) return null
  const base = {
    id: isText(entry.id) ? entry.id : null,
    answer: normalizeAnswer(entry.answer),
    category: typeof entry.category === 'string' ? entry.category : '',
  }
  return typeof entry.bonusAnswer === 'string'
    ? { ...base, bonusAnswer: normalizeAnswer(entry.bonusAnswer) }
    : base
}

/**
 * Tolère deux formes : l'enveloppe versionnée produite par `encodePuzzleFile`,
 * et un tableau nu écrit à la main. Le tableau nu ne porte pas de version :
 * le refuser faute de champ `version` serait hostile envers la seule
 * sauvegarde dont dispose l'utilisateur pour ses énigmes perso.
 */
export function decodePuzzleFile(raw: string): Decoded<PuzzleFile> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return fail('unreadable')
  }

  let list: readonly unknown[]
  if (Array.isArray(parsed)) {
    list = parsed
  } else if (isRecord(parsed) && 'version' in parsed) {
    if (parsed.version !== SCHEMA_VERSION) return fail('version')
    if (!Array.isArray(parsed.value)) return fail('invalid')
    list = parsed.value
  } else {
    return fail('invalid')
  }

  const entries: ImportedPuzzle[] = []
  let rejected = 0
  for (const item of list) {
    const entry = toImportedPuzzle(item)
    if (entry !== null) entries.push(entry)
    else rejected += 1
  }
  return { ok: true, value: { entries, rejected } }
}
