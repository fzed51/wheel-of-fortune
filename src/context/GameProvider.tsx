import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { pickPuzzle } from '../data/puzzles'
import type { GameAction } from '../game/actions'
import { announceTransition } from '../game/announce'
import { isFinalRound } from '../game/bonus'
import { initialState, reduce } from '../game/engine'
import { isVowel } from '../game/puzzle'
import { createRng } from '../game/rng'
import type { Rng } from '../game/rng'
import { canBuyVowel, canGuess, canResolve, currentPlayerOf, isBotTurn } from '../game/rules'
import { configFrom, playersFrom } from '../game/setup'
import type { Setup } from '../game/setup'
import type { GameProgress, GameState, Letter, Puzzle, PuzzleId } from '../game/types'
import { randomForce, throwFromForce } from '../game/wheel'
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
 * Index de la manche qui s'achève, ou `null` si aucune ne peut être archivée.
 *
 * Les deux cas acceptés sont exactement ceux que le reducer accepte pour
 * `round/next` : une manche résolue (`round-over`) et une manche figée
 * (`round` en phase `blocked`). Reproduire ce tri ici n'est pas une redite
 * gratuite — c'est ce qui garantit que le tirage et le reducer parlent de la
 * même manche. Sur tout autre état, le reducer renverrait l'état inchangé : le
 * tirage serait alors consommé pour rien, et l'énigme piochée perdue.
 */
function endingRoundIndex(progress: GameProgress): number | null {
  if (progress.kind === 'round-over') return progress.summary.index
  if (progress.kind === 'round' && progress.round.phase.kind === 'blocked') {
    return progress.round.index
  }
  return null
}

/**
 * Choix du réservoir selon l'index de la manche, pur : ni React ni aléa
 * propre, tout entre en paramètre. Reste local et non exporté — l'exporter
 * ferait tomber `react/only-export-components` sur ce fichier, qui exporte
 * déjà `GameProvider` en défaut.
 *
 * La manche finale tire dans `questions` et seulement elle : un réservoir de
 * questions épuisé (ou vide, catalogue perso mis à part) ne doit jamais
 * figer la partie, donc `pickPuzzle` retombe sur `pool` — cf. `nextRound`, qui
 * `return`ne tout court quand le tirage rend `null`.
 */
