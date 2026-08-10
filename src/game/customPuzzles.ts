import { QUESTION_CATEGORY } from './bonus'
import { normalizeAnswer } from './puzzle'
import type { Puzzle, PuzzleId } from './types'
import { asPuzzleId } from './types'
import { draftIssues, type PuzzleDraft, type PuzzleIssue } from './validate'

/** Les identifiants perso sont préfixés : ils ne peuvent jamais heurter ceux du catalogue (`exp-001`). */
export const CUSTOM_ID_PREFIX = 'user-'

/**
 * Entrée d'un fichier importé. Structurellement compatible avec `ImportedPuzzle`
 * de `src/storage/codec.ts` — même forme, `id`, `answer`, `category`, et
 * `bonusAnswer` hérité de `PuzzleDraft` — mais le type n'est **pas** importé
 * depuis là : `storage/` importe déjà `game/`, et l'inverse ferait un cycle
 * entre les deux dossiers. TypeScript étant structurel, une valeur
 * `ImportedPuzzle` satisfait `ImportedDraft` sans aucun import.
 */
export interface ImportedDraft extends PuzzleDraft {
  readonly id: string | null
}

export type SaveResult =
  | { readonly ok: true; readonly puzzles: readonly Puzzle[] }
  | { readonly ok: false; readonly issues: readonly PuzzleIssue[] }

/**
 * Numéro d'un identifiant perso, ou `null` si l'identifiant n'en est pas un.
 *
 * Les identifiants du catalogue sont **délibérément ignorés** : seul un autre
 * `user-…` peut entrer en collision, le préfixe suffisant à séparer les deux
 * espaces. Les compter donnerait `user-005` à la première énigme créée
 * aujourd'hui, et `user-201` le jour où le catalogue atteindra la taille prévue
 * — un numéro qui ne veut rien dire pour celui qui le lit.
 */
function customNumber(id: string): number | null {
  const match = new RegExp(`^${CUSTOM_ID_PREFIX}(\\d+)$`).exec(id)
  const digits = match?.[1]
  return digits === undefined ? null : Number.parseInt(digits, 10)
}

/**
 * Numéro libre : le plus grand numéro perso déjà pris, plus un. Jamais
 * d'horodatage ni d'aléa — reproductible en test et lisible dans un fichier
 * exporté corrigé à la main. Calculé sur le maximum réel plutôt que sur
 * `taken.length + 1` : une liste trouée (après une suppression) ne doit pas
 * réutiliser un numéro toujours présent ailleurs dans `taken`.
 */
export function nextCustomId(taken: readonly Puzzle[]): PuzzleId {
  let max = 0
  for (const puzzle of taken) {
    const value = customNumber(puzzle.id)
    if (value !== null && value > max) max = value
  }
  const next = max + 1
  // `padStart` ne tronque jamais : au-delà de 999, le nombre déborde le format
  // sur trois chiffres sans casser (`user-1000`).
  return asPuzzleId(`${CUSTOM_ID_PREFIX}${String(next).padStart(3, '0')}`)
}

/** Brouillon normalisé avant validation et stockage : forme canonique unique. */
function normalizeDraft(draft: PuzzleDraft): PuzzleDraft {
  const answer = normalizeAnswer(draft.answer)
  const category = draft.category.trim()
  // Le champ « réponse attendue » n'apparaît dans le formulaire que pour la
  // catégorie « Question » : un utilisateur qui la saisit puis change de
  // catégorie laisserait sinon une énigme ordinaire porter une réponse bonus
  // fantôme, invisible à l'écran, qui ferait ouvrir une étape bonus sur une
  // manche qui n'en est pas une. On l'écarte donc dès que la catégorie n'est
  // plus « Question », quelle que soit la saisie.
  if (category !== QUESTION_CATEGORY) return { answer, category }
  const bonusAnswer = normalizeAnswer(draft.bonusAnswer ?? '')
  // Vide après normalisation vaut absent, pas présent et vide : le reste du
  // code distingue les deux (`Object.hasOwn`), et une clé vide traverserait
  // la persistance pour ne rien dire.
  return bonusAnswer.length === 0 ? { answer, category } : { answer, category, bonusAnswer }
}

/**
 * Assemble un `Puzzle` avec `bonusAnswer` posé seulement quand il est présent
 * — même motif que `snapshotPuzzle` (`src/game/engine.ts`) et `copyPuzzle`
 * (`src/storage/snapshot.ts`) : une clé posée à `undefined` resterait dans
 * l'objet et fausserait les comparaisons (`toEqual`, `Object.hasOwn`).
 * Partagée entre `saveCustomPuzzle` et `mergeImported` pour qu'un seul endroit
 * décide de cet assemblage, plutôt que deux qui finiraient par diverger.
 */
