import type { GameAction } from './actions'
import type { Rng } from './rng'
import { pick } from './rng'
import {
  canBuyVowel,
  canResolve,
  canSpin,
  currentPlayerOf,
  isStuck,
  progressRatio,
  remainingConsonants,
  remainingVowels,
} from './rules'
import type { Consonant, Game, RoundState, Vowel } from './types'
import { pickSpinOutcome } from './wheel'

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
 */
export interface BotTicket {
  readonly spinId: number
  readonly requestId: string
}

/**
 * Texte de tentative d'un bot. Il ne contient **jamais** la solution : l'état de
 * la partie est affiché, et y écrire la réponse la divulguerait au joueur.
 * C'est le driver qui décide si la tentative est bonne, via `resolve/verdict`.
 */
export const BOT_ATTEMPT = 'tentative du bot'

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

/**
 * Décision d'un bot, **pure** et à aléa injecté. Les candidats sont exactement
 * ceux que `legalActions` autorise : le bot est donc structurellement incapable
 * de bloquer la partie, et ne renvoie `null` que là où il n'a rien à décider
 * (rotation en cours, verdict attendu, manche terminée) ou quand c'est à un
 * humain de jouer.
 *
 * Deux points d'équité avec le joueur : le bot respecte `config.resolveEnabled`
 * — sans juge configuré, personne ne résout — et il emprunte les mêmes actions,
 * donc le même chemin de code dans le reducer.
 */
export function decideBotAction(game: Game, rng: Rng, ticket: BotTicket): GameAction | null {
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
  const resoudre = (): GameAction => ({
    type: 'resolve/start',
    by,
    attempt: BOT_ATTEMPT,
    requestId: ticket.requestId,
  })

  if (canResolve(game) && avancement >= seuilResolution) return resoudre()

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
    return { type: 'wheel/spin', by, spin: pickSpinOutcome(rng, ticket.spinId) }
  }

  // À partir d'ici, tourner est impossible : on reprend tout ce qui reste, sans
  // condition de stratégie. C'est ce qui garantit qu'une action légale n'est
  // jamais laissée de côté, donc qu'aucune partie ne se figera sur un bot.
  if (canBuyVowel(game)) {
    const letter = choisirVoyelle(round)
    if (letter !== null) return { type: 'letter/buy-vowel', by, letter }
  }

  if (canResolve(game)) return resoudre()
  if (isStuck(game)) return { type: 'turn/pass', by }

  return null
}
