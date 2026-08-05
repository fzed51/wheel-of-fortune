/**
 * Catégories effectivement peuplées. La liste grandit avec le catalogue, jamais
 * avant : une catégorie annoncée mais vide se verrait dans l'interface, et
 * `puzzles.test.ts` la refuse pour cette raison.
 */
export const CATEGORIES = [
  'Expression',
  'Cinéma',
  'Cuisine',
  'Lieu & monument',
  'Nature & animal',
] as const

export type Category = (typeof CATEGORIES)[number]
