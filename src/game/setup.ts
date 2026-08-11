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
  readonly bonusEnabled: boolean
}

/** Prix d'une voyelle. Figé ici : c'est une règle du jeu, pas un réglage. */
export const VOWEL_COST = 250

/**
 * Plancher de gain d'une manche, pour qu'une manche gagnée aux voyelles rapporte.
 * Calibré sur la moyenne des cases `cash` de la roue (262,5 €) : à 500 €, il
 * dépasserait la cagnotte réelle de la plupart des manches 1 et cesserait d'être
 * un filet de sécurité pour devenir le gain courant.
 */
export const MIN_ROUND_PRIZE = 250

/**
 * Montant fixe de la question bonus de la manche finale, versé au total et
 * jamais multiplié par `multiplierFor` : c'est un forfait, pas un gain de
 * manche. Réglage de règle, pas de partie — n'apparaît donc pas dans `Setup`.
 */
export const BONUS_PRIZE = 500

/**
 * Angle de repos de la roue au montage d'une partie neuve. Aiguille sur le premier
 * segment : c'est une règle de montage (comme le siège 0 pour l'humain), pas un
 * réglage qu'un joueur pourrait choisir.
 */
export const INITIAL_WHEEL_ANGLE = 0

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
    bonusPrize: BONUS_PRIZE,
    bonusEnabled: setup.bonusEnabled,
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
