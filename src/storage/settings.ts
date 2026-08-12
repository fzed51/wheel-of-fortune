/**
 * Réglages de l'utilisateur, persistés.
 *
 * **La clé Mistral n'en fait pas partie**, et ne doit jamais y entrer : cet objet
 * finit dans un export JSON, dans un message d'erreur, dans un outil de
 * développement. La clé vit seule sous `STORAGE_KEYS.mistral`.
 */

export const THEMES = ['system', 'light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/**
 * Redit `PlayerKind['level']` du domaine plutôt que de l'importer : un réglage
 * persisté et un état de jeu n'évoluent pas au même rythme, et les coupler
 * obligerait à migrer les réglages à chaque retouche du modèle.
 */
export const BOT_LEVELS = ['easy', 'normal'] as const
export type BotLevel = (typeof BOT_LEVELS)[number]

export const MAX_OPPONENTS = 3
export const MAX_ROUND_COUNT = 10

/**
 * `'gauge'` : lancer à l'arc de visée, deux appuis (armer, puis figer).
 * `'simple'` : un seul clic, l'angle visé est tiré au hasard.
 */
export const THROW_MODES = ['gauge', 'simple'] as const
export type ThrowMode = (typeof THROW_MODES)[number]

/**
 * Vitesse du balayage de l'arc de visée. Nommée plutôt que chiffrée : un
 * réglage persisté qui porterait des millisecondes figerait le barème du jour
 * dans le stockage de l'utilisateur, et le retoucher rendrait sa valeur
 * mensongère. Les durées vivent dans `useAimSweep`, seul endroit qui animera.
 */
export const AIM_SPEEDS = ['slow', 'normal', 'fast', 'extreme'] as const
export type AimSpeed = (typeof AIM_SPEEDS)[number]

export interface Settings {
  readonly theme: Theme
  /** Modèle interrogé par le juge. La clé, elle, n'est jamais ici. */
  readonly mistralModel: string
  readonly roundCount: number
  /** Nombre de bots adverses, 0 pour une partie solo. */
  readonly opponents: number
  readonly botLevel: BotLevel
  readonly throwMode: ThrowMode
  /** Sans effet en mode « lancer simple » : seul le mode « arc de visée » anime quoi que ce soit. */
  readonly aimSpeed: AimSpeed
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  mistralModel: 'mistral-small-latest',
  roundCount: 3,
  opponents: 0,
  botLevel: 'normal',
  throwMode: 'gauge',
  aimSpeed: 'fast',
}