function buildPuzzle(id: PuzzleId, normalized: PuzzleDraft): Puzzle {
  const base = {
    id,
    answer: normalized.answer,
    category: normalized.category,
    source: 'custom' as const,
  }
  return normalized.bonusAnswer === undefined ? base : { ...base, bonusAnswer: normalized.bonusAnswer }
}

/**
 * Ajoute ou modifie une énigme perso — un seul chemin de validation pour les
 * deux, sinon deux fonctions finiraient par valider différemment.
 *
 * `id === null` pour un ajout, l'identifiant existant pour une modification.
 * Les doublons se cherchent dans tout `pool` (catalogue embarqué compris),
 * l'énigme éditée étant exclue des « autres » pour ne pas devenir son propre
 * doublon.
 */
export function saveCustomPuzzle(
  custom: readonly Puzzle[],
  pool: readonly Puzzle[],
  draft: PuzzleDraft,
  id: PuzzleId | null,
): SaveResult {
  const normalized = normalizeDraft(draft)
  const others = id === null ? pool : pool.filter((puzzle) => puzzle.id !== id)
  const issues = draftIssues(normalized, others)
  if (issues.length > 0) return { ok: false, issues }

  const puzzle = buildPuzzle(id ?? nextCustomId(pool), normalized)

  if (id === null) return { ok: true, puzzles: [...custom, puzzle] }

  const index = custom.findIndex((existing) => existing.id === id)
  if (index === -1) {
    // Identifiant absent de `custom` : ce cas ne devrait pas se produire depuis
    // l'éditeur, mais on ne perd pas la saisie — traité comme un ajout.
    return { ok: true, puzzles: [...custom, puzzle] }
  }
  // Remplacement à sa place : l'ordre de la liste est ce que l'utilisateur voit,
  // une modification qui la déplacerait serait désorientante.
  return { ok: true, puzzles: custom.map((existing, i) => (i === index ? puzzle : existing)) }
}

/** Suppression tolérante : un identifiant absent renvoie la liste inchangée, jamais une exception. */
export function removeCustomPuzzle(custom: readonly Puzzle[], id: PuzzleId): readonly Puzzle[] {
  const filtered = custom.filter((puzzle) => puzzle.id !== id)
  return filtered.length === custom.length ? custom : filtered
}

export interface ImportReport {
  readonly puzzles: readonly Puzzle[]
  readonly added: number
  /** Entrées déjà présentes : ce n'est pas une erreur, ça rend un réimport du même fichier inoffensif. */
  readonly duplicates: number
  /** Entrées refusées pour une autre raison que le doublon. */
  readonly invalid: number
}

/**
 * Fusionne les énigmes d'un fichier importé dans `custom`, dans l'ordre du
 * fichier. Chaque entrée est validée contre `pool` **et** les entrées déjà
 * acceptées du même import : deux lignes identiques dans un même fichier, la
 * seconde est un doublon, sans quoi un fichier qui se répète produirait deux
 * énigmes jumelles. Pour la même raison, le calcul d'un nouvel identifiant
 * prend en compte les entrées déjà acceptées du lot, pas seulement `pool`.
 */
export function mergeImported(
  custom: readonly Puzzle[],
  pool: readonly Puzzle[],
  entries: readonly ImportedDraft[],
): ImportReport {
  const accepted: Puzzle[] = []
  let duplicates = 0
  let invalid = 0

  for (const entry of entries) {
    const normalized = normalizeDraft(entry)
    const taken = [...pool, ...accepted]
    const issues = draftIssues(normalized, taken)
    if (issues.length > 0) {
      // Un refus pour doublon seul est inoffensif (réimport du même fichier).
      // Toute autre raison, même combinée à un doublon, compte comme invalide :
      // le refus le plus informatif gagne.
      const onlyDuplicate = issues.length === 1 && issues[0]?.kind === 'answer-duplicate'
      if (onlyDuplicate) duplicates += 1
      else invalid += 1
      continue
    }

    const takenIds = new Set(taken.map((puzzle) => puzzle.id))
    const wanted = entry.id
    let id: PuzzleId
    if (
      wanted !== null &&
      wanted.length > 0 &&
      wanted.startsWith(CUSTOM_ID_PREFIX) &&
      !takenIds.has(asPuzzleId(wanted))
    ) {
      // Conserver l'identifiant importé : `playedPuzzleIds` d'une partie en
      // cours peut y faire référence, et un identifiant réattribué ferait
      // réapparaître une énigme déjà jouée.
      id = asPuzzleId(wanted)
    } else {
      id = nextCustomId(taken)
    }

    accepted.push(buildPuzzle(id, normalized))
  }

  return {
    puzzles: [...custom, ...accepted],
    added: accepted.length,
    duplicates,
    invalid,
  }
}
