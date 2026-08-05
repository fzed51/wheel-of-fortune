import { useEffect } from 'react'
import type { GameAction } from '../game/actions'
import type { GameState } from '../game/types'
import { clearGame, saveGame } from '../storage/persist'

/**
 * Seul producteur d'effets sur la partie. Le tour de bot et l'appel au juge
 * viendront ici et nulle part ailleurs. Quatre fichiers produisant des effets sur
 * le même état, ce serait quatre sources de course.
 *
 * `GameProvider` l'appelle **une fois**, avec le `dispatch` qui produit les
 * annonces — jamais le dispatch brut du reducer, sous peine de transitions
 * muettes pour le lecteur d'écran.
 */
export function useGameEffects(state: GameState, dispatch: (action: GameAction) => void): void {
  useEffect(() => {
    // Écrire à chaque changement d'état, y compris en pleine rotation :
    // `toPersisted` sait ramener une phase transitoire à un état reprenable.
    if (state.kind === 'playing') saveGame(state.game)
    else clearGame()
  }, [state])

  /**
   * Chien de garde **provisoire** de la roue : `Wheel` et son vrai chien de
   * garde (animation WAAPI, timeout de secours) sont l'étape 13. En attendant,
   * personne d'autre ne dispatche `wheel/settled` : sans cet effet, la partie se
   * figerait en `spinning` dès le premier tour, et « jouable de bout en bout »
   * ne tiendrait pas. Il ne dispatche que si la phase est encore `spinning` — le
   * reducer en sort dès le premier appel, donc pas de boucle possible, y compris
   * sous le double appel d'effet de StrictMode (le second se heurte à un
   * `spinId` déjà consommé et ne fait rien).
   */
  useEffect(() => {
    if (state.kind !== 'playing' || state.game.progress.kind !== 'round') return
    const round = state.game.progress.round
    if (round.phase.kind !== 'spinning') return
    const spinner = state.game.players[state.game.progress.currentPlayer]
    if (spinner === undefined) return
    dispatch({ type: 'wheel/settled', by: spinner.id, spinId: round.phase.spin.spinId })
  }, [state, dispatch])
}
