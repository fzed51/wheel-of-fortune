import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { pickPuzzle } from '../data/puzzles'
import type { GameAction } from '../game/actions'
import { announceTransition } from '../game/announce'
import { initialState, reduce } from '../game/engine'
import { isVowel } from '../game/puzzle'
import { createRng } from '../game/rng'
import type { Rng } from '../game/rng'
import { canBuyVowel, canGuess, canResolve, currentPlayerOf, isBotTurn } from '../game/rules'
import { configFrom, playersFrom } from '../game/setup'
import type { Setup } from '../game/setup'
import type { GameState, Letter } from '../game/types'
import { pickSpinOutcome } from '../game/wheel'
import { useAnnouncer } from '../hooks/useAnnouncer'
import { useGameEffects } from '../hooks/useGameEffects'
import { usePuzzles } from '../hooks/usePuzzles'
import { useSettings } from '../hooks/useSettings'
import { createJudge } from '../llm'
import type { JudgeErrorReason } from '../llm/judge'
import { loadGame, loadMistralKey } from '../storage/persist'
import { GameCommandsContext, GameStateContext, JudgeFailureContext, LastEventContext } from './selectors'
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
  const [state, rawDispatch] = useReducer(reduce, undefined, initGameState)
  const { settings, hasMistralKey } = useSettings()
  const { pool } = usePuzzles()
  const announcer = useAnnouncer()

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
  // Réglages courants pour la fabrique du juge : seul le nom du modèle nous
  // intéresse ici, la clé elle-même n'est jamais mise en ref, voir `getJudge`.
  const settingsRef = useRef(settings)

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

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  /*
   * Déclaré avant le dispatch enveloppé, qui appelle son `setLastEvent` : la
   * lecture du fichier suit alors l'ordre d'usage. Voir la documentation de
   * `LastEventContext` pour ce que cette valeur porte.
   */
  const [lastEvent, setLastEvent] = useState<string | null>(null)

  /**
   * Dispatch enveloppé : seul point du provider où `prev`, `action` et `next`
   * coexistent, donc seul endroit capable de produire les annonces. Un diff à
   * deux états ne suffit pas : `resolve/failed` (juge en panne, la main ne
   * bouge pas) et un verdict négatif en solo (la main « passe » au même siège,
   * `settle` la lui rend aussitôt) produisent des états `prev`/`next`
   * identiques mais des annonces opposées — d'où l'écart avec le plan initial,
   * qui prévoyait ce calcul dans `useGameEffects`, lequel ne voit jamais
   * l'action. Toute commande qui touche l'état doit passer par lui, jamais
   * par `rawDispatch` en direct, sous peine de transitions muettes pour le
   * lecteur d'écran.
   */
  const dispatch = useCallback(
    (action: GameAction) => {
      const prev = stateRef.current
      const next = reduce(prev, action) // le reducer est pur, un second appel est gratuit
      if (next !== prev) {
        // Assignation synchrone : si un gestionnaire dispatche deux actions à la
        // suite (le juge, par exemple, enchaîne `resolve/start` puis
        // `resolve/verdict`), la seconde doit voir l'état intermédiaire, pas celui
        // du dernier rendu commité. L'effet sur `state` réassigne la même valeur
        // une fois le rendu passé ; c'est sans effet, gardé pour ne pas dupliquer
        // ce point unique de vérité qu'est `stateRef`.
        stateRef.current = next
        const announcement = announceTransition(prev, next, action)
        const { status, alert } = announcement
        if (status !== '') announcer.say(status)
        if (alert !== '') announcer.warn(alert)
        // `visible` prime sur `status` s'il est présent (départ ou fin de
        // manche, déjà porté par l'écran) ; sinon `status` est la même phrase
        // que celle envoyée au lecteur d'écran. Chaîne vide -> `null`, pour
        // qu'une ancienne phrase ne traîne pas sur l'écran suivant.
        const texte = announcement.visible ?? status
        setLastEvent(texte === '' ? null : texte)
      }
      rawDispatch(action)
    },
    [announcer],
  )

  // Le juge peut apparaître ou disparaître en pleine partie, quand l'utilisateur
  // saisit ou efface sa clé dans les Réglages. Le reducer no-ope si rien ne change.
  useEffect(() => {
    dispatch({ type: 'config/set-resolve-enabled', enabled: hasMistralKey })
  }, [dispatch, hasMistralKey])

  // Créé à la première utilisation : `createRng(Date.now())` à chaque rendu serait
  // du travail perdu, et la graine n'a de sens qu'une fois par partie.
  const rngRef = useRef<Rng | null>(null)
  const rng = useCallback<Rng>(() => {
    rngRef.current ??= createRng(Date.now())
    return rngRef.current()
  }, [])

  // Monotone et jamais remis à zéro : deux tirages successifs du même segment
  // doivent rejouer l'animation, qui est clée sur `spinId`. Seul chemin vers le
  // compteur — `useGameEffects` s'en sert aussi pour les rotations de bot, et
  // deux compteurs indépendants finiraient par produire deux fois la même
  // valeur, donc une rotation qui ne s'animerait pas.
  const spinIdRef = useRef(0)
  const nextSpinId = useCallback(() => {
    spinIdRef.current += 1
    return spinIdRef.current
  }, [])

  // Identifiant de requête pour une résolution : un compteur monotone suffit,
  // il n'a besoin d'être unique que dans la session. Pas de `crypto.randomUUID` :
  // un compteur est déterministe et se lit dans un test.
  const requestIdRef = useRef(0)
  const newRequestId = useCallback(() => {
    requestIdRef.current += 1
    return `req-${requestIdRef.current}`
  }, [])

  /**
   * Fabrique du juge, appelée au dernier moment plutôt que conservée dans un
   * state ou une ref longue durée : la clé ne survit alors que le temps d'un
   * appel, dans la closure d'un juge éphémère, au lieu de rester à demeure
   * dans un objet que les outils de développement affichent. `hasMistralKey`
   * a déjà tranché sur la présence de la clé pour le reste de l'application ;
   * `createJudge` retranche indépendamment, et renvoie `null` sans repli local
   * si la clé a disparu entre-temps (effacée dans les Réglages, par exemple).
   */
  const getJudge = useCallback(
    () => createJudge({ apiKey: loadMistralKey(), model: settingsRef.current.mistralModel }),
    [],
  )

  // Dernier échec technique du juge, pour le seul consommateur qui doit
  // l'afficher : voir la documentation de `JudgeFailureContext`. Remis à
  // `null` par `resolve` avant chaque nouvelle tentative, pour qu'une
  // ancienne panne ne reste pas affichée par-dessus un nouvel essai.
  const [judgeFailure, setJudgeFailure] = useState<JudgeErrorReason | null>(null)
  const onJudgeFailure = useCallback((reason: JudgeErrorReason) => {
    setJudgeFailure(reason)
  }, [])

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
    [dispatch, rng],
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
  }, [dispatch, rng])

  const spin = useCallback(() => {
    const current = stateRef.current
    if (current.kind !== 'playing' || current.game.progress.kind !== 'round') return
    // Garde structurelle : l'interface grise ses boutons pendant le tour d'un
    // bot, mais le clavier physique et un futur composant n'ont pas à repasser
    // par cette décision. Sans elle l'humain pourrait jouer à la place du bot,
    // le reducer acceptant l'action au nom du joueur courant sans distinguer qui
    // l'a réellement déclenchée.
    if (isBotTurn(current.game)) return
    const player = current.game.players[current.game.progress.currentPlayer]
    if (player === undefined) return
    dispatch({ type: 'wheel/spin', by: player.id, spin: pickSpinOutcome(rng, nextSpinId()) })
  }, [dispatch, rng, nextSpinId])

  /**
   * Trouver le `spinId` et le joueur courant, c'est lire l'état de la partie :
   * ça vit ici, pas dans la roue ni dans une route. L'animation n'a besoin que
   * d'appeler cette commande une fois arrivée sur le segment.
   */
  const settleSpin = useCallback(() => {
    const current = stateRef.current
    if (current.kind !== 'playing' || current.game.progress.kind !== 'round') return
    // Tout est relu sur `current.game`, sans jamais passer par une variable
    // intermédiaire : TypeScript ne transporte pas le rétrécissement de
    // `progress.kind` à travers un alias, et le contourner demanderait de
    // retester la même chose une seconde fois.
    const round = current.game.progress.round
    if (round.phase.kind !== 'spinning') return
    const player = current.game.players[current.game.progress.currentPlayer]
    if (player === undefined) return
    dispatch({ type: 'wheel/settled', by: player.id, spinId: round.phase.spin.spinId })
  }, [dispatch])

  /**
   * Route vers l'une des deux actions de lettre sans réimplémenter la moindre
   * règle : `canBuyVowel`/`canGuess` de `rules.ts` tranchent, cette commande ne
   * fait que remplir `by`. C'est la source unique du clavier virtuel et du
   * clavier physique.
   */
  const playLetter = useCallback(
    (letter: Letter) => {
      const current = stateRef.current
      if (current.kind !== 'playing' || current.game.progress.kind !== 'round') return
      // Voir le commentaire de `spin` : même garde, même raison.
      if (isBotTurn(current.game)) return
      // Le joueur est lu sur `current.game` et non sur un alias : TypeScript ne
      // transporte pas le rétrécissement de `progress.kind` à travers une copie.
      const player = current.game.players[current.game.progress.currentPlayer]
      if (player === undefined) return
      const game = current.game
      if (isVowel(letter)) {
        if (!canBuyVowel(game)) return
        dispatch({ type: 'letter/buy-vowel', by: player.id, letter })
        return
      }
      if (canGuess(game, letter)) {
        dispatch({ type: 'letter/consonant', by: player.id, letter })
      }
    },
    [dispatch],
  )

  const pass = useCallback(() => {
    const current = stateRef.current
    if (current.kind !== 'playing' || current.game.progress.kind !== 'round') return
    // Voir le commentaire de `spin` : même garde, même raison.
    if (isBotTurn(current.game)) return
    const player = currentPlayerOf(current.game)
    dispatch({ type: 'turn/pass', by: player.id })
  }, [dispatch])

  /**
   * Envoie une tentative de résolution au juge. Mêmes gardes que `spin` et pour
   * les mêmes raisons : le clavier physique n'a pas d'attribut à griser, et un
   * humain ne résout pas à la place d'un bot. `canResolve` de `rules.ts`
   * tranche la légalité, cette commande ne fait que relayer la demande —
   * `useGameEffects` s'occupe d'appeler le juge et de dispatcher le verdict.
   */
  const resolve = useCallback(
    (attempt: string) => {
      const current = stateRef.current
      if (current.kind !== 'playing' || current.game.progress.kind !== 'round') return
      if (isBotTurn(current.game)) return
      if (!canResolve(current.game)) return
      // Le joueur est lu sur `current.game` et non sur un alias : voir le
      // commentaire de `settleSpin`.
      const player = current.game.players[current.game.progress.currentPlayer]
      if (player === undefined) return
      // Une ancienne panne réseau ne doit pas rester affichée par-dessus ce
      // nouvel essai.
      setJudgeFailure(null)
      dispatch({ type: 'resolve/start', by: player.id, attempt, requestId: newRequestId() })
    },
    [dispatch, newRequestId],
  )

  const commands = useMemo<GameCommands>(
    () => ({ startGame, nextRound, spin, settleSpin, playLetter, pass, resolve, dispatch }),
    [startGame, nextRound, spin, settleSpin, playLetter, pass, resolve, dispatch],
  )

  useGameEffects(state, dispatch, { rng, nextSpinId, newRequestId, getJudge, onJudgeFailure })

  return (
    <GameCommandsContext value={commands}>
      <GameStateContext value={state}>
        <JudgeFailureContext value={judgeFailure}>
          <LastEventContext value={lastEvent}>{children}</LastEventContext>
        </JudgeFailureContext>
      </GameStateContext>
    </GameCommandsContext>
  )
}
