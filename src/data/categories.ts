import { QUESTION_CATEGORY } from '../game/bonus'

/**
 * Catégories effectivement peuplées. La liste grandit avec le catalogue, jamais
 * avant : une catégorie annoncée mais vide se verrait dans l'interface, et
 * `puzzles.test.ts` la refuse pour cette raison.
 *
 * « Question » vient en dernier et n'est pas écrite en clair ici : elle est
 * importée de `game/bonus.ts`, où la règle de jeu qui la définit vit — le
 * moteur en a besoin pour valider une réponse attendue, et une seconde
 * écriture littérale de ce libellé finirait par diverger de la première. C'est
 * la seule catégorie dont les énigmes ne sont pas tirées en manche ordinaire :
 * elles peuplent `PACK_QUESTIONS`, réservé à la manche finale.
 */
export const CATEGORIES = [
  'Expression',
  'Cinéma',
  'Cuisine',
  'Lieu & monument',
  'Nature & animal',
  'Musique',
  'Histoire',
  QUESTION_CATEGORY,
] as const

export type Category = (typeof CATEGORIES)[number]
