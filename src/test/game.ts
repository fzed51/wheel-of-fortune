import type { GameAction } from '../game/actions'
import { initialState, reduce } from '../game/engine'
import { normalizeAnswer } from '../game/puzzle'
import { currentPlayerOf } from '../game/rules'
import type {
  BonusState,
  Consonant,
  Game,
  GameConfig,
  GameState,
  Letter,
  Phase,
  PlayerId,
  Player,
  Puzzle,
  RoundState,
  Segment,
  Vowel,
} from '../game/types'
import { asPlayerId, asPuzzleId } from '../game/types'
import { MIN_TRAVEL_DEGREES, WHEEL, angleForLanding, normalizeDegrees } from '../game/wheel'

/**
 * Fixtures du moteur. Elles ne servent qu'aux tests : les garder hors de
 * `src/game` évite qu'un composant ne s'en serve par accident.
 */

/**
 * `minRoundPrize` volontairement plus bas que les gains courants, pour que les
 * tests distinguent les deux. `bonusEnabled: true` par défaut : les tests du
 * cas « sans clé » passent `config: { bonusEnabled: false }`.
 */
export const CONFIG: GameConfig = {
  roundCount: 3,
  vowelCost: 250,
  minRoundPrize: 500,
  bonusPrize: 500,
  bonusEnabled: true,
}

export function joueur(name: string, patch: Partial<Player> = {}): Player {
  return {
    id: asPlayerId(name.toLowerCase()),
    name,
    kind: { type: 'human' },
    total: 0,
    pot: 0,
    ...patch,
  }
}

/** Raccourci vers un joueur bot, pour les tests du tour de bot et des vagues suivantes. */
export function bot(name: string, level: 'easy' | 'normal' = 'normal'): Player {
  return joueur(name, { kind: { type: 'bot', level } })
}

export function enigme(answer: string, id = answer): Puzzle {
  return {
    id: asPuzzleId(id),
    answer: normalizeAnswer(answer),
    category: 'Test',
    source: 'pack',
  }
}

/**
 * Énigme-question : même énoncé qu'une énigme ordinaire, plus la réponse
 * attendue de l'étape bonus. La catégorie reste `Test` — c'est `bonusAnswer`
 * qui fait la question aux yeux d'`isQuestion`, jamais le libellé de la
 * catégorie, et une fixture qui prétendrait le contraire masquerait cette règle.
 */
export function question(answer: string, expected: string, id = answer): Puzzle {
  return { ...enigme(answer, id), bonusAnswer: expected }
}

export interface OptionsPartie {
  readonly answer?: string
  /** Présent : l'énigme de départ est une question. Absent : une énigme ordinaire. */
  readonly bonusAnswer?: string
  readonly players?: readonly Player[]
  readonly config?: Partial<GameConfig>
  readonly firstPlayer?: number
}

export function demarrer(options: OptionsPartie = {}): GameState {
  const answer = options.answer ?? 'le vent'
  return reduce(initialState, {
    type: 'game/start',
    config: { ...CONFIG, ...options.config },
    players: options.players ?? [joueur('Alice'), joueur('Bob')],
    puzzle:
      options.bonusAnswer === undefined
        ? enigme(answer)
        : question(answer, options.bonusAnswer),
    firstPlayer: options.firstPlayer ?? 0,
  })
}

export function jeu(state: GameState): Game {
  if (state.kind !== 'playing') throw new Error('Aucune partie en cours')
  return state.game
}

export function manche(state: GameState): RoundState {
  const game = jeu(state)
  if (game.progress.kind !== 'round') {
    throw new Error(`Aucune manche en cours (progress : ${game.progress.kind})`)
  }
  return game.progress.round
}

export function bonus(state: GameState): BonusState {
  const game = jeu(state)
  if (game.progress.kind !== 'bonus') {
    throw new Error(`Aucune étape bonus en cours (progress : ${game.progress.kind})`)
  }
  return game.progress.bonus
}

export function courant(state: GameState): Player {
  return currentPlayerOf(jeu(state))
}

export function joueurNomme(state: GameState, name: string): Player {
  const player = jeu(state).players.find((candidate) => candidate.name === name)
  if (player === undefined) throw new Error(`Joueur absent : ${name}`)
  return player
}

/** Enchaîne des actions littérales : c'est la brique du scénario scripté. */
export function jouer(state: GameState, ...actions: readonly GameAction[]): GameState {
  return actions.reduce<GameState>((current, action) => reduce(current, action), state)
}

function indexOf(match: (segment: Segment) => boolean): number {
  const index = WHEEL.findIndex(match)
  if (index < 0) throw new Error('Aucun segment ne correspond')
  return index
}

