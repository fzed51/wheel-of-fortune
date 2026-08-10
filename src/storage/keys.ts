/**
 * Clés de stockage, **versionnées enregistrement par enregistrement** et non par
 * un préfixe global : changer la forme des réglages ne doit pas invalider les
 * énigmes perso, qui sont le seul contenu irremplaçable.
 *
 * La clé Mistral a sa propre entrée, séparée des réglages : c'est ce qui garantit
 * qu'aucun objet exportable, journalisable ou affichable ne la contient.
 */
export const STORAGE_KEYS = {
  settings: 'wof:settings:1',
  puzzles: 'wof:puzzles:1',
  save: 'wof:save:1',
  mistral: 'wof:mistral-key:1',
} as const

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS]

/** Toutes les clés, pour le bouton « Réinitialiser les données » des Réglages. */
export const ALL_KEYS: readonly StorageKey[] = Object.values(STORAGE_KEYS)

/**
 * Version inscrite **dans** la charge utile, en plus de celle portée par la clé.
 * Les deux ne servent pas à la même chose : la version de la clé signale un
 * changement de forme voulu (l'ancienne entrée est simplement ignorée), celle de
 * la charge utile permet de reconnaître une donnée écrite par une version
 * ultérieure de l'application — cas réel après un retour arrière de déploiement.
 *
 * Règle générale : tout changement de `WHEEL` ou de forme persistée incrémente
 * `SCHEMA_VERSION`. Ici, le rééquilibrage de la roue change les montants associés
 * à certains index ; une sauvegarde figée en `awaiting-consonant` sur un `Segment`
 * de l'ancien barème resterait valide pour `isSegment` (l'index reste dans les
 * bornes) mais ferait encaisser un montant qui n'existe plus sur la roue actuelle.
 *
 * 2 → 3 : l'étape bonus de la manche finale. Trois champs n'existent pas dans
 * une sauvegarde antérieure : `config.bonusEnabled`, `progress.kind === 'bonus'`
 * et `game-over.bonus`. `isConfig` exige désormais `bonusEnabled` ; sans ce
 * bump, une sauvegarde de la version précédente tomberait en `fail('invalid')`
 * — message qui laisse croire à une corruption plutôt qu'à une version dépassée,
 * là où `fail('version')` est le chemin prévu (et testé) pour ce cas.
 */
export const SCHEMA_VERSION = 3
