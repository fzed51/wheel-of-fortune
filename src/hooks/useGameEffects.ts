import { useEffect } from 'react'
import type { GameState } from '../game/types'
import { clearGame, saveGame } from '../storage/persist'

/**
 * Seul producteur d'effets sur la partie. Il n'en gère qu'un pour l'instant — la
 * persistance ; le tour de bot, l'appel au juge et le chien de garde de rotation
 * viendront ici et nulle part ailleurs. Quatre fichiers produisant des effets sur
 * le même état, ce serait quatre sources de course.
 *
 * `GameProvider` l'appelle **une fois**.
 */
export function useGameEffects(state: GameState): void {
  useEffect(() => {
    // Écrire à chaque changement d'état, y compris en pleine rotation :
    // `toPersisted` sait ramener une phase transitoire à un état reprenable.
    if (state.kind === 'playing') saveGame(state.game)
    else clearGame()
  }, [state])
}
