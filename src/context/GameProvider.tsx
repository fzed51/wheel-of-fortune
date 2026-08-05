import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
import type { ReactNode } from 'react'
import { pickPuzzle } from '../data/puzzles'
import { initialState, reduce } from '../game/engine'
import { createRng } from '../game/rng'
import type { Rng } from '../game/rng'
import { configFrom, playersFrom } from '../game/setup'
import type { Setup } from '../game/setup'
import type { GameState } from '../game/types'
import { pickSpinOutcome } from '../game/wheel'
import { useGameEffects } from '../hooks/useGameEffects'
import { usePuzzles } from '../hooks/usePuzzles'
import { useSettings } from '../hooks/useSettings'
import { loadGame } from '../storage/persist'
import { GameCommandsContext, GameStateContext } from './selectors'
import type { GameCommands } from './selectors'

/**
 * Hydratation **synchrone**. Lire le stockage dans un effet ferait voir `no-game`
 * au premier rendu, et la garde de `/jeu` redirigerait vers l'accueil à chaque F5
 * en pleine partie. Avec l'initialiseur paresseux, il n'existe aucun état
 * « chargement ».
 */
function initGameState(): GameState {
  const loaded = loadGame()
  return loaded.ok ? { kind: 'playing', game: loaded.value } : initialState
}

export function GameProvider({ children }: { readonly children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, initGameState)
  const { settings, hasMistralKey } = useSettings()
  const { pool } = usePuzzles()

  // Refs de dernière valeur connue : les commandes doivent rester stables à vie,
  // donc elles ne peuvent pas dépendre de ces objets. La lecture n'a lieu que dans
  // un gestionnaire, jamais pendant le rendu.
  const stateRef = useRef(state)
  const setupRef = useRef<Setup>({
    roundCount: settings.roundCount,
    opponents: settings.opponents,
    botLevel: settings.botLevel,
    resolveEnabled: hasMistralKey,
  })
  const poolRef = useRef(pool)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    setupRef.current = {
      roundCount: settings.roundCount,
      opponents: settings.opponents,
      botLevel: settings.botLevel,
      resolveEnabled: hasMistralKey,
    }
  }, [settings, hasMistralKey])

  useEffect(() => {
    poolRef.current = pool
  }, [pool])

  // Le juge peut apparaître ou disparaître en pleine partie, quand l'utilisateur
  // saisit ou efface sa clé dans les Réglages. Le reducer no-ope si rien ne change.
  useEffect(() => {
    dispatch({ type: 'config/set-resolve-enabled', enabled: hasMistralKey })
  }, [hasMistralKey])

  // Créé à la première utilisation : `createRng(Date.now())` à chaque rendu serait
  // du travail perdu, et la graine n'a de sens qu'une fois par partie.
  const rngRef = useRef<Rng | null>(null)
  const rng = useCallback<Rng>(() => {
    rngRef.current ??= createRng(Date.now())
    return rngRef.current()
  }, [])

  // Monotone et jamais remis à zéro : deux tirages successifs du même segment
  // doivent rejouer l'animation, qui est clée sur `spinId`.
  const spinIdRef = useRef(0)

  const startGame = useCallback(
    (overrides: Partial<Setup> = {}) => {
      const setup = { ...setupRef.current, ...overrides }
      const puzzle = pickPuzzle(rng, poolRef.current, [])
      if (puzzle === null) return
      dispatch({
        type: 'game/start',
        config: configFrom(setup),
        players: playersFrom(setup),
        puzzle,
        firstPlayer: 0,
      })
    },
    [rng],
  )

  const nextRound = useCallback(() => {
    const current = stateRef.current
    if (current.kind !== 'playing') return
    const game = current.game
    const puzzle = pickPuzzle(rng, poolRef.current, game.playedPuzzleIds)
    if (puzzle === null) return
    // Rotation des sièges plutôt qu'un tirage : le premier joueur d'une manche
    // n'a aucune raison d'être aléatoire, et un tour de table est plus lisible.
    const played = game.history.length
    dispatch({
      type: 'round/next',
      puzzle,
      firstPlayer: game.players.length === 0 ? 0 : (played + 1) % game.players.length,
    })
  }, [rng])

  const spin = useCallback(() => {
    const current = stateRef.current
    if (current.kind !== 'playing' || current.game.progress.kind !== 'round') return
    const player = current.game.players[current.game.progress.currentPlayer]
    if (player === undefined) return
    spinIdRef.current += 1
    dispatch({ type: 'wheel/spin', by: player.id, spin: pickSpinOutcome(rng, spinIdRef.current) })
  }, [rng])

  const commands = useMemo<GameCommands>(
    () => ({ startGame, nextRound, spin, dispatch }),
    [startGame, nextRound, spin],
  )

  useGameEffects(state)

  return (
    <GameCommandsContext value={commands}>
      <GameStateContext value={state}>{children}</GameStateContext>
    </GameCommandsContext>
  )
}
