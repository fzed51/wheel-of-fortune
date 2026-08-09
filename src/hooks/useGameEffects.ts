import { useEffect, useRef } from 'react'
import type { GameAction } from '../game/actions'
import { BOT_DELAY_MS, botTurnKey, decideBotAction } from '../game/bot'
import { reduce } from '../game/engine'
import type { Rng } from '../game/rng'
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

export interface GameEffectDeps {
  readonly rng: Rng
  /** Compteur monotone de rotation, **partagé** avec la commande `spin` du provider. */
  readonly nextSpinId: () => number
  /**
   * Identifiant de requête pour un futur appel à un juge LLM. Aucun consommateur
   * à cette étape : « Résoudre » est devenu un verdict synchrone du reducer
   * (`resolve/attempt`, tranché par `matchesAnswer`), plus rien ne part vers un
   * réseau sur ce chemin. Gardé dans l'interface pour l'étape suivante — la
   * question bonus de la manche finale, seule chose qui consultera encore un
   * LLM — et volontairement **non déstructuré** ci-dessous : un paramètre
   * déstructuré et jamais lu ferait tomber le lint.
   */
  readonly newRequestId: () => string
}

/**
 * Seul producteur d'effets sur la partie. Le tour de bot (rotation, lettre,
 * résolution) vit ici et nulle part ailleurs. Quatre fichiers produisant des
 * effets sur le même état, ce serait quatre sources de course.
 *
 * `GameProvider` l'appelle **une fois**, avec le `dispatch` qui produit les
 * annonces — jamais le dispatch brut du reducer, sous peine de transitions
 * muettes pour le lecteur d'écran.
 */
export function useGameEffects(
  state: GameState,
  dispatch: (action: GameAction) => void,
  deps: GameEffectDeps,
): void {
  const { rng, nextSpinId } = deps

  useEffect(() => {
    // Écrire à chaque changement d'état, y compris en pleine rotation :
    // `toPersisted` sait ramener une phase transitoire à un état reprenable.
    if (state.kind === 'playing') saveGame(state.game)
    else clearGame()
  }, [state])

  // État frais lu par ref : les effets qui suivent ne dépendent que de clés
  // primitives, jamais de `state`, donc ils ne voient l'état courant qu'au
  // moment où leur minuterie se déclenche, en le relisant ici.
  const stateRef = useRef(state)
  stateRef.current = state

  // Deux primitives dérivées de `state`, jamais l'objet lui-même en dépendance :
  // dépendre de `state` replanifierait le timer à chaque changement, y compris
  // ceux que le tour de bot produit, alors qu'aucune rotation n'est en cours.
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

  const botKey = botTurnKey(state)

  /**
   * Tour de bot : rotation, achat de voyelle, consonne ou tentative de
   * résolution. `botKey` change à chaque décision réellement nouvelle du bot et
   * reste stable pour un même état — c'est cette clé qui fait la dépendance
   * d'effet, jamais `state`, sous peine de replanifier le minuteur en boucle.
   */
  useEffect(() => {
    if (botKey === null) return
    const timer = setTimeout(() => {
      const current = stateRef.current
      if (current.kind !== 'playing') return
      // Le `spinId` est tiré **ici**, à l'échéance du minuteur, jamais au
      // montage de l'effet : StrictMode double-invoque les effets, donc le
      // tirer au montage en consommerait deux par décision.
      //
      // `nextSpinId` est appelé pour toute décision, pas seulement une rotation :
      // le compteur avance donc par sauts. Sans conséquence — il ne sert qu'à
      // rendre chaque rotation distincte de la précédente, jamais à compter.
      const action = decideBotAction(current.game, rng, { spinId: nextSpinId() })
      if (action === null) return
      // Garde de développement : si l'action choisie est un no-op pour le
      // reducer, `botKey` ne changera pas et le bot restera muet pour toujours —
      // la partie se figerait sans erreur visible. `reduce` est pur, un appel de
      // plus est gratuit, et c'est le seul moyen de voir de l'extérieur ce que
      // `dispatch` a fait.
      if (import.meta.env.DEV && reduce(current, action) === current) {
        console.error(
          `Action de bot sans effet (${action.type}) : la partie va se figer, botKey ne changera pas.`,
        )
      }
      dispatch(action)
    }, BOT_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [botKey, dispatch, rng, nextSpinId])
}
