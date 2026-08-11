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
 * `'gauge'` : lancer à la jauge de puissance, deux appuis (armer, puis relâcher).
 * `'simple'` : un seul clic, la force du lancer est tirée au hasard.
 */
export const THROW_MODES = ['gauge', 'simple'] as const
export type ThrowMode = (typeof THROW_MODES)[number]

export interface Settings {
  readonly theme: Theme
  /** Modèle interrogé par le juge. La clé, elle, n'est jamais ici. */
  readonly mistralModel: string
  readonly roundCount: number
  /** Nombre de bots adverses, 0 pour une partie solo. */
  readonly opponents: number
  readonly botLevel: BotLevel
  readonly throwMode: ThrowMode
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  mistralModel: 'mistral-small-latest',
  roundCount: 3,
  opponents: 0,
  botLevel: 'normal',
  throwMode: 'gauge',
}
