import { describe, expect, it } from 'vitest'
import { isQuestion, QUESTION_CATEGORY } from '../../game/bonus'
import { foldForCompare } from '../../game/compare'
import { cellsOf, normalizeAnswer } from '../../game/puzzle'
import { createRng } from '../../game/rng'
import type { Puzzle, PuzzleId } from '../../game/types'
import { asPuzzleId } from '../../game/types'
import { draftIssues, issueMessage } from '../../game/validate'
import { CATEGORIES } from '../categories'
import { PACK_PUZZLES, PACK_QUESTIONS, pickPuzzle } from './index'

/**
 * Le catalogue est le contenu du jeu : ces contraintes existent avant les
 * énigmes, pas après. Chacune correspond à une manière de rendre une manche
 * injouable ou illisible. Les contraintes elles-mêmes vivent dans
 * `src/game/validate.ts`, partagées avec l'éditeur d'énigmes perso.
 *
 * Deux réservoirs coexistent : `PACK_PUZZLES` pour les manches ordinaires,
 * `PACK_QUESTIONS` pour la manche finale. Les contrôles d'unicité portent sur
 * leur union, parce qu'une question qui dupliquerait l'identifiant ou
 * l'énoncé d'une énigme resterait un bug quel que soit le réservoir.
 */

/** `exp-001`, `cin-014`, `que-001` : préfixe de catégorie et numéro, stables à vie. */
const FORMAT_ID = /^[a-z]{3}-\d{3}$/

/** Union des deux réservoirs : sert aux contrôles qui doivent voir tout le catalogue à la fois. */
const ALL_PUZZLES: readonly Puzzle[] = [...PACK_PUZZLES, ...PACK_QUESTIONS]