function pickFor(
  rng: Rng,
  index: number,
  roundCount: number,
  questions: readonly Puzzle[],
  pool: readonly Puzzle[],
  excluded: readonly PuzzleId[],
): Puzzle | null {
  if (isFinalRound(index, roundCount)) {
    return pickPuzzle(rng, questions, excluded) ?? pickPuzzle(rng, pool, excluded)
  }
  return pickPuzzle(rng, pool, excluded)
}

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
  const { pool, questions } = usePuzzles()
  const announcer = useAnnouncer()

  // Refs de dernière valeur connue : les commandes doivent rester stables à vie,
  // donc elles ne peuvent pas dépendre de ces objets. La lecture n'a lieu que dans
  // un gestionnaire, jamais pendant le rendu.
  const stateRef = useRef(state)
  const setupRef = useRef<Setup>({
    roundCount: settings.roundCount,
    opponents: settings.opponents,
    botLevel: settings.botLevel,
    bonusEnabled: hasMistralKey,
  })
  // Lu par `getJudge`, au dernier moment : voir sa documentation.
  const settingsRef = useRef(settings)
  const poolRef = useRef(pool)
  const questionsRef = useRef(questions)

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    setupRef.current = {
      roundCount: settings.roundCount,
      opponents: settings.opponents,
      botLevel: settings.botLevel,
      bonusEnabled: hasMistralKey,
    }
  }, [settings, hasMistralKey])

  useEffect(() => {
    settingsRef.current = settings
  }, [settings])

  useEffect(() => {
    poolRef.current = pool
  }, [pool])

  useEffect(() => {
    questionsRef.current = questions
  }, [questions])

  /*
   * Déclaré avant le dispatch enveloppé, qui appelle son `setLastEvent` : la
   * lecture du fichier suit alors l'ordre d'usage. Voir la documentation de
   * `LastEventContext` pour ce que cette valeur porte.
   */
  const [lastEvent, setLastEvent] = useState<string | null>(null)

  /**
   * Dispatch enveloppé : seul point du provider où `prev`, `action` et `next`
   * coexistent, donc seul endroit capable de produire les annonces. Un diff à
   * deux états ne suffit pas : `letter/consonant`, par exemple, porte la
   * lettre jouée et l'identité de son auteur, deux informations qu'aucune
   * comparaison de `prev` et `next` ne fait apparaître — le plateau ne dit pas
   * quelle lettre vient d'être tentée quand elle est absente de la réponse, et
   * le siège courant ne suffit pas à nommer l'auteur d'un coup qui a fait
   * tourner la main. D'où l'écart avec le plan initial, qui prévoyait ce
   * calcul dans `useGameEffects`, lequel ne voit jamais l'action (même
   * justification dans `announceTransition`, voir `game/announce.ts`). Toute
   * commande qui touche l'état doit passer par lui, jamais par `rawDispatch`
   * en direct, sous peine de transitions muettes pour le lecteur d'écran.
   */
  const dispatch = useCallback(
    (action: GameAction) => {
      const prev = stateRef.current
      const next = reduce(prev, action) // le reducer est pur, un second appel est gratuit
      if (next !== prev) {
        // Assignation synchrone : si un gestionnaire dispatchait deux actions
        // coup sur coup, la seconde devrait voir l'état intermédiaire, pas
        // celui du dernier rendu commité. L'effet sur `state` réassigne la
        // même valeur une fois le rendu passé ; c'est sans effet, gardé pour
        // ne pas dupliquer ce point unique de vérité qu'est `stateRef`.
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

  // Identifiant de requête pour une réponse à l'étape bonus : un compteur
  // monotone suffit, il n'a besoin d'être unique que dans la session. Pas de
  // `crypto.randomUUID` : un compteur est déterministe et se lit dans un test.
  const requestIdRef = useRef(0)
  const newRequestId = useCallback(() => {
    requestIdRef.current += 1
    return `req-${requestIdRef.current}`
  }, [])

  // Dernier échec technique d'un juge, pour le seul consommateur qui doit
  // l'afficher : voir la documentation de `JudgeFailureContext`. Producteur
  // unique : `onJudgeFailure`, passé à `useGameEffects` plus bas.
  const [judgeFailure, setJudgeFailure] = useState<JudgeErrorReason | null>(null)

  /**
   * Fabrique le juge au dernier moment, à chaque appel, plutôt que de le
   * garder dans un state ou une ref longue durée : ainsi la clé ne survit que
   * le temps d'un appel, dans la closure d'un juge éphémère, au lieu de rester
   * à demeure dans un objet que les outils de développement affichent.
   */
  const getJudge = useCallback(
    () => createJudge({ apiKey: loadMistralKey(), model: settingsRef.current.mistralModel }),
    [],
  )

  const onJudgeFailure = useCallback((reason: JudgeErrorReason) => {
    setJudgeFailure(reason)
  }, [])

  // Le juge peut apparaître ou disparaître en pleine partie, quand l'utilisateur
  // saisit ou efface sa clé dans les Réglages. Le reducer no-ope si rien ne change.
  useEffect(() => {
    dispatch({ type: 'config/set-bonus-enabled', enabled: hasMistralKey })
  }, [dispatch, hasMistralKey])

  const startGame = useCallback(
    (overrides: Partial<Setup> = {}) => {
      const setup = { ...setupRef.current, ...overrides }
      // Une seule application de `configFrom` : elle borne `roundCount` entre 1
      // et 10 (`clamp`), et c'est cette valeur bornée — pas `setup.roundCount`
      // — qui doit décider si la manche 0 est la manche finale. Sinon un
      // réglage hors bornes (ex. 0 ou 42 manches) ferait diverger `pickFor` du
      // reducer sur l'identité de la dernière manche : l'un tirerait une
      // question, l'autre attendrait une manche ordinaire.
      const config = configFrom(setup)
      const puzzle = pickFor(rng, 0, config.roundCount, questionsRef.current, poolRef.current, [])
      if (puzzle === null) return
      dispatch({
        type: 'game/start',
        config,
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
    // Index de la manche **à venir**, lu dans `progress` et non déduit de
    // `history.length` : le résumé de la manche qui s'achève n'y est poussé que
    // par le reducer, au traitement de `round/next` — donc après ce tirage.
    // `history.length` vaut ici l'index de la manche qui *finit*, et le prendre
    // pour celle qui commence décalait tout d'un cran : la manche finale était
    // tirée dans `pool`, et la question de la manche finale ne pouvait jamais
    // être servie dès que la partie comptait plus d'une manche.
    //
    // `progress` est la même source que celle du reducer (`summary.index + 1`) :
    // les deux s'accordent donc par construction sur l'identité de la manche
    // finale, ce qu'un compteur parallèle ne garantirait pas.
    const ending = endingRoundIndex(game.progress)
    if (ending === null) return
    const puzzle = pickFor(
      rng,
      ending + 1,
      game.config.roundCount,
      questionsRef.current,
      poolRef.current,
      game.playedPuzzleIds,
    )
    if (puzzle === null) return
    // Rotation des sièges plutôt qu'un tirage : le premier joueur d'une manche
    // n'a aucune raison d'être aléatoire, et un tour de table est plus lisible.
    // Le siège se déduit du même index que le tirage, pour qu'une seule
    // définition de « la manche qui commence » vive dans cette commande.
    dispatch({
      type: 'round/next',
      puzzle,
      firstPlayer: game.players.length === 0 ? 0 : (ending + 1) % game.players.length,
    })
  }, [dispatch, rng])

  const spin = useCallback(
    (force?: number) => {
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
      // `force` omise : un humain qui tourne sans jauge (clavier physique, par
      // exemple) obtient quand même un lancer, tiré au hasard.
      const applied = force ?? randomForce(rng)
      dispatch({ type: 'wheel/spin', by: player.id, thrown: throwFromForce(applied, rng, nextSpinId()) })
    },
    [dispatch, rng, nextSpinId],
  )

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
   * Dispatche directement une tentative de résolution : le verdict est un
   * calcul synchrone du reducer (`matchesAnswer`), plus rien à relayer à un
   * driver. Mêmes gardes que `spin` et pour les mêmes raisons : le clavier
   * physique n'a pas d'attribut à griser, et un humain ne résout pas à la
   * place d'un bot. `canResolve` de `rules.ts` tranche la légalité.
   */
  const resolve = useCallback(
    (attempt: string) => {
      const current = stateRef.current
      if (current.kind !== 'playing' || current.game.progress.kind !== 'round') return
      if (isBotTurn(current.game)) return
      if (!canResolve(current.game)) return
      const player = current.game.players[current.game.progress.currentPlayer]
      if (player === undefined) return
      dispatch({ type: 'resolve/attempt', by: player.id, attempt })
    },
    [dispatch],
  )

  /**
   * Répond à la question de l'étape bonus. `by` vient de `bonus.by`, jamais du
   * joueur courant : `currentPlayerOf` n'existe pas hors d'une manche (voir sa
   * documentation dans `rules.ts`), et c'est le gagnant de la manche finale
   * qui a la main ici. Voir le commentaire de `spin` : même garde, même
   * raison, contre un humain qui répondrait à la place d'un bot.
   */
  const answerBonus = useCallback(
    (attempt: string) => {
      const current = stateRef.current
      if (current.kind !== 'playing' || current.game.progress.kind !== 'bonus') return
      if (isBotTurn(current.game)) return
      // Une ancienne panne ne doit pas rester affichée par-dessus ce nouvel essai,
      // qui peut très bien réussir.
      setJudgeFailure(null)
      dispatch({
        type: 'bonus/answer',
        by: current.game.progress.bonus.by,
        attempt,
        requestId: newRequestId(),
      })
    },
    [dispatch, newRequestId],
  )

  /** Renonce à l'étape bonus. Voir le commentaire de `answerBonus` pour `by`. */
  const skipBonus = useCallback(() => {
    const current = stateRef.current
    if (current.kind !== 'playing' || current.game.progress.kind !== 'bonus') return
    if (isBotTurn(current.game)) return
    dispatch({ type: 'bonus/skip', by: current.game.progress.bonus.by })
  }, [dispatch])

  const commands = useMemo<GameCommands>(
    () => ({
      startGame,
      nextRound,
      spin,
      settleSpin,
      playLetter,
      pass,
      resolve,
      answerBonus,
      skipBonus,
      dispatch,
    }),
    [startGame, nextRound, spin, settleSpin, playLetter, pass, resolve, answerBonus, skipBonus, dispatch],
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
