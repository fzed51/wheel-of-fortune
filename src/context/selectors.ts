import { createContext, useContext } from 'react'
import type { GameAction } from '../game/actions'
import type { Setup } from '../game/setup'
import type { Game, GameState, Phase, Player, RoundState } from '../game/types'

/**
 * Contextes et sélecteurs de la partie.
 *
 * Deux contextes plutôt qu'un `{ state, dispatch }` : l'état change à chaque coup,
 * les commandes jamais. Un contexte unique rerendrait tous les consommateurs à
 * chaque tick, et le React Compiler mémoïse les props, pas la propagation de
 * contexte.
 *
 * Les sélecteurs rendent `null` hors manche au lieu de lever : un composant de
 * plateau peut être rendu une fraction de rendu après la fin de la manche, et lever
 * ferait tomber l'écran là où l'affichage n'a qu'à disparaître. `currentPlayerOf`
 * de `game/rules.ts` lève, lui, parce que le moteur y viole un invariant.
 */
export const GameStateContext = createContext<GameState | null>(null)

/**
 * Les commandes vivent dans le provider et pas dans les composants parce qu'elles
 * ont besoin des sources d'impureté du projet — l'aléa, le tirage d'énigme, le
 * compteur de rotation — qui y sont concentrées. Un composant qui tirerait son
 * propre aléa casserait le déterminisme des tests.
 */
export interface GameCommands {
  /** Démarre une partie neuve. `setup` surcharge les réglages, pour un bouton qui décide sur place. */
  readonly startGame: (setup?: Partial<Setup>) => void
  /** Enchaîne la manche suivante, avec une énigme jamais jouée dans cette partie. */
  readonly nextRound: () => void
  /** Lance la roue : tire le segment ici, l'animation ne fera que l'exécuter. */
  readonly spin: () => void
  /** Sortie de secours pour les actions qui n'ont besoin d'aucune impureté. */
  readonly dispatch: (action: GameAction) => void
}

export const GameCommandsContext = createContext<GameCommands | null>(null)

export function useGameState(): GameState {
  const state = useContext(GameStateContext)
  if (state === null) throw new Error('useGameState hors de GameProvider')
  return state
}

export function useGameCommands(): GameCommands {
  const commands = useContext(GameCommandsContext)
  if (commands === null) throw new Error('useGameCommands hors de GameProvider')
  return commands
}

/** La partie en cours, ou `null` si aucune n'est lancée. */
export function useGame(): Game | null {
  const state = useGameState()
  return state.kind === 'playing' ? state.game : null
}

export function useRound(): RoundState | null {
  const game = useGame()
  return game !== null && game.progress.kind === 'round' ? game.progress.round : null
}

export function usePhase(): Phase | null {
  return useRound()?.phase ?? null
}

export function useCurrentPlayer(): Player | null {
  const game = useGame()
  if (game === null || game.progress.kind !== 'round') return null
  return game.players[game.progress.currentPlayer] ?? null
}