describe('catalogue', () => {
  it('compte au moins cent soixante-quinze énigmes', () => {
    // Seuil relevé avec le catalogue (20, puis 60, puis 175) : un plancher
    // resté sous le contenu réel ne protège plus rien, une catégorie entière
    // pourrait disparaître sans faire rougir personne. Ajouter des énigmes ne
    // le casse jamais — seule une suppression le fait, et c'est exactement le
    // but.
    expect(PACK_PUZZLES.length).toBeGreaterThanOrEqual(175)
  })

  it('compte au moins vingt-cinq énigmes par catégorie jouable', () => {
    // Le total seul laisserait une catégorie se vider au profit d'une autre :
    // le tirage annoncerait alors une catégorie que deux manches suffisent à
    // épuiser. `QUESTION_CATEGORY` est exclue — son réservoir est
    // `PACK_QUESTIONS`, contrôlé par son propre plancher plus bas.
    for (const category of CATEGORIES) {
      if (category === QUESTION_CATEGORY) continue
      const count = PACK_PUZZLES.filter((puzzle) => puzzle.category === category).length
      expect(count, `${category} ne compte que ${count} énigmes`).toBeGreaterThanOrEqual(25)
    }
  })

  it('n’a que des identifiants uniques et au format attendu', () => {
    const ids = ALL_PUZZLES.map((puzzle) => puzzle.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(FORMAT_ID)
  })

  it('n’a pas deux fois le même énoncé', () => {
    const answers = ALL_PUZZLES.map((puzzle) => normalizeAnswer(puzzle.answer))
    expect(new Set(answers).size).toBe(answers.length)
  })

  it('ne déclare aucune catégorie vide', () => {
    // CATEGORIES porte désormais QUESTION_CATEGORY, dont les énigmes vivent
    // dans PACK_QUESTIONS et non PACK_PUZZLES : compter sur l'union des deux
    // réservoirs n'est pas une régression, c'est ce que le nouveau catalogue
    // à deux réservoirs impose.
    for (const category of CATEGORIES) {
      const count = ALL_PUZZLES.filter((puzzle) => puzzle.category === category).length
      expect(count, `${category} n’a aucune énigme`).toBeGreaterThan(0)
    }
  })

  it('PACK_PUZZLES ne porte jamais de réponse attendue', () => {
    // Garantie la plus importante du lot : sans elle, une question glissée
    // par erreur dans un fichier de catégorie ouvrirait une étape bonus dès
    // la manche 1, où rien ne permet de la jouer.
    expect(PACK_PUZZLES.every((puzzle) => puzzle.bonusAnswer === undefined)).toBe(true)
  })

  it('PACK_PUZZLES ne contient aucune catégorie Question', () => {
    expect(PACK_PUZZLES.every((puzzle) => puzzle.category !== QUESTION_CATEGORY)).toBe(true)
  })

  it('PACK_QUESTIONS compte au moins soixante-quinze questions', () => {
    // Le contenu de la manche finale : en dessous, une partie longue
    // reverrait toujours les mêmes questions. Une seule question est tirée par
    // partie, ce réservoir se consomme donc beaucoup plus lentement que
    // `PACK_PUZZLES` — d'où un plancher qui vise la variété d'une session
    // entière, pas celle d'une partie.
    expect(PACK_QUESTIONS.length).toBeGreaterThanOrEqual(75)
  })

  it('les identifiants de PACK_QUESTIONS commencent tous par que-', () => {
    for (const puzzle of PACK_QUESTIONS) expect(puzzle.id).toMatch(/^que-/)
  })

  it.each(PACK_PUZZLES.map((puzzle) => [puzzle.id, puzzle] as const))('%s est jouable', (_id, puzzle) => {
    expect(puzzle.source).toBe('pack')
    expect(CATEGORIES).toContain(puzzle.category)

    // Stockée sous forme canonique : la normaliser au chargement laisserait la
    // grille et `isSolved` divergents le temps d'un rendu.
    expect(puzzle.answer).toBe(normalizeAnswer(puzzle.answer))

    // Chaque énigme est son propre doublon si on ne l'exclut pas des « autres ».
    const autres = ALL_PUZZLES.filter((other) => other.id !== puzzle.id)
    const issues = draftIssues(puzzle, autres)
    expect(issues.map(issueMessage)).toEqual([])

    // Une ligature laissée telle quelle ne serait révélée par aucune lettre.
    expect(puzzle.answer).not.toMatch(/[ŒÆ]/)

    // Une case par caractère, une lettre devinable par lettre : c'est l'accord
    // entre la grille et le clavier.
    expect(cellsOf(puzzle.answer)).toHaveLength(puzzle.answer.length)
  })

  it.each(PACK_QUESTIONS.map((puzzle) => [puzzle.id, puzzle] as const))('%s est jouable', (_id, puzzle) => {
    expect(puzzle.source).toBe('pack')
    expect(CATEGORIES).toContain(puzzle.category)
    expect(puzzle.answer).toBe(normalizeAnswer(puzzle.answer))

    // `puzzle` (un `Puzzle`) satisfait structurellement `PuzzleDraft` : il porte
    // `answer`, `category` et `bonusAnswer`, exactement ce que `draftIssues`
    // regarde. Le passer entier — plutôt qu'un objet reconstruit à la main —
    // est ce qui exerce vraiment `bonus-empty` et `bonus-in-answer` : un
    // brouillon reconstruit sans `bonusAnswer` laisserait ces deux règles
    // muettes et ce test ne prouverait rien.
    const autres = ALL_PUZZLES.filter((other) => other.id !== puzzle.id)
    const issues = draftIssues(puzzle, autres)
    expect(issues.map(issueMessage)).toEqual([])

    expect(puzzle.answer).not.toMatch(/[ŒÆ]/)
    expect(cellsOf(puzzle.answer)).toHaveLength(puzzle.answer.length)

    expect(puzzle.category).toBe(QUESTION_CATEGORY)
    expect(isQuestion(puzzle)).toBe(true)

    const bonusAnswer = puzzle.bonusAnswer ?? ''
    expect(foldForCompare(bonusAnswer).length).toBeGreaterThan(0)

    // La grille ne doit jamais révéler la réponse attendue lettre par lettre :
    // sinon la question n'aurait plus rien à gagner à l'étape bonus.
    expect(foldForCompare(puzzle.answer).includes(foldForCompare(bonusAnswer))).toBe(false)
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
