import { useEffect } from 'react'
import type { GameAction } from '../game/actions'
import type { GameState, PlayerId } from '../game/types'
import { SPIN_MS } from '../game/wheel'
import { clearGame, saveGame } from '../storage/persist'

/**
 * Marge du chien de garde après la fin théorique de l'animation. Elle doit rester
 * franchement positive : un chien de garde plus court que la rotation la
 * couperait au milieu, et le joueur verrait la roue continuer à tourner après
 * que le tour a déjà été joué.
 */
const SPIN_WATCHDOG_MARGIN_MS = 500

interface Spinning {
  readonly spinId: number
  readonly playerId: PlayerId
}

/**
 * Identifiant de rotation en cours et joueur qui l'a lancée, ou `null` hors
 * rotation. Isolé dans une fonction pure pour éviter l'alias qui ferait perdre
 * à TypeScript le rétrécissement de `progress.kind === 'round'` : chaque accès
 * repart de `state.game.progress`, jamais d'une copie.
 */
function spinningInfo(state: GameState): Spinning | null {
  if (state.kind !== 'playing' || state.game.progress.kind !== 'round') return null
  const round = state.game.progress.round
  if (round.phase.kind !== 'spinning') return null
  const player = state.game.players[state.game.progress.currentPlayer]
  if (player === undefined) return null
  return { spinId: round.phase.spin.spinId, playerId: player.id }
}

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

  // Deux primitives dérivées de `state`, jamais l'objet lui-même en dépendance :
  // dépendre de `state` replanifierait le timer à chaque changement, y compris
  // ceux que le tour de bot produira à l'étape suivante, alors qu'aucune
  // rotation n'est en cours.
  const spinning = spinningInfo(state)
  const spinningId = spinning?.spinId ?? null
  const spinnerId = spinning?.playerId ?? null

  /**
   * Vrai chien de garde de la roue : filet, pas concurrent. Dans le cas normal,
   * l'animation de `Wheel` a déjà appelé `settleSpin` avant `SPIN_MS + 500`, et
   * le reducer voit un `spinId` déjà consommé — cet effet ne fait alors rien. Ce
   * qu'il rattrape, c'est ce que l'animation ne peut pas garantir : onglet en
   * arrière-plan dont la promesse de fin ne se résout qu'au retour, roue
   * démontée en pleine rotation, navigateur sans Web Animations API.
   */
  useEffect(() => {
    if (spinningId === null || spinnerId === null) return
    const timer = setTimeout(() => {
      dispatch({ type: 'wheel/settled', by: spinnerId, spinId: spinningId })
    }, SPIN_MS + SPIN_WATCHDOG_MARGIN_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [spinningId, spinnerId, dispatch])
}
