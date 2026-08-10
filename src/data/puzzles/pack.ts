import { QUESTION_CATEGORY } from '../../game/bonus'
import type { Puzzle } from '../../game/types'
import { asPuzzleId } from '../../game/types'
import type { Category } from '../categories'

/**
 * Une énigme du catalogue : identifiant **écrit à la main**, puis énoncé.
 *
 * L'identifiant n'est jamais dérivé de la position : il sert de clé à
 * `playedPuzzleIds`, et une numérotation calculée décalerait toutes les suivantes
 * dès qu'une énigme est insérée au milieu — les parties en cours changeraient
 * d'énigme sous les pieds du joueur.
 */
export type Entry = readonly [id: string, answer: string]

export function pack(category: Category, entries: readonly Entry[]): readonly Puzzle[] {
  return entries.map(([id, answer]) => ({
    id: asPuzzleId(id),
    answer,
    category,
    source: 'pack',
  }))
}

/**
 * Une question de la manche finale : identifiant, énoncé interrogatif, puis
 * réponse attendue.
 *
 * L'énoncé est une énigme comme les autres — il se joue à la roue, lettre par
 * lettre, et obéit donc aux mêmes contraintes (`ANSWER_CHARS`, longueur,
 * consonnes et voyelles distinctes). C'est ce qui interdit le point
 * d'interrogation final : l'autoriser dans `ANSWER_CHARS` le rendrait légal
 * pour toutes les énigmes, obligerait la grille à fabriquer une case sans
 * information et le clavier à le nommer. La formulation interrogative et la
 * catégorie suffisent à dire au joueur qu'il lit une question.
 */
export type QuestionEntry = readonly [id: string, question: string, expected: string]

/**
 * Aucun paramètre de catégorie, contrairement à `pack` : une question porte
 * forcément `QUESTION_CATEGORY`, et laisser l'appelant en choisir une autre
 * produirait une question invisible pour l'éditeur d'énigmes.
 */
export function packQuestions(entries: readonly QuestionEntry[]): readonly Puzzle[] {
  return entries.map(([id, question, expected]) => ({
    id: asPuzzleId(id),
    answer: question,
    category: QUESTION_CATEGORY,
    source: 'pack',
    bonusAnswer: expected,
  }))
}
