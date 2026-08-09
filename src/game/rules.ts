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
 * Vrai si une manche est en cours et que le joueur courant est un bot. Sert à
 * l'interface et aux commandes du provider, croisé avec `canSpin`, `canResolve`
 * et `isStuck`, pour interdire à l'humain de jouer à la place d'un bot.
 * Volontairement séparé de ces prédicats : ils servent aussi au bot lui-même
 * et au fuzz via `legalActions`, et y intégrer « c'est au tour d'un humain »
 * rendrait le bot incapable d'agir.
 */
export function isBotTurn(game: Game): boolean {
  const round = activeRound(game)
  return round !== null && currentPlayerOf(game).kind.type === 'bot'
}

/**
 * Les deux prédicats ci-dessous raisonnent « comme si » la phase était
 * `awaiting-action` : ils servent aussi à décider **à qui donner la main**,
 * décision prise avant que la phase du destinataire n'existe.
 */
function couldSpin(round: RoundState): boolean {
  return remainingConsonants(round).length > 0
}

function couldBuyVowel(config: GameConfig, round: RoundState, player: Player): boolean {
  return player.pot >= config.vowelCost && remainingVowels(round).length > 0
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

export function canGuess(game: Game, letter: Letter): boolean {
  const round = activeRound(game)
  if (round === null || round.guessed.includes(letter)) return false
  if (round.phase.kind === 'awaiting-consonant') return isConsonant(letter)
  if (round.phase.kind === 'awaiting-action') return isVowel(letter) && canBuyVowel(game)
  return false
}

/**
 * `canResolve` en est volontairement absent : l'inclure rendrait « Passer la
 * main » définitivement indispatchable, puisque proposer la réponse est
 * désormais toujours légal.
 */
export function isStuck(game: Game): boolean {
  return awaiting(game) !== null && !canSpin(game) && !canBuyVowel(game)
}

/** Toujours légal en `awaiting-action` : comparer deux chaînes ne dépend de rien. */
export function canResolve(game: Game): boolean {
  return awaiting(game) !== null
}

/** Actions réellement dispatchables. */
export function legalActions(game: Game): readonly GameAction['type'][] {
  const progress = game.progress
  if (progress.kind === 'game-over') return []
  if (progress.kind === 'round-over') return ['round/next']

  switch (progress.round.phase.kind) {
    case 'spinning':
      return ['wheel/settled']
    case 'awaiting-consonant':
      return ['letter/consonant']
    case 'blocked':
      return ['round/next']
    case 'awaiting-action': {
      const actions: GameAction['type'][] = []
      if (canSpin(game)) actions.push('wheel/spin')
      if (canBuyVowel(game)) actions.push('letter/buy-vowel')
      if (canResolve(game)) actions.push('resolve/attempt')
      if (isStuck(game)) actions.push('turn/pass')
      return actions
    }
  }
}

export function keyState(game: Game, letter: Letter): 'available' | 'used' | 'locked' {
  const round = activeRound(game)
  // Une lettre déjà proposée reste « used » même pendant le tour d'un bot :
  // elle porte l'information « celle-là est sortie », qui vaut pour tous.
  if (round !== null && round.guessed.includes(letter)) return 'used'
  if (!canGuess(game, letter)) return 'locked'
  return isBotTurn(game) ? 'locked' : 'available'
}
