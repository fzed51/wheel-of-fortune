import { describe, expect, it } from 'vitest'
import { cellsOf, normalizeAnswer } from '../../game/puzzle'
import { createRng } from '../../game/rng'
import type { Puzzle, PuzzleId } from '../../game/types'
import { asPuzzleId } from '../../game/types'
import { draftIssues, issueMessage } from '../../game/validate'
import { CATEGORIES } from '../categories'
import { PACK_PUZZLES, pickPuzzle } from './index'

/**
 * Le catalogue est le contenu du jeu : ces contraintes existent avant les
 * énigmes, pas après. Chacune correspond à une manière de rendre une manche
 * injouable ou illisible. Les contraintes elles-mêmes vivent dans
 * `src/game/validate.ts`, partagées avec l'éditeur d'énigmes perso.
 */

/** `exp-001`, `cin-014` : préfixe de catégorie et numéro, stables à vie. */
const FORMAT_ID = /^[a-z]{3}-\d{3}$/

describe('catalogue', () => {
  it('compte au moins vingt énigmes', () => {
    expect(PACK_PUZZLES.length).toBeGreaterThanOrEqual(20)
  })

  it('n’a que des identifiants uniques et au format attendu', () => {
    const ids = PACK_PUZZLES.map((puzzle) => puzzle.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(FORMAT_ID)
  })

  it('n’a pas deux fois le même énoncé', () => {
    const answers = PACK_PUZZLES.map((puzzle) => normalizeAnswer(puzzle.answer))
    expect(new Set(answers).size).toBe(answers.length)
  })

  it('ne déclare aucune catégorie vide', () => {
    for (const category of CATEGORIES) {
      const count = PACK_PUZZLES.filter((puzzle) => puzzle.category === category).length
      expect(count, `${category} n’a aucune énigme`).toBeGreaterThan(0)
    }
  })

  it.each(PACK_PUZZLES.map((puzzle) => [puzzle.id, puzzle] as const))('%s est jouable', (_id, puzzle) => {
    expect(puzzle.source).toBe('pack')
    expect(CATEGORIES).toContain(puzzle.category)

    // Stockée sous forme canonique : la normaliser au chargement laisserait la
    // grille et `isSolved` divergents le temps d'un rendu.
    expect(puzzle.answer).toBe(normalizeAnswer(puzzle.answer))

    // Chaque énigme est son propre doublon si on ne l'exclut pas des « autres ».
    const autres = PACK_PUZZLES.filter((other) => other.id !== puzzle.id)
    const issues = draftIssues(puzzle, autres)
    expect(issues.map(issueMessage)).toEqual([])

    // Une ligature laissée telle quelle ne serait révélée par aucune lettre.
    expect(puzzle.answer).not.toMatch(/[ŒÆ]/)

    // Une case par caractère, une lettre devinable par lettre : c'est l'accord
    // entre la grille et le clavier.
    expect(cellsOf(puzzle.answer)).toHaveLength(puzzle.answer.length)
  })
})

describe('pickPuzzle', () => {
  const ids = (puzzle: Puzzle | null): string => puzzle?.id ?? 'aucune'

  it('tire une énigme du catalogue', () => {
    const puzzle = pickPuzzle(createRng(1), PACK_PUZZLES, [])
    expect(PACK_PUZZLES).toContain(puzzle)
  })

  it('ne retire jamais une énigme déjà jouée tant qu’il en reste', () => {
    const joues: PuzzleId[] = []
    for (let tour = 0; tour < PACK_PUZZLES.length; tour += 1) {
      const puzzle = pickPuzzle(createRng(tour + 1), PACK_PUZZLES, joues)
      expect(puzzle, `plus rien à tirer au tour ${tour}`).not.toBeNull()
      if (puzzle === null) return
      expect(joues, `${ids(puzzle)} déjà jouée`).not.toContain(puzzle.id)
      joues.push(puzzle.id)
    }
    expect(joues).toHaveLength(PACK_PUZZLES.length)
  })

  it('repart du catalogue complet quand tout a été joué', () => {
    const tous = PACK_PUZZLES.map((puzzle) => puzzle.id)
    const puzzle = pickPuzzle(createRng(3), PACK_PUZZLES, tous)
    expect(PACK_PUZZLES).toContain(puzzle)
  })

  it('ignore une exclusion qui n’est pas du catalogue', () => {
    const puzzle = pickPuzzle(createRng(4), PACK_PUZZLES, [asPuzzleId('inconnue')])
    expect(puzzle).not.toBeNull()
  })

  it('renvoie null sur un catalogue vide, sans lever', () => {
    expect(pickPuzzle(createRng(5), [], [])).toBeNull()
  })

  it('est reproductible à graine égale', () => {
    expect(ids(pickPuzzle(createRng(9), PACK_PUZZLES, []))).toBe(
      ids(pickPuzzle(createRng(9), PACK_PUZZLES, [])),
    )
  })
})