/** Index du premier segment payant de cette valeur : plus lisible qu'un index nu. */
export function cash(value: number): number {
  return indexOf((segment) => segment.kind === 'cash' && segment.value === value)
}

export const BANQUEROUTE = indexOf((segment) => segment.kind === 'bankrupt')
export const PASSE = indexOf((segment) => segment.kind === 'pass')
/** Le seul segment `cash` de valeur nulle : sert à vérifier que la main reste au joueur sans rien lui rapporter. */
export const CASH_ZERO = indexOf((segment) => segment.kind === 'cash' && segment.value === 0)

/**
 * Distance à parcourir depuis `fromAngle` pour que l'aiguille tombe sur `index`.
 * Inverse de `resolveThrow` : c'est ce qui permet à un test de continuer à nommer
 * la case qu'il veut, alors que le moteur ne la reçoit plus.
 */
export function travelToLand(fromAngle: number, index: number, offset = 0): number {
  return normalizeDegrees(angleForLanding(index, offset) - fromAngle) + MIN_TRAVEL_DEGREES
}

/**
 * Action `wheel/spin` calibrée pour atterrir sur `index`. `offset` est rabattu par
 * `resolveThrow` à ±5,5° (`OFFSET_BOUND`) : au-delà, la case atteinte ne serait plus
 * celle demandée.
 */
export function lancer(game: Game, by: PlayerId, index: number, spinId = 1, offset = 0): GameAction {
  return {
    type: 'wheel/spin',
    by,
    thrown: { spinId, travel: travelToLand(game.wheelAngle, index, offset), durationMs: 3000 },
  }
}

/** Tirage complet : `wheel/spin` puis `wheel/settled`, par le joueur courant. */
export function tourner(state: GameState, index: number, spinId = 1): GameState {
  const by = courant(state).id
  return jouer(
    state,
    lancer(jeu(state), by, index, spinId),
    { type: 'wheel/settled', by, spinId },
  )
}

export function proposer(state: GameState, letter: Consonant): GameState {
  return jouer(state, { type: 'letter/consonant', by: courant(state).id, letter })
}

export function acheter(state: GameState, letter: Vowel): GameState {
  return jouer(state, { type: 'letter/buy-vowel', by: courant(state).id, letter })
}

/**
 * Tentative de résolution du joueur courant. `attempt` par défaut reprend
 * l'énigme de la manche en cours : c'est le raccourci le plus utile pour un
 * scénario « le joueur trouve », l'appelant passe une chaîne différente pour
 * simuler une réponse fausse.
 */
export function resoudre(state: GameState, attempt: string): GameState {
  return jouer(state, { type: 'resolve/attempt', by: courant(state).id, attempt })
}

/** Répond à l'étape bonus au nom de son joueur : `bonus(state).by`, jamais le joueur courant. */
export function repondre(state: GameState, attempt: string, requestId = 'req-1'): GameState {
  return jouer(state, { type: 'bonus/answer', by: bonus(state).by, attempt, requestId })
}

/** Partie menée jusqu'à `game-over` : chaque manche gagnée par résolution. */
export function partieTerminee(state: GameState = demarrer()): GameState {
  let current = state
  for (let round = 0; round < jeu(current).config.roundCount; round += 1) {
    current = resoudre(current, manche(current).puzzle.answer)
    current = jouer(current, {
      type: 'round/next',
      puzzle: enigme('la mer', `suite-${round}`),
      firstPlayer: 0,
    })
  }
  return current
}

/**
 * Raccourcis vers des états limites. Ils fabriquent des états que le reducer
 * n'aurait pas forcément produits, ce qui est légitime pour éprouver des
 * prédicats purs sans écrire quarante actions.
 */
export function avecManche(state: GameState, patch: Partial<RoundState>): GameState {
  const game = jeu(state)
  if (game.progress.kind !== 'round') throw new Error('Aucune manche en cours')
  return {
    kind: 'playing',
    game: {
      ...game,
      progress: { ...game.progress, round: { ...game.progress.round, ...patch } },
    },
  }
}

export function avecPhase(state: GameState, phase: Phase): GameState {
  return avecManche(state, { phase })
}

export function avecLettres(state: GameState, guessed: readonly Letter[]): GameState {
  return avecManche(state, { guessed })
}

export function avecPot(state: GameState, seat: number, pot: number): GameState {
  const game = jeu(state)
  return {
    kind: 'playing',
    game: {
      ...game,
      players: game.players.map((player, index) => (index === seat ? { ...player, pot } : player)),
    },
  }
}
