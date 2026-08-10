import { useEffect, useRef } from 'react'
import type { GameAction } from '../game/actions'
import { BOT_DELAY_MS, botTurnKey, decideBotAction } from '../game/bot'
import { matchesAnswer } from '../game/compare'
import { reduce } from '../game/engine'
import type { Rng } from '../game/rng'
import { bonusPlayerOf } from '../game/rules'
import type { GameState, PlayerId } from '../game/types'
import { SPIN_MS } from '../game/wheel'
import type { Judge, JudgeErrorReason } from '../llm/judge'
import { clearGame, saveGame } from '../storage/persist'

/**
 * Coupe-circuit contre notre propre code, pas contre le joueur : chaque
 * réponse à l'étape bonus vient d'un clic, quatre dans une seule partie
 * signalent une boucle d'effet, pas un joueur têtu — il n'existe qu'une seule
 * étape bonus par partie. Au-delà, plus aucun appel réseau n'est tenté pour
 * cette étape.
 */
export const MAX_BONUS_JUDGE_CALLS = 4

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

interface HumanBonus {
  readonly requestId: string
  readonly attempt: string
  /** Énoncé de la question, lu sur `bonus.question.answer` : voir `types.ts`, `BonusState`. */
  readonly question: string
  readonly expected: string
}

/**
 * Tentative humaine en attente de verdict à l'étape bonus, ou `null` hors
 * phase `judging` **et aussi** quand le joueur du bonus est un bot : un bot ne
 * passe jamais par le réseau, c'est lui-même qui tranche son verdict via
 * `decideBotAction` (`botBonusIsCorrect` dans `game/bot.ts`). Toujours relu
 * sur `state.game.progress`, sans alias : voir `spinningInfo` ci-dessus pour
 * la raison, TypeScript ne transporte pas le rétrécissement de `progress.kind`
 * à travers une copie.
 */
function humanBonus(state: GameState): HumanBonus | null {
  if (state.kind !== 'playing' || state.game.progress.kind !== 'bonus') return null
  const { bonus } = state.game.progress
  if (bonus.phase.kind !== 'judging') return null
  const player = bonusPlayerOf(state.game)
  if (player === null || player.kind.type === 'bot') return null
  return {
    requestId: bonus.phase.requestId,
    attempt: bonus.phase.attempt,
    question: bonus.question.answer,
    expected: bonus.expected,
  }
}

/**
 * Identité de l'étape bonus en cours, ou `null` hors de cette étape. Sert
 * uniquement à remettre à zéro le coupe-circuit de crédit à l'entrée d'une
 * nouvelle étape bonus. Il n'y a plus de manches pour indexer ce compteur
 * (contrairement à l'ancien `MAX_JUDGE_CALLS_PER_ROUND`, remis à zéro par
 * manche) : une seule étape bonus existe par partie, et `bonus.by` croisé
 * avec l'identifiant de sa question suffit à la distinguer de celle d'une
 * partie précédente — en pratique toujours jouée par un autre joueur ou sur
 * une autre question, le tirage d'énigme n'étant jamais figé d'une partie à
 * l'autre.
 */
function bonusStageKey(state: GameState): string | null {
  if (state.kind !== 'playing' || state.game.progress.kind !== 'bonus') return null
  const { bonus } = state.game.progress
  return `${bonus.by}:${bonus.question.id}`
}

export interface GameEffectDeps {
  readonly rng: Rng
  /** Compteur monotone de rotation, **partagé** avec la commande `spin` du provider. */
  readonly nextSpinId: () => number
  /**
   * Identifiant de requête pour un futur appel à un juge LLM. Consommé par le
   * ticket de bot (voir plus bas) : un bot répondant à l'étape bonus doit
   * porter un `requestId`, comme le ferait un humain via `answerBonus`.
   */
  readonly newRequestId: () => string
  /** Juge créé au dernier moment : la clé ne survit pas au-delà de l'appel. */
  readonly getJudge: () => Judge | null
  readonly onJudgeFailure: (reason: JudgeErrorReason) => void
}

