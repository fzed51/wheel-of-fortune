import type { GameAction } from './actions'
import type { Rng } from './rng'
import { pick } from './rng'
import {
  bonusPlayerOf,
  canBuyVowel,
  canSpin,
  currentPlayerOf,
  isStuck,
  progressRatio,
  remainingConsonants,
  remainingVowels,
} from './rules'
import type { Consonant, Game, GameState, RoundState, Vowel } from './types'
import { randomAim, throwFromAim } from './wheel'

/**
 * Consonnes par fréquence décroissante en français. Un bot « normal » descend
 * cette liste, ce qui suffit à le rendre crédible sans lui donner accès à la
 * solution.
 */
const PAR_FREQUENCE: readonly Consonant[] = [
  'S', 'R', 'T', 'N', 'L', 'D', 'C', 'M', 'P', 'V',
  'F', 'Q', 'G', 'B', 'H', 'J', 'X', 'Y', 'Z', 'K', 'W',
]

const VOYELLES_PAR_FREQUENCE: readonly Vowel[] = ['E', 'A', 'I', 'U', 'O']

/**
 * Ce que le bot ne peut pas inventer lui-même : un identifiant de rotation
 * monotone et un identifiant de requête. Ils viennent du driver, comme pour un
 * joueur humain — le reducer ne doit pas pouvoir distinguer les deux.
 *
 * `requestId` avait disparu avec le juge LLM sur le chemin `resolve/attempt` :
 * « Résoudre » ne part plus vers aucun réseau, il n'y avait donc plus de
 * requête à identifier là. Il revient ici pour l'étape bonus, dont
 * `bonus/answer` porte toujours un `requestId` (voir `BonusPhase` dans
 * `types.ts`) — même si le bot ne consulte jamais de juge réseau pour son
 * propre verdict, voir `botBonusIsCorrect`.
 */
export interface BotTicket {
  readonly spinId: number
  readonly requestId: string
}

function choisirConsonne(round: RoundState, facile: boolean, rng: Rng): Consonant | null {
  const restantes = remainingConsonants(round)
  if (restantes.length === 0) return null
  // Un bot « facile » pioche au hasard ; un bot « normal » suit les fréquences.
  if (facile) return pick(rng, restantes) ?? null
  return PAR_FREQUENCE.find((letter) => restantes.includes(letter)) ?? restantes[0] ?? null
}

function choisirVoyelle(round: RoundState): Vowel | null {
  const restantes = remainingVowels(round)
  return VOYELLES_PAR_FREQUENCE.find((letter) => restantes.includes(letter)) ?? restantes[0] ?? null
}

/** Un bot facile réussit moins souvent qu'un bot normal à avancement égal : voir `decideBotAction`. */
export const BOT_EASY_RESOLVE_HANDICAP = 0.75

/**
 * Texte de tentative d'un bot à l'étape bonus. **Marqueur d'occupation**, pas
 * une réponse : il ne doit ni divulguer `bonus.expected`, ni suggérer un
 * verdict — celui-ci est tiré séparément par `botBonusIsCorrect`, sans lien
 * avec le contenu de cette chaîne. Une formule du type « je ne sais pas »
 * serait donc trompeuse le jour où `announce.ts` la rendrait à l'écran : le
 * bot pourrait être déclaré gagnant juste après avoir affirmé ignorer la
 * réponse.
 *
 * Volontairement **différent** de `bonus.expected` : contrairement à
 * `resolve/attempt`, où le bot propose bien `round.puzzle.answer` (une
 * tentative sciemment fausse y laisserait `botTurnKey` identique avant et
 * après, figeant le bot — voir plus bas), la phase de l'étape bonus change
 * déjà entre `awaiting-answer` et `judging`, ce qui suffit à faire avancer
 * `botTurnKey`. Rien n'oblige donc à envoyer la vraie réponse ici, et
 * `announce.ts` pourrait rendre `action.attempt` : l'envoyer ferait fuiter la
 * solution dans une annonce, alors qu'elle n'est révélée nulle part ailleurs à
 * l'écran pendant l'étape.
 */
export const BONUS_BOT_ATTEMPT = 'Réponse du bot.'

/**
 * Seuil de réussite du bot à l'étape bonus : `botBonusIsCorrect` rend vrai en
 * dessous de ce seuil.
 */
export const BONUS_BOT_SUCCESS = 0.5

