import { QUESTION_CATEGORY } from './bonus'
import { foldForCompare } from './compare'
import { isConsonant, isVowel, lettersOf, normalizeAnswer } from './puzzle'
import type { Puzzle } from './types'

/**
 * Contraintes qui rendent une énigme jouable. Source unique partagée entre le
 * test du catalogue (`src/data/puzzles/puzzles.test.ts`) et l'éditeur d'énigmes
 * perso : les deux doivent accepter et refuser exactement les mêmes énoncés.
 *
 * `draftIssues` suppose `draft.answer` déjà normalisé par `normalizeAnswer` :
 * c'est l'appelant qui normalise, parce que la saisie doit être normalisée
 * avant d'être affichée dans la grille, pas seulement avant d'être validée.
 *
 * La catégorie « Question » (`QUESTION_CATEGORY`) porte des contraintes en
 * plus, sur la réponse attendue (`bonusAnswer`) : voir `bonus-empty` et
 * `bonus-in-answer` plus bas.
 */

export const ANSWER_MIN_LENGTH = 10
/** Au-delà, la grille devient illisible sur un écran de 360 px. */
export const ANSWER_MAX_LENGTH = 42
export const MIN_DISTINCT_CONSONANTS = 3
export const MIN_DISTINCT_VOWELS = 2
export const CATEGORY_MAX_LENGTH = 30

