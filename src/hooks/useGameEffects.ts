import { useEffect, useRef } from 'react'
import type { GameAction } from '../game/actions'
import { BOT_DELAY_MS, botResolveIsCorrect, botTurnKey, decideBotAction } from '../game/bot'
import { reduce } from '../game/engine'
import type { Rng } from '../game/rng'
import type { GameState, PlayerId } from '../game/types'
import { SPIN_MS } from '../game/wheel'
import type { Judge, JudgeErrorReason } from '../llm/judge'
import { clearGame, saveGame } from '../storage/persist'

/**
 * Coupe-circuit contre notre propre code, pas contre le joueur : chaque
 * tentative de résolution vient d'un clic, douze dans une seule manche
 * signalent une boucle d'effet, pas un joueur têtu. Au-delà, plus aucun appel
 * réseau n'est tenté pour cette manche.
 */
export const MAX_JUDGE_CALLS_PER_ROUND = 12

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
 * Identifiant de la requête en attente de verdict, quand cette requête est
 * celle d'un bot — `null` sinon, résolution humaine comprise : voir l'effet qui
 * s'en sert.
 */
function botResolvingRequestId(state: GameState): string | null {
  if (state.kind !== 'playing' || state.game.progress.kind !== 'round') return null
  const round = state.game.progress.round
  if (round.phase.kind !== 'resolving') return null
  const player = state.game.players[state.game.progress.currentPlayer]
  if (player === undefined || player.kind.type !== 'bot') return null
  return round.phase.requestId
}

interface HumanResolving {
  readonly requestId: string
  readonly attempt: string
  readonly answer: string
  readonly category: string
}

/**
 * Tentative humaine en attente de verdict, ou `null` hors phase `resolving`
 * **ou** quand le joueur courant est un bot — un bot n'envoie jamais rien à
 * l'API, son texte de tentative (`BOT_ATTEMPT`) est un remplacement et le juge
 * n'aurait rien à en dire. `answer` et `category` sont lus sur `round.puzzle`,
 * jamais sur un alias : voir `spinningInfo` pour la raison.
 */
function humanResolving(state: GameState): HumanResolving | null {
  if (state.kind !== 'playing' || state.game.progress.kind !== 'round') return null
  const round = state.game.progress.round
  if (round.phase.kind !== 'resolving') return null
  const player = state.game.players[state.game.progress.currentPlayer]
  if (player === undefined || player.kind.type === 'bot') return null
  return {
    requestId: round.phase.requestId,
    attempt: round.phase.attempt,
    answer: round.puzzle.answer,
    category: round.puzzle.category,
  }
}

/**
 * Index de la manche en cours, ou `null` hors manche. Sert uniquement à
 * remettre à zéro le compteur du coupe-circuit de crédit quand la manche
 * change — une manche déjà résolue ne doit pas hériter du quota de la
 * précédente.
 */
function currentRoundIndex(state: GameState): number | null {
  if (state.kind !== 'playing' || state.game.progress.kind !== 'round') return null
  return state.game.progress.round.index
}