/**
 * Seul producteur d'effets sur la partie. Le tour de bot (rotation, lettre,
 * résolution, étape bonus) et le driver du juge LLM vivent ici et nulle part
 * ailleurs. Quatre fichiers produisant des effets sur le même état, ce serait
 * quatre sources de course.
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
   * Tour de bot : rotation, achat de voyelle, consonne, tentative de
   * résolution ou coup de l'étape bonus. `botKey` change à chaque décision
   * réellement nouvelle du bot et reste stable pour un même état — c'est cette
   * clé qui fait la dépendance d'effet, jamais `state`, sous peine de
   * replanifier le minuteur en boucle.
   */
  useEffect(() => {
    if (botKey === null) return
    const timer = setTimeout(() => {
      const current = stateRef.current
      if (current.kind !== 'playing') return
      // Les identifiants sont tirés **ici**, à l'échéance du minuteur, jamais
      // au montage de l'effet : StrictMode double-invoque les effets, donc les
      // tirer au montage en consommerait deux par décision.
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

  const human = humanBonus(state)
  // Primitives dérivées, jamais `human` lui-même en dépendance : un nouvel
  // objet à chaque rendu replanifierait l'effet en boucle. `null` par défaut
  // équivaut alors à « rien à envoyer », et le premier `if` de l'effet couvre
  // aussi bien l'absence de jugement en cours que celle d'un joueur humain.
  const humanRequestId = human?.requestId ?? null
  const humanAttempt = human?.attempt ?? null
  const humanQuestion = human?.question ?? null
  const humanExpected = human?.expected ?? null
  const stageKey = bonusStageKey(state)

  // Requêtes déjà envoyées au juge : parade à la double invocation de
  // StrictMode. Sans ce filet, chaque réponse partirait deux fois sur le
  // réseau, donc deux appels facturés — c'est le seul endroit du projet où un
  // effet doublé coûte de l'argent.
  const sentJudgeRequestIds = useRef<Set<string>>(new Set())
  // Coupe-circuit de crédit : compteur d'appels réellement envoyés pour
  // l'étape bonus en cours, remis à zéro quand `stageKey` change.
  const judgeCallCountRef = useRef(0)
  const judgeCallStageRef = useRef<string | null>(null)

  /**
   * Réponse humaine à l'étape bonus : confirme localement, sinon envoie la
   * tentative au juge et dispatch le verdict.
   *
   * Le nettoyage de cet effet ne pose **aucun** drapeau d'annulation qui
   * conditionnerait le `dispatch` du résultat — ce serait le réflexe habituel,
   * et il serait faux ici : avec le `Set` de `requestId` déjà envoyés, le
   * second montage de StrictMode sortirait tôt via ce `Set`, donc le premier
   * montage se retrouverait « annulé » par son propre cleanup, et aucun
   * verdict ne serait jamais dispatché — la partie resterait figée en
   * `judging`. L'obsolescence est déjà gérée par le reducer, qui ignore un
   * `bonus/verdict` ou un `bonus/failed` dont le `requestId` ne correspond
   * plus à la phase courante ; il n'y a donc rien à annuler ici.
   */
  useEffect(() => {
    if (
      humanRequestId === null ||
      humanAttempt === null ||
      humanQuestion === null ||
      humanExpected === null
    ) {
      return
    }
    // Voir la documentation ci-dessus : seule garde nécessaire contre le
    // double envoi de StrictMode.
    if (sentJudgeRequestIds.current.has(humanRequestId)) return
    sentJudgeRequestIds.current.add(humanRequestId)

    // Confirmation locale avant le réseau : `matchesAnswer` ne peut que
    // **confirmer**, jamais réfuter. Une réponse juste peut être lexicalement
    // très éloignée de l'attendu (« la ville de Canberra » pour « CANBERRA »),
    // donc son échec ne prouve rien et doit partir au juge — ne pas
    // « l'optimiser » un jour en un court-circuit négatif. C'est le cas le
    // plus fréquent (une réponse tapée telle quelle) qu'elle économise, en
    // argent et en latence, en évitant tout appel réseau.
    if (matchesAnswer(humanAttempt, humanExpected)) {
      dispatch({ type: 'bonus/verdict', requestId: humanRequestId, correct: true })
      return
    }

    if (judgeCallStageRef.current !== stageKey) {
      judgeCallStageRef.current = stageKey
      judgeCallCountRef.current = 0
    }

    // Garde-fou contre notre propre code, pas contre le joueur : voir
    // `MAX_BONUS_JUDGE_CALLS`. `'network'` est la raison la moins fausse : le
    // juge n'a effectivement pas été joint.
    if (judgeCallCountRef.current >= MAX_BONUS_JUDGE_CALLS) {
      if (import.meta.env.DEV) {
        console.error(
          `Coupe-circuit du juge bonus atteint (${MAX_BONUS_JUDGE_CALLS} appels, requestId=${humanRequestId}) : la partie a peut-être une boucle d'effet.`,
        )
      }
      onJudgeFailure('network')
      dispatch({ type: 'bonus/failed', requestId: humanRequestId, reason: 'network' })
      return
    }
    judgeCallCountRef.current += 1

    const judge = getJudge()
    // La partie ne devrait jamais atteindre `judging` sans juge —
    // `config.bonusEnabled` l'interdit — mais la clé a pu être effacée
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
      dispatch({ type: 'bonus/failed', requestId: humanRequestId, reason: 'unauthorized' })
      return
    }

    // Le contrat dit que `judgeBonus` ne lève jamais, mais un juge tiers mal
    // écrit ne doit pas figer la partie : on enveloppe quand même l'appel.
    judge
      .judgeBonus({ question: humanQuestion, expected: humanExpected, attempt: humanAttempt })
      .then((result) => {
        if (result.kind === 'verdict') {
          dispatch({ type: 'bonus/verdict', requestId: humanRequestId, correct: result.correct })
          return
        }
        onJudgeFailure(result.reason)
        dispatch({ type: 'bonus/failed', requestId: humanRequestId, reason: result.reason })
      })
      .catch(() => {
        onJudgeFailure('network')
        dispatch({ type: 'bonus/failed', requestId: humanRequestId, reason: 'network' })
      })
  }, [
    humanRequestId,
    humanAttempt,
    humanQuestion,
    humanExpected,
    stageKey,
    dispatch,
    getJudge,
    onJudgeFailure,
  ])
}
