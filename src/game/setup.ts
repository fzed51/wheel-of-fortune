import type { GameConfig, Player } from './types'
import { asPlayerId } from './types'

/**
 * Montage d'une partie neuve, **pur** : les réglages entrent, la configuration et
 * la table des joueurs sortent.
 *
 * `Setup` recopie les champs utiles plutôt que de recevoir un `Settings` : `game/`
 * ne doit rien savoir de `storage/`, sinon le moteur dépendrait de la forme du
 * localStorage et ne se testerait plus seul.
 */
export interface Setup {
  readonly roundCount: number
  readonly opponents: number
  readonly botLevel: 'easy' | 'normal'
  /** Vrai si et seulement si un juge est disponible. */
  readonly resolveEnabled: boolean
}

/** Prix d'une voyelle. Figé ici : c'est une règle du jeu, pas un réglage. */
export const VOWEL_COST = 250

/** Plancher de gain d'une manche, pour qu'une manche gagnée aux voyelles rapporte. */
export const MIN_ROUND_PRIZE = 500

export const HUMAN_ID = asPlayerId('you')
export const HUMAN_NAME = 'Vous'

export const MIN_ROUNDS = 1
export const MAX_ROUNDS = 10
export const MAX_OPPONENTS = 3

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(Math.max(Math.trunc(value), min), max)
}

/**
 * Les bornes sont réappliquées ici alors que `decodeSettings` les garantit déjà :
 * les réglages passent aussi par l'interface, et une manche de plus coûte moins
 * cher à borner deux fois qu'à déboguer une partie de zéro manche.
 */
export function configFrom(setup: Setup): GameConfig {
  return {
    roundCount: clamp(setup.roundCount, MIN_ROUNDS, MAX_ROUNDS),
    vowelCost: VOWEL_COST,
    minRoundPrize: MIN_ROUND_PRIZE,
    resolveEnabled: setup.resolveEnabled,
  }
}

/** Le joueur humain est toujours le siège 0 : l'accueil promet « à vous de commencer ». */
export function playersFrom(setup: Setup): readonly Player[] {
  const opponents = clamp(setup.opponents, 0, MAX_OPPONENTS)
  const bots = Array.from({ length: opponents }, (_, index) => ({
    id: asPlayerId(`bot-${index + 1}`),
    name: `Bot ${index + 1}`,
    kind: { type: 'bot' as const, level: setup.botLevel },
    total: 0,
    pot: 0,
  }))
  return [
    { id: HUMAN_ID, name: HUMAN_NAME, kind: { type: 'human' }, total: 0, pot: 0 },
    ...bots,
  ]
}