export interface GameEffectDeps {
  readonly rng: Rng
  /** Compteur monotone de rotation, **partagé** avec la commande `spin` du provider. */
  readonly nextSpinId: () => number
  readonly newRequestId: () => string
  /** Juge créé au dernier moment : la clé ne survit pas au-delà de l'appel. */
  readonly getJudge: () => Judge | null
  readonly onJudgeFailure: (reason: JudgeErrorReason) => void
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
  const { rng, nextSpinId, newRequestId, getJudge, onJudgeFailure } = deps

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
      // Les identifiants sont tirés **ici**, à l'échéance du minuteur, jamais au
      // montage de l'effet : StrictMode double-invoque les effets, donc les tirer
      // au montage en consommerait deux par décision.
      //
      // `nextSpinId` est appelé pour toute décision, pas seulement une rotation :
      // le compteur avance donc par sauts. Sans conséquence — il ne sert qu'à
      // rendre chaque rotation distincte de la précédente, jamais à compter.
      const action = decideBotAction(current.game, rng, {
        spinId: nextSpinId(),
        requestId: newRequestId(),
      })
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
  }, [botKey, dispatch, rng, nextSpinId, newRequestId])

  const botRequestId = botResolvingRequestId(state)

  /**
   * Verdict d'une tentative de bot. Ce n'est pas l'affaire du juge LLM —
   * `BOT_ATTEMPT` est un texte de remplacement et l'envoyer au juge n'aurait
   * aucun sens — c'est le driver qui tranche, via `botResolveIsCorrect`.
   */
  useEffect(() => {
    if (botRequestId === null) return
    const timer = setTimeout(() => {
      const current = stateRef.current
      // La partie a pu changer d'état entre la planification et l'échéance (une
      // panne réseau simulée ailleurs, par exemple) : sans manche en cours, il
      // n'y a plus rien à trancher.
      if (current.kind !== 'playing') return
      dispatch({
        type: 'resolve/verdict',
        requestId: botRequestId,
        correct: botResolveIsCorrect(current.game, rng),
      })
    }, BOT_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [botRequestId, dispatch, rng])

  const human = humanResolving(state)
  // Primitives dérivées, jamais `human` lui-même en dépendance : un nouvel
  // objet à chaque rendu replanifierait l'effet en boucle. `null` par défaut
  // équivaut alors à « rien à envoyer », et le premier `if` de l'effet couvre
  // aussi bien l'absence de résolution en cours que celle d'un joueur humain.
  const humanRequestId = human?.requestId ?? null
  const humanAttempt = human?.attempt ?? null
  const humanAnswer = human?.answer ?? null
  const humanCategory = human?.category ?? null
  const roundIndex = currentRoundIndex(state)

  // Requêtes déjà envoyées au juge : parade à la double invocation de
  // StrictMode. Sans ce filet, chaque résolution partirait deux fois sur le
  // réseau, donc deux appels facturés — c'est le seul endroit du projet où un
  // effet doublé coûte de l'argent.
  const sentJudgeRequestIds = useRef<Set<string>>(new Set())
  // Coupe-circuit de crédit : compteur d'appels réellement envoyés pour la
  // manche en cours, remis à zéro quand `roundIndex` change.
  const judgeCallCountRef = useRef(0)
  const judgeCallRoundRef = useRef<number | null>(null)

  /**
   * Résolution humaine : envoie la tentative au juge et dispatch le verdict.
   *
   * Le nettoyage de cet effet ne pose **aucun** drapeau d'annulation qui
   * conditionnerait le `dispatch` du résultat — ce serait le réflexe habituel,
   * et il serait faux ici : avec le `Set` de `requestId` déjà envoyés, le
   * second montage de StrictMode sortirait tôt via ce `Set`, donc le premier
   * montage se retrouverait « annulé » par son propre cleanup, et aucun
   * verdict ne serait jamais dispatché — la partie resterait figée en
   * `resolving`. L'obsolescence est déjà gérée par le reducer, qui ignore un
   * `resolve/verdict` ou un `resolve/failed` dont le `requestId` ne
   * correspond plus à la phase courante ; il n'y a donc rien à annuler ici.
   */
  useEffect(() => {
    if (
      humanRequestId === null ||
      humanAttempt === null ||
      humanAnswer === null ||
      humanCategory === null
    ) {
      return
    }
    // Voir la documentation ci-dessus : seule garde nécessaire contre le
    // double envoi de StrictMode.
    if (sentJudgeRequestIds.current.has(humanRequestId)) return
    sentJudgeRequestIds.current.add(humanRequestId)

    if (judgeCallRoundRef.current !== roundIndex) {
      judgeCallRoundRef.current = roundIndex
      judgeCallCountRef.current = 0
    }

    // Garde-fou contre notre propre code, pas contre le joueur : chaque
    // tentative vient d'un clic, douze dans une seule manche signalent une
    // boucle d'effet. `'network'` est la raison la moins fausse : le juge n'a
    // effectivement pas été joint.
    if (judgeCallCountRef.current >= MAX_JUDGE_CALLS_PER_ROUND) {
      if (import.meta.env.DEV) {
        console.error(
          `Coupe-circuit du juge atteint (${MAX_JUDGE_CALLS_PER_ROUND} appels, requestId=${humanRequestId}) : la manche a peut-être une boucle d'effet.`,
        )
      }
      onJudgeFailure('network')
      dispatch({ type: 'resolve/failed', requestId: humanRequestId, reason: 'network' })
      return
    }
    judgeCallCountRef.current += 1

    const judge = getJudge()
    // La partie ne devrait jamais atteindre `resolving` sans juge —
    // `config.resolveEnabled` l'interdit — mais la clé a pu être effacée
    // pendant l'attente. Sortir proprement de la phase plutôt que bloquer en
    // silence.
    //
    // `onJudgeFailure` ici comme dans les branches d'échec du juge, et pour la
    // même raison : c'est le seul chemin vers un message **visible**. L'annonce
    // de `announceTransition` part dans une live region `sr-only`, donc un
    // joueur qui n'utilise pas de lecteur d'écran verrait sa boîte se vider
    // sans un mot d'explication.
    if (judge === null) {
      onJudgeFailure('unauthorized')
      dispatch({ type: 'resolve/failed', requestId: humanRequestId, reason: 'unauthorized' })
      return
    }

    // `judge()` ne lève jamais par contrat, mais un juge tiers mal écrit ne
    // doit pas figer la partie : on enveloppe quand même l'appel.
    judge
      .judge({ attempt: humanAttempt, answer: humanAnswer, category: humanCategory })
      .then((result) => {
        if (result.kind === 'verdict') {
          dispatch({ type: 'resolve/verdict', requestId: humanRequestId, correct: result.correct })
          return
        }
        onJudgeFailure(result.reason)
        dispatch({ type: 'resolve/failed', requestId: humanRequestId, reason: result.reason })
      })
      .catch(() => {
        onJudgeFailure('network')
        dispatch({ type: 'resolve/failed', requestId: humanRequestId, reason: 'network' })
      })
  }, [
    humanRequestId,
    humanAttempt,
    humanAnswer,
    humanCategory,
    roundIndex,
    dispatch,
    getJudge,
    onJudgeFailure,
  ])
}
