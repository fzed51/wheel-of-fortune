import type { GameAction } from '../game/actions'
import { initialState, reduce } from '../game/engine'
import { normalizeAnswer } from '../game/puzzle'
import { currentPlayerOf } from '../game/rules'
import type {
  Consonant,
  Game,
  GameConfig,
  GameState,
  Letter,
  Phase,
  Player,
  Puzzle,
  RoundState,
  Segment,
  Vowel,
} from '../game/types'
import { asPlayerId, asPuzzleId } from '../game/types'
import { WHEEL } from '../game/wheel'

/**
 * Fixtures du moteur. Elles ne servent qu'aux tests : les garder hors de
 * `src/game` évite qu'un composant ne s'en serve par accident.
 */

/** `minRoundPrize` volontairement plus bas que les gains courants, pour que les tests distinguent les deux. */
export const CONFIG: GameConfig = {
  roundCount: 3,
  vowelCost: 250,
  minRoundPrize: 500,
  bonusPrize: 500,
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

export interface OptionsPartie {
  readonly answer?: string
  readonly players?: readonly Player[]
  readonly config?: Partial<GameConfig>
  readonly firstPlayer?: number
}

export function demarrer(options: OptionsPartie = {}): GameState {
  return reduce(initialState, {
    type: 'game/start',
    config: { ...CONFIG, ...options.config },
    players: options.players ?? [joueur('Alice'), joueur('Bob')],
    puzzle: enigme(options.answer ?? 'le vent'),
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

/** Tirage complet : `wheel/spin` puis `wheel/settled`, par le joueur courant. */
export function tourner(state: GameState, index: number, spinId = 1): GameState {
  const by = courant(state).id
  return jouer(
    state,
    { type: 'wheel/spin', by, spin: { index, offset: 0, spinId } },
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