/**
 * Verdict du bot sur sa propre tentative à l'étape bonus. Hasard pur,
 * indépendant du niveau du bot : au moment du bonus l'énoncé de la question
 * est entièrement révélé, une pondération par `progressRatio` vaudrait
 * toujours 1. Le bot ne passe jamais par un juge réseau — c'est lui-même qui
 * tranche, comme le faisait l'ancien `botResolveIsCorrect` avant que
 * « Résoudre » ne devienne un verdict déterministe du reducer.
 */
export function botBonusIsCorrect(rng: Rng): boolean {
  return rng() < BONUS_BOT_SUCCESS
}

/**
 * Décision d'un bot, **pure** et à aléa injecté. Les candidats sont exactement
 * ceux que `legalActions` autorise : le bot est donc structurellement incapable
 * de bloquer la partie, et ne renvoie `null` que là où il n'a rien à décider
 * (rotation en cours, manche terminée) ou quand c'est à un humain de jouer.
 *
 * Un seul point d'équité avec le joueur : le bot emprunte les mêmes actions
 * que l'humain, donc le même chemin de code dans le reducer — `resolve/attempt`
 * compris, dont le verdict est tranché par `matchesAnswer`, sans faveur ni
 * pénalité pour un bot.
 */
export function decideBotAction(game: Game, rng: Rng, ticket: BotTicket): GameAction | null {
  if (game.progress.kind === 'bonus') {
    const bonusPlayer = bonusPlayerOf(game)
    // Garde d'équité, symétrique à celle sur `currentPlayerOf` plus bas : un
    // driver fautif ne doit pas pouvoir jouer l'étape bonus à la place d'un
    // humain.
    if (bonusPlayer === null || bonusPlayer.kind.type !== 'bot') return null

    const { phase } = game.progress.bonus
    if (phase.kind === 'awaiting-answer') {
      // `BONUS_BOT_ATTEMPT`, jamais `bonus.expected` : voir sa documentation,
      // la réponse attendue ne doit fuiter dans aucune action ni annonce.
      return {
        type: 'bonus/answer',
        by: bonusPlayer.id,
        attempt: BONUS_BOT_ATTEMPT,
        requestId: ticket.requestId,
      }
    }
    // Le bot tranche lui-même son verdict, il ne passe jamais par un juge
    // réseau — comme le faisait l'ancien `botResolveIsCorrect` avant que
    // « Résoudre » ne devienne un verdict déterministe du reducer. Le
    // `requestId` renvoyé est celui de la phase, pas celui du ticket : c'est
    // lui que le reducer compare pour rejeter un verdict périmé.
    return { type: 'bonus/verdict', requestId: phase.requestId, correct: botBonusIsCorrect(rng) }
  }

  if (game.progress.kind !== 'round') return null

  const player = currentPlayerOf(game)
  // Garde d'équité : un driver fautif ne doit pas pouvoir jouer à la place d'un humain.
  if (player.kind.type !== 'bot') return null

  const facile = player.kind.level === 'easy'
  const round = game.progress.round
  const by = player.id

  if (round.phase.kind === 'awaiting-consonant') {
    const letter = choisirConsonne(round, facile, rng)
    return letter === null ? null : { type: 'letter/consonant', by, letter }
  }

  if (round.phase.kind !== 'awaiting-action') return null

  const avancement = progressRatio(round)
  // Un bot facile attend d'en voir bien plus avant de se risquer à répondre.
  const seuilResolution = facile ? 0.85 : 0.7
  // Le bot ne tente que lorsqu'il « sait » : il tire d'abord s'il a trouvé, et
  // ne propose alors QUE la vraie solution (`round.puzzle.answer`, jamais un
  // texte de remplacement). Une tentative sciemment fausse laisserait
  // `botTurnKey` identique avant et après l'action (mêmes `round.index`,
  // `player.id`, `phase.kind`, `guessed.length`, `pot`) : l'effet du driver ne
  // se replanifierait pas, et le bot resterait muet, la partie figée. Jusqu'ici
  // seule la phase `resolving` interposait un `botTurnKey === null` entre deux
  // décisions ; elle a disparu du contrat.
  //
  // Le bot facile garde un handicap multiplicatif : `decideBotAction` lui
  // impose déjà un seuil de tentative plus haut (0,85 contre 0,7), sans lui il
  // réussirait *plus* souvent qu'un bot normal, l'inverse de ce qu'annonce son
  // nom.
  const handicap = facile ? BOT_EASY_RESOLVE_HANDICAP : 1
  if (avancement >= seuilResolution && rng() < avancement * handicap) {
    // Cette action **contient la solution**. Elle n'est ni persistée ni
    // rendue nulle part — à condition que `announce.ts` ne la laisse pas
    // fuiter, ce qu'un test dédié vérifie.
    return { type: 'resolve/attempt', by, attempt: round.puzzle.answer }
  }

  // Acheter tôt : une voyelle révélée oriente les consonnes suivantes. On garde
  // de la marge pour ne pas se retrouver sans cagnotte.
  const marge = player.pot >= game.config.vowelCost * 2
  const tot = avancement < seuilResolution
  const achete = facile ? rng() < 0.5 : true
  if (canBuyVowel(game) && marge && tot && achete) {
    const letter = choisirVoyelle(round)
    if (letter !== null) return { type: 'letter/buy-vowel', by, letter }
  }

  if (canSpin(game)) {
    return { type: 'wheel/spin', by, thrown: throwFromAim(randomAim(rng), rng, ticket.spinId) }
  }

  // À partir d'ici, tourner est impossible : la voyelle reste une option
  // stratégique tant qu'elle est finançable, sans condition d'avancement — on
  // ne laisse pas une marge ou un seuil de côté juste parce que la roue est
  // hors jeu.
  if (canBuyVowel(game)) {
    const letter = choisirVoyelle(round)
    if (letter !== null) return { type: 'letter/buy-vowel', by, letter }
  }

  // Sortie de secours : plus aucune consonne à tirer, pas de voyelle
  // abordable. Proposer la solution sans condition ferait gagner le bot à
  // toutes les fins de manche serrées, alors que le tirage ci-dessus ne l'a
  // pas jugé assez sûr de lui ; `isStuck` ne teste plus `canResolve` (voir
  // `rules.ts`), donc `turn/pass` reste la seule issue légale ici.
  if (isStuck(game)) return { type: 'turn/pass', by }

  return null
}

