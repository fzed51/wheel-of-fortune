import { createContext, useContext } from 'react'
import type { GameAction } from '../game/actions'
import type { JudgeErrorReason } from '../llm/judge'
import type { Setup } from '../game/setup'
import type { BonusState, Game, GameState, Letter, Phase, Player, RoundState } from '../game/types'

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
  /** Clôt la rotation en cours : appelée par l'animation de la roue quand elle atteint le segment. */
  readonly settleSpin: () => void
  /** Joue une lettre : consonne devinée ou voyelle achetée, selon la lettre et la phase. */
  readonly playLetter: (letter: Letter) => void
  /** Passe la main quand plus aucune action n'est possible. */
  readonly pass: () => void
  /**
   * Tente de résoudre l'énigme : le verdict est immédiat et local, tranché par
   * `matchesAnswer` (`game/compare.ts`) dans le reducer — aucun réseau, aucun
   * juge à attendre.
   */
  readonly resolve: (attempt: string) => void
  /**
   * Répond à la question de l'étape bonus. `by` vient de `bonus.by`, jamais du
   * joueur courant : `currentPlayerOf` n'existe pas hors d'une manche, et
   * c'est le gagnant de la manche finale qui a la main ici. Même garde que
   * `spin` et `playLetter` contre un humain qui jouerait à la place d'un bot.
   */
  readonly answerBonus: (attempt: string) => void
  /** Renonce à l'étape bonus : termine la partie sans gain ni pénalité pour cette question. */
  readonly skipBonus: () => void
  /** Sortie de secours pour les actions qui n'ont besoin d'aucune impureté. */
  readonly dispatch: (action: GameAction) => void
}

export const GameCommandsContext = createContext<GameCommands | null>(null)

/**
 * Dernier échec technique d'un juge (réseau, clé révoquée, réponse illisible),
 * ou `null` en l'absence d'échec. « Résoudre » ne consulte plus aucun juge —
 * son verdict est un calcul synchrone du reducer, voir `resolve` ci-dessus —
 * mais l'étape bonus de la manche finale, elle, en consulte toujours un :
 * c'est `useGameEffects` qui produit ce contexte, via `onJudgeFailure`, pour
 * ses pannes techniques (réseau, clé révoquée, réponse illisible). Valeur
 * primitive, pas d'objet enveloppant : aucune mémoïsation à faire, et `null`
 * par défaut est déjà la bonne réponse hors provider — contrairement à
 * `useGameState`, ce lecteur n'a aucune raison de lever pour « aucun échec ».
 */
export const JudgeFailureContext = createContext<JudgeErrorReason | null>(null)

export function useJudgeFailure(): JudgeErrorReason | null {
  return useContext(JudgeFailureContext)
}

/**
 * Dernière phrase d'évènement de manche (« Pas de K. À vous de jouer. »,
 * « Banqueroute. Vous perdez votre cagnotte. », etc.), destinée à l'œil et pas
 * seulement au lecteur d'écran — même précédent que `JudgeFailureContext` :
 * valeur primitive, `null` par défaut est déjà la bonne réponse hors provider,
 * aucune mémoïsation à faire. `null` quand `announceTransition` juge que
 * l'écran porte déjà l'information (`visible: ''`, voir `game/announce.ts`)
 * ou qu'il n'y a rien de neuf à dire.
 */
export const LastEventContext = createContext<string | null>(null)

export function useLastEvent(): string | null {
  return useContext(LastEventContext)
}

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

/** L'étape bonus en cours, ou `null` hors de cette étape. */
export function useBonus(): BonusState | null {
  const game = useGame()
  return game !== null && game.progress.kind === 'bonus' ? game.progress.bonus : null
}

export function useCurrentPlayer(): Player | null {
  const game = useGame()
  if (game === null || game.progress.kind !== 'round') return null
  return game.players[game.progress.currentPlayer] ?? null
}
