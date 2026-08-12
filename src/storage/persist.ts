import type { Game, Puzzle } from '../game/types'
import {
  decodeGame,
  decodePuzzles,
  decodeSettings,
  encodeRecord,
  type Decoded,
} from './codec'
import { ALL_KEYS, LEGACY_KEYS, STORAGE_KEYS } from './keys'
import { demasquer, masquer } from './mask'
import type { Settings } from './settings'
import { fromPersisted, toPersisted } from './snapshot'

/**
 * Seul accès au stockage du navigateur. Rien ici ne lève, et rien ici ne
 * journalise : `localStorage` échoue pour des raisons banales — Safari en
 * navigation privée, quota atteint, iframe cloisonnée — et un `console.log` de
 * cette couche finirait tôt ou tard par imprimer la clé Mistral.
 */

/**
 * Repli en mémoire. Il ne survit pas au rechargement : son rôle est de garder la
 * session cohérente quand l'écriture est refusée, pas de remplacer le stockage.
 */
const memory = new Map<string, string>()

function storage(): Storage | null {
  try {
    // L'accès lui-même peut lever, avant tout appel de méthode.
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function readRaw(key: string): Decoded<string> {
  const store = storage()
  if (store !== null) {
    try {
      const raw = store.getItem(key)
      if (raw !== null) return { ok: true, value: raw }
    } catch {
      return { ok: false, reason: 'unreadable' }
    }
  }
  // Absent du stockage : la valeur peut malgré tout avoir été écrite pendant cette
  // session, si `setItem` avait été refusé.
  const cached = memory.get(key)
  if (cached !== undefined) return { ok: true, value: cached }
  return { ok: false, reason: 'absent' }
}

/** Vrai si l'écriture a atteint le stockage durable. */
function writeRaw(key: string, value: string): boolean {
  memory.set(key, value)
  const store = storage()
  if (store === null) return false
  try {
    store.setItem(key, value)
    return true
  } catch {
    return false
  }
}

function removeRaw(key: string): void {
  memory.delete(key)
  const store = storage()
  if (store === null) return
  try {
    store.removeItem(key)
  } catch {
    // Rien à faire : la valeur en mémoire est déjà oubliée.
  }
}

export function loadSettings(): Decoded<Settings> {
  const raw = readRaw(STORAGE_KEYS.settings)
  return raw.ok ? decodeSettings(raw.value) : raw
}

export function saveSettings(settings: Settings): void {
  writeRaw(STORAGE_KEYS.settings, encodeRecord(settings))
}

export function loadCustomPuzzles(): Decoded<readonly Puzzle[]> {
  const raw = readRaw(STORAGE_KEYS.puzzles)
  return raw.ok ? decodePuzzles(raw.value) : raw
}

export function saveCustomPuzzles(puzzles: readonly Puzzle[]): void {
  writeRaw(STORAGE_KEYS.puzzles, encodeRecord(puzzles))
}

/**
 * Reprise de partie. Un échec n'est pas rattrapé : on ne migre **pas** une partie
 * en cours, sa valeur est quasi nulle face au risque de la reprendre à moitié.
 * L'accueil se contente de dire que la précédente n'a pas pu être reprise.
 */
export function loadGame(): Decoded<Game> {
  const raw = readRaw(STORAGE_KEYS.save)
  if (!raw.ok) return raw
  const decoded = decodeGame(raw.value)
  if (!decoded.ok) return decoded
  return { ok: true, value: fromPersisted(decoded.value) }
}

/** Ne lève jamais : une sauvegarde perdue est un désagrément, une exception ici casse le rendu. */
export function saveGame(game: Game): void {
  try {
    writeRaw(STORAGE_KEYS.save, encodeRecord(toPersisted(game)))
  } catch {
    // Sauvegarde abandonnée, la partie continue.
  }
}

export function clearGame(): void {
  removeRaw(STORAGE_KEYS.save)
}

/**
 * Clé Mistral : stockée seule, sans enveloppe ni objet porteur, sous une
 * entrée au nom anodin et masquée par `mask.ts` — pas en clair. Le masque
 * n'est pas un chiffrement, il évite seulement une clé lisible à l'œil nu
 * dans l'inspecteur. Volontairement à part des réglages : il n'existe alors
 * aucune structure susceptible de finir dans un export, un instantané d'état
 * ou un message d'erreur.
 */
export function loadMistralKey(): string | null {
  const raw = readRaw(STORAGE_KEYS.mistral)
  if (raw.ok) {
    const clair = demasquer(raw.value)
    if (clair === null) return null
    const key = clair.trim()
    return key === '' ? null : key
  }
  // Entrée absente : peut-être une clé d'avant le masquage, restée en clair
  // sous l'ancien nom. On la migre silencieusement vers la forme masquée.
  const legacy = readRaw(LEGACY_KEYS[0])
  if (!legacy.ok) return null
  const key = legacy.value.trim()
  if (key === '') return null
  saveMistralKey(key)
  removeRaw(LEGACY_KEYS[0])
  return key
}

export function saveMistralKey(key: string): void {
  const trimmed = key.trim()
  if (trimmed === '') {
    removeRaw(STORAGE_KEYS.mistral)
    return
  }
  writeRaw(STORAGE_KEYS.mistral, masquer(trimmed))
}

export function clearMistralKey(): void {
  removeRaw(STORAGE_KEYS.mistral)
  // Sinon une clé en clair laissée sous l'ancien nom ressusciterait par la
  // migration au prochain chargement.
  removeRaw(LEGACY_KEYS[0])
}

/** Sortie de secours des Réglages : tout est effacé, clé comprise. */
export function clearAllData(): void {
  for (const key of ALL_KEYS) removeRaw(key)
}
