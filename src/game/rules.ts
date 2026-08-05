import type { GameAction } from './actions'
import {
  CONSONANTS,
  VOWELS,
  isConsonant,
  isSolved,
  isVowel,
  lettersOf,
  revealedLetters,
} from './puzzle'
import type { Consonant, Game, GameConfig, Letter, Player, RoundState, Vowel } from './types'

export { isSolved, revealedLetters }

/**
 * Sélecteurs purs partagés par l'UI, le bot et le reducer.
 *
 * Un reducer qui « rejette avec un retour visuel » ne fonctionne pas : renvoyer
 * la même référence fait bailer `useReducer`, donc aucun rendu, donc aucun
 * retour. Les actions illégales doivent être **indispatchables**, ce qui exige
 * que les prédicats vivent ici et non dans le reducer.
 */

/** Manche 0 → ×1, manche 1 → ×2, manche 2 → ×3. */
export function multiplierFor(roundIndex: number): number {
  return roundIndex + 1
}

/** La manche en cours, ou `null` si la partie est entre deux manches ou finie. */
export function activeRound(game: Game): RoundState | null {
  return game.progress.kind === 'round' ? game.progress.round : null
}

/** Lettres jamais proposées : le joueur ne sait pas si elles sont dans l'énigme. */
export function remainingConsonants(round: RoundState): readonly Consonant[] {
  return CONSONANTS.filter((letter) => !round.guessed.includes(letter))
}

export function remainingVowels(round: RoundState): readonly Vowel[] {
  return VOWELS.filter((letter) => !round.guessed.includes(letter))
}

/** Part des lettres distinctes déjà révélées, dans `[0, 1]`. */
export function progressRatio(round: RoundState): number {
  const total = lettersOf(round.puzzle.answer).size
  if (total === 0) return 1
  return revealedLetters(round).size / total
}

/** Lève sur invariant violé : « à qui le tour » n'existe que pendant une manche. */
export function currentPlayerOf(game: Game): Player {
  if (game.progress.kind !== 'round') {
    throw new Error(`Aucun joueur courant hors d'une manche (progress : ${game.progress.kind})`)
  }
  const player = game.players[game.progress.currentPlayer]
  if (player === undefined) {
    throw new Error(`Index de joueur courant hors bornes : ${game.progress.currentPlayer}`)
  }
  return player
}

/**
 * Les trois prédicats ci-dessous raisonnent « comme si » la phase était
 * `awaiting-action` : ils servent aussi à décider **à qui donner la main**,
 * décision prise avant que la phase du destinataire n'existe.
 */
function couldSpin(round: RoundState): boolean {
  return remainingConsonants(round).length > 0
}

function couldBuyVowel(config: GameConfig, round: RoundState, player: Player): boolean {
  return player.pot >= config.vowelCost && remainingVowels(round).length > 0
}

/**
 * Vrai si ce joueur aurait au moins une action légale en début de tour. Le
 * reducer s'en sert pour chaque joueur, pas seulement le courant : c'est ce qui
 * distingue « ce joueur est bloqué » de « la manche est ingagnable ».
 */
export function canPlayerAct(config: GameConfig, round: RoundState, player: Player): boolean {
  return couldSpin(round) || couldBuyVowel(config, round, player) || config.resolveEnabled
}

function awaiting(game: Game): RoundState | null {
  const round = activeRound(game)
  return round !== null && round.phase.kind === 'awaiting-action' ? round : null
}

/** Faux dès qu'il ne reste aucune consonne : on n'entre jamais en `awaiting-consonant` sans issue. */
export function canSpin(game: Game): boolean {
  const round = awaiting(game)
  return round !== null && couldSpin(round)
}

export function canBuyVowel(game: Game): boolean {
  const round = awaiting(game)
  if (round === null) return false
  return couldBuyVowel(game.config, round, currentPlayerOf(game))
}

export function canResolve(game: Game): boolean {
  return game.config.resolveEnabled && awaiting(game) !== null
}

export function canGuess(game: Game, letter: Letter): boolean {
  const round = activeRound(game)
  if (round === null || round.guessed.includes(letter)) return false
  if (round.phase.kind === 'awaiting-consonant') return isConsonant(letter)
  if (round.phase.kind === 'awaiting-action') return isVowel(letter) && canBuyVowel(game)
  return false
}

/** Le joueur courant n'a plus rien à jouer : `turn/pass` devient sa seule sortie. */
export function isStuck(game: Game): boolean {
  return awaiting(game) !== null && !canSpin(game) && !canBuyVowel(game) && !canResolve(game)
}

/**
 * Actions réellement dispatchables. `config/set-resolve-enabled` n'y figure
 * pas : c'est un réglage, pas un coup — l'inclure ferait dériver le fuzz vers
 * des changements de règles au lieu de jouer.
 */
export function legalActions(game: Game): readonly GameAction['type'][] {
  const progress = game.progress
  if (progress.kind === 'game-over') return []
  if (progress.kind === 'round-over') return ['round/next']

  switch (progress.round.phase.kind) {
    case 'spinning':
      return ['wheel/settled']
    case 'awaiting-consonant':
      return ['letter/consonant']
    case 'resolving':
      return ['resolve/verdict', 'resolve/failed']
    case 'blocked':
      return ['round/next']
    case 'awaiting-action': {
      const actions: GameAction['type'][] = []
      if (canSpin(game)) actions.push('wheel/spin')
      if (canBuyVowel(game)) actions.push('letter/buy-vowel')
      if (canResolve(game)) actions.push('resolve/start')
      if (isStuck(game)) actions.push('turn/pass')
      return actions
    }
  }
}

export function keyState(game: Game, letter: Letter): 'available' | 'used' | 'locked' {
  const round = activeRound(game)
  if (round !== null && round.guessed.includes(letter)) return 'used'
  return canGuess(game, letter) ? 'available' : 'locked'
}