/**
 * Pause de lisibilité avant qu'un bot ne joue son coup — pas une simulation de
 * réflexion : le joueur doit voir la main changer avant que l'action n'arrive.
 * Le tirage de roue a sa propre durée (entre `SPIN_MIN_MS` et `SPIN_MAX_MS`
 * dans `game/wheel.ts`), qui
 * s'ajoute par-dessus plutôt que de s'y substituer. Elle vit ici, et non dans
 * le driver, pour que les tests avancent leurs horloges de la valeur exacte au
 * lieu d'en recopier une.
 */
export const BOT_DELAY_MS = 800

/**
 * Clé primitive de décision : c'est elle que le driver dépose en dépendance de
 * son `useEffect`, à la place de l'objet d'état. Dépendre de l'état
 * replanifierait le minuteur du bot à chaque changement, ce qui est le
 * générateur de boucles du projet.
 *
 * `null` signifie « le bot n'a rien à décider maintenant ». Sinon la clé doit
 * **changer** à chaque décision réellement nouvelle du bot (sinon il resterait
 * muet après son premier coup) et rester **stable** pour un même état (sinon
 * l'effet se replanifierait sans fin) : ni horloge, ni identifiant tiré ici.
 */
export function botTurnKey(state: GameState): string | null {
  if (state.kind !== 'playing') return null
  const { game } = state

  if (game.progress.kind === 'bonus') {
    const bonusPlayer = bonusPlayerOf(game)
    if (bonusPlayer === null || bonusPlayer.kind.type !== 'bot') return null
    // La phase entre dans la clé : c'est elle qui change entre la réponse et le
    // verdict, sans quoi le bot répondrait puis resterait muet pour toujours,
    // la partie figée en `judging`.
    return `bonus:${bonusPlayer.id}:${game.progress.bonus.phase.kind}`
  }

  if (game.progress.kind !== 'round') return null
  // Narrowing direct sur `game.progress.round`, sans passer par un alias
  // intermédiaire : TypeScript ne transporte pas le rétrécissement de
  // `progress.kind` à travers une variable qui l'aurait capturé séparément.
  const { round } = game.progress
  if (round.phase.kind !== 'awaiting-action' && round.phase.kind !== 'awaiting-consonant') {
    return null
  }
  const player = currentPlayerOf(game)
  if (player.kind.type !== 'bot') return null
  return `${round.index}:${player.id}:${round.phase.kind}:${round.guessed.length}:${player.pot}`
}