/** Majuscules accentuées, espace, apostrophe droite et trait d'union. Ni chiffre, ni autre ponctuation. */
export const ANSWER_CHARS = /^[A-ZÀÂÄÇÉÈÊËÎÏÔÖÙÛÜŸ' -]+$/

export interface PuzzleDraft {
  readonly answer: string
  readonly category: string
  /** Réponse attendue d'une question. Voir `Puzzle.bonusAnswer`. */
  readonly bonusAnswer?: string
}

export type PuzzleIssue =
  | { readonly kind: 'answer-empty' }
  | { readonly kind: 'answer-too-short' }
  | { readonly kind: 'answer-too-long' }
  | { readonly kind: 'answer-bad-chars'; readonly chars: readonly string[] }
  | { readonly kind: 'answer-few-consonants' }
  | { readonly kind: 'answer-few-vowels' }
  | { readonly kind: 'answer-duplicate' }
  | { readonly kind: 'category-empty' }
  | { readonly kind: 'category-too-long' }
  // Préfixe `bonus-` choisi exprès et pas `answer-bonus-…` : PuzzleForm.tsx
  // trie les problèmes avec `issue.kind.startsWith('answer-')`, un préfixe qui
  // commencerait par `answer-` serait rangé à tort dans les problèmes d'énoncé.
  | { readonly kind: 'bonus-empty' }
  | { readonly kind: 'bonus-in-answer' }

/** Caractères refusés par `ANSWER_CHARS`, dédoublonnés et dans leur ordre d'apparition. */
function badChars(answer: string): readonly string[] {
  const seen = new Set<string>()
  for (const char of answer) {
    if (!ANSWER_CHARS.test(char)) seen.add(char)
  }
  return [...seen]
}

/**
 * Renvoie tous les problèmes d'un brouillon, pas seulement le premier :
 * l'utilisateur corrige en une passe. Ordre stable : énoncé puis catégorie,
 * dans l'ordre de déclaration de `PuzzleIssue`.
 */
export function draftIssues(draft: PuzzleDraft, others: readonly Puzzle[]): readonly PuzzleIssue[] {
  const issues: PuzzleIssue[] = []
  const { answer, category } = draft

  if (answer.length === 0) {
    // Un champ vide n'est pas « trop court » : un seul des deux au maximum.
    issues.push({ kind: 'answer-empty' })
  } else {
    if (answer.length < ANSWER_MIN_LENGTH) issues.push({ kind: 'answer-too-short' })
    if (answer.length > ANSWER_MAX_LENGTH) issues.push({ kind: 'answer-too-long' })

    const rejected = badChars(answer)
    if (rejected.length > 0) issues.push({ kind: 'answer-bad-chars', chars: rejected })

    const letters = [...lettersOf(answer)]
    if (letters.filter(isConsonant).length < MIN_DISTINCT_CONSONANTS) {
      issues.push({ kind: 'answer-few-consonants' })
    }
    if (letters.filter(isVowel).length < MIN_DISTINCT_VOWELS) {
      issues.push({ kind: 'answer-few-vowels' })
    }

    // Une énigme du catalogue est déjà canonique, mais rien ne le garantit
    // pour un import : on normalise les deux côtés de la comparaison.
    const normalized = normalizeAnswer(answer)
    const isDuplicate = others.some((other) => normalizeAnswer(other.answer) === normalized)
    if (isDuplicate) issues.push({ kind: 'answer-duplicate' })
  }

  if (category.length === 0) {
    issues.push({ kind: 'category-empty' })
  } else if (category.length > CATEGORY_MAX_LENGTH) {
    issues.push({ kind: 'category-too-long' })
  }

  // Poussés après les problèmes de catégorie, pour que l'ordre de `draftIssues`
  // suive l'ordre des champs du formulaire : énoncé, catégorie, réponse
  // attendue. Aucune contrainte de caractères ici (pas d'`ANSWER_CHARS`) : la
  // réponse attendue n'est jamais affichée dans la grille ni tapée au clavier
  // virtuel, elle est seulement comparée par pliage (`foldForCompare`) — donc
  // « 1789 » est une réponse attendue parfaitement légitime, chiffres compris.
  if (category === QUESTION_CATEGORY) {
    const foldedBonus = foldForCompare(draft.bonusAnswer ?? '')
    if (foldedBonus.length === 0) {
      // Une question sans réponse attendue n'ouvrirait aucune étape bonus, et
      // la catégorie mentirait au joueur.
      issues.push({ kind: 'bonus-empty' })
    } else if (foldForCompare(answer).includes(foldedBonus)) {
      // « LA CAPITALE DE L'AUSTRALIE EST-ELLE CANBERRA » révélerait le bonus
      // lettre par lettre au fil de la grille, la question n'aurait plus rien
      // à gagner. Calculé seulement quand la réponse attendue n'est pas vide :
      // sinon `''.includes('')` déclencherait ce problème sur toute question
      // vide, en double avec `bonus-empty`.
      issues.push({ kind: 'bonus-in-answer' })
    }
  }

  return issues
}

/** Phrase française courte, prête à s'afficher sous le champ concerné. */
export function issueMessage(issue: PuzzleIssue): string {
  switch (issue.kind) {
    case 'answer-empty':
      return 'Saisissez une énigme.'
    case 'answer-too-short':
      return `Au moins ${ANSWER_MIN_LENGTH} caractères.`
    case 'answer-too-long':
      return `${ANSWER_MAX_LENGTH} caractères au plus, la grille devient illisible au-delà.`
    case 'answer-bad-chars':
      // Dire ce qui est refusé ne suffit pas : sans la liste de ce qui est
      // accepté, un chiffre refusé ne dit pas par quoi le remplacer.
      return `Caractères refusés : ${issue.chars.join(', ')}. Seulement des lettres, l’espace, l’apostrophe et le trait d’union.`
    case 'answer-few-consonants':
      return `Au moins ${MIN_DISTINCT_CONSONANTS} consonnes différentes.`
    case 'answer-few-vowels':
      return `Au moins ${MIN_DISTINCT_VOWELS} voyelles différentes.`
    case 'answer-duplicate':
      return 'Cette énigme existe déjà.'
    case 'category-empty':
      return 'Choisissez une catégorie.'
    case 'category-too-long':
      return `${CATEGORY_MAX_LENGTH} caractères au plus pour la catégorie.`
    case 'bonus-empty':
      return 'Une question doit avoir une réponse attendue.'
    case 'bonus-in-answer':
      return 'La réponse attendue ne doit pas figurer dans l’énoncé : la grille la révélerait lettre par lettre.'
  }
}
