import { describe, expect, it } from 'vitest'
import { PACK_PUZZLES } from '../data/puzzles'
import { QUESTION_CATEGORY } from './bonus'
import {
  mergeImported,
  nextCustomId,
  removeCustomPuzzle,
  saveCustomPuzzle,
  type ImportedDraft,
} from './customPuzzles'
import { asPuzzleId } from './types'
import type { Puzzle } from './types'

// Contraintes de `ANSWER_CHARS` : dix à quarante-deux caractères, au moins
// trois consonnes et deux voyelles distinctes, sans point d'interrogation
// (interdit par le jeu de caractères). Trente-sept caractères.
const QUESTION_ANSWER = "QUELLE EST LA CAPITALE DE L'AUSTRALIE"
const BONUS_ANSWER = 'CANBERRA'

function puzzle(id: string, answer: string, category = 'Divers'): Puzzle {
  return { id: asPuzzleId(id), answer, category, source: 'custom' }
}

describe('nextCustomId', () => {
  it('démarre à user-001 sur une liste vide', () => {
    expect(nextCustomId([])).toBe(asPuzzleId('user-001'))
  })

  it('passe au-delà du plus grand numéro même si la liste est trouée', () => {
    const taken = [puzzle('user-001', 'PREMIERE ENIGME ICI'), puzzle('user-003', 'TROISIEME ENIGME ICI')]
    expect(nextCustomId(taken)).toBe(asPuzzleId('user-004'))
  })

  it('ignore les identifiants du catalogue, seul un autre user- peut heurter', () => {
    const taken = [puzzle('exp-007', 'PREMIERE ENIGME ICI'), puzzle('user-002', 'DEUXIEME ENIGME ICI')]
    expect(nextCustomId(taken)).toBe(asPuzzleId('user-003'))
  })

  it('déborde du format à trois chiffres au-delà de 999', () => {
    const taken = [puzzle('user-999', 'PREMIERE ENIGME ICI')]
    expect(nextCustomId(taken)).toBe(asPuzzleId('user-1000'))
  })
})

describe('saveCustomPuzzle', () => {
  it('ajoute un brouillon valide en fin de liste, énoncé normalisé, source perso', () => {
    const result = saveCustomPuzzle(
      [],
      PACK_PUZZLES,
      { answer: 'la vie est belle', category: ' Cinéma ' },
      null,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.puzzles).toHaveLength(1)
    const [added] = result.puzzles
    expect(added?.answer).toBe('LA VIE EST BELLE')
    expect(added?.category).toBe('Cinéma')
    expect(added?.source).toBe('custom')
    // La première énigme créée s'appelle `user-001`, quelle que soit la taille
    // du catalogue embarqué : le préfixe suffit à écarter toute collision.
    expect(added?.id).toBe(asPuzzleId('user-001'))
  })

  it('refuse un brouillon invalide sans toucher la liste existante', () => {
    const custom = [puzzle('user-001', 'PREMIERE ENIGME ICI')]
    const before = [...custom]
    const result = saveCustomPuzzle(custom, [...PACK_PUZZLES, ...custom], { answer: '', category: '' }, null)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.length).toBeGreaterThan(0)
    expect(custom).toEqual(before)
  })

  it('refuse un doublon déjà présent dans le catalogue embarqué', () => {
    const [existing] = PACK_PUZZLES
    expect(existing).toBeDefined()
    if (existing === undefined) return
    const result = saveCustomPuzzle(
      [],
      PACK_PUZZLES,
      { answer: existing.answer, category: existing.category },
      null,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((issue) => issue.kind === 'answer-duplicate')).toBe(true)
  })

  it('conserve la position de l’entrée modifiée dans la liste', () => {
    const custom = [
      puzzle('user-001', 'PREMIERE ENIGME ICI'),
      puzzle('user-002', 'DEUXIEME ENIGME ICI'),
      puzzle('user-003', 'TROISIEME ENIGME ICI'),
    ]
    const pool = [...PACK_PUZZLES, ...custom]
    const result = saveCustomPuzzle(
      custom,
      pool,
      { answer: 'deuxieme enigme modifiee', category: 'Divers' },
      asPuzzleId('user-002'),
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.puzzles.map((p) => p.id)).toEqual(
      ['user-001', 'user-002', 'user-003'].map(asPuzzleId),
    )
    expect(result.puzzles[1]?.answer).toBe('DEUXIEME ENIGME MODIFIEE')
  })

  it('permet de réenregistrer une énigme sans changer son énoncé', () => {
    const existing = puzzle('user-005', 'UNE ENIGME STABLE ICI')
    const custom = [existing]
    const pool = [...PACK_PUZZLES, ...custom]
    const result = saveCustomPuzzle(
      custom,
      pool,
      { answer: existing.answer, category: existing.category },
      existing.id,
    )
    expect(result.ok).toBe(true)
  })

  it('conserve la réponse attendue d’une question, sous forme normalisée', () => {
    const result = saveCustomPuzzle(
      [],
      PACK_PUZZLES,
      { answer: QUESTION_ANSWER, category: QUESTION_CATEGORY, bonusAnswer: 'canberra' },
      null,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [added] = result.puzzles
    // Tapée en minuscules, elle doit ressortir en majuscules — même forme
    // canonique que l'énoncé, sinon deux saisies équivalentes produiraient
    // deux comparaisons différentes au moment du bonus.
    expect(added?.bonusAnswer).toBe(BONUS_ANSWER)
  })

  it('refuse une question sans réponse attendue', () => {
    const result = saveCustomPuzzle(
      [],
      PACK_PUZZLES,
      { answer: QUESTION_ANSWER, category: QUESTION_CATEGORY },
      null,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((issue) => issue.kind === 'bonus-empty')).toBe(true)
  })

  it('refuse une question dont la réponse attendue figure dans l’énoncé', () => {
    const result = saveCustomPuzzle(
      [],
      PACK_PUZZLES,
      {
        answer: "LA CAPITALE DE L'AUSTRALIE EST CANBERRA",
        category: QUESTION_CATEGORY,
        bonusAnswer: 'canberra',
      },
      null,
    )
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.issues.some((issue) => issue.kind === 'bonus-in-answer')).toBe(true)
  })

  it('n’attache jamais de réponse attendue à une énigme d’une autre catégorie', () => {
    const result = saveCustomPuzzle(
      [],
      PACK_PUZZLES,
      { answer: 'la vie est belle', category: 'Expression', bonusAnswer: 'canberra' },
      null,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [added] = result.puzzles
    // `undefined` ne suffit pas à le prouver : seul `Object.hasOwn` distingue
    // « absent » de « présent et vide », et c'est cette distinction que le
    // reste du code (persistance, `isQuestion`) exploite.
    expect(added !== undefined && Object.hasOwn(added, 'bonusAnswer')).toBe(false)
  })

  it('conserve la réponse attendue d’une question modifiée', () => {
    const existing: Puzzle = {
      id: asPuzzleId('user-010'),
      answer: QUESTION_ANSWER,
      category: QUESTION_CATEGORY,
      source: 'custom',
      bonusAnswer: BONUS_ANSWER,
    }
    const custom = [existing]
    const pool = [...PACK_PUZZLES, ...custom]
    const result = saveCustomPuzzle(
      custom,
      pool,
      { answer: existing.answer, category: existing.category, bonusAnswer: 'canberra' },
      existing.id,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.puzzles[0]?.bonusAnswer).toBe(BONUS_ANSWER)
  })

  it('efface la réponse attendue quand une question devient une catégorie ordinaire', () => {
    const existing: Puzzle = {
      id: asPuzzleId('user-011'),
      answer: QUESTION_ANSWER,
      category: QUESTION_CATEGORY,
      source: 'custom',
      bonusAnswer: BONUS_ANSWER,
    }
    const custom = [existing]
    const pool = [...PACK_PUZZLES, ...custom]
    const result = saveCustomPuzzle(
      custom,
      pool,
      // Le champ « réponse attendue » du formulaire garde sa valeur affichée
      // même après le changement de catégorie : c'est exactement le cas que
      // `normalizeDraft` doit couvrir.
      { answer: existing.answer, category: 'Expression', bonusAnswer: 'canberra' },
      existing.id,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const [updated] = result.puzzles
    expect(updated !== undefined && Object.hasOwn(updated, 'bonusAnswer')).toBe(false)
  })
})

describe('removeCustomPuzzle', () => {
  it('retire l’énigme correspondante', () => {
    const a = puzzle('user-001', 'PREMIERE ENIGME ICI')
    const b = puzzle('user-002', 'DEUXIEME ENIGME ICI')
    expect(removeCustomPuzzle([a, b], a.id)).toEqual([b])
  })

  it('ignore un identifiant absent sans lever d’exception', () => {
    const a = puzzle('user-001', 'PREMIERE ENIGME ICI')
    const custom = [a]
    expect(() => removeCustomPuzzle(custom, asPuzzleId('user-404'))).not.toThrow()
    expect(removeCustomPuzzle(custom, asPuzzleId('user-404'))).toBe(custom)
  })
})

describe('mergeImported', () => {
  it('ajoute les entrées valides et distingue doublons et invalides', () => {
    const entries: readonly ImportedDraft[] = [
      { id: null, answer: 'premiere enigme valide', category: 'Divers' },
      { id: null, answer: 'PREMIERE ENIGME VALIDE', category: 'Divers' }, // doublon, même fichier
      { id: null, answer: 'ab', category: 'Divers' }, // invalide : trop court
    ]
    const report = mergeImported([], PACK_PUZZLES, entries)
    expect(report.added).toBe(1)
    expect(report.duplicates).toBe(1)
    expect(report.invalid).toBe(1)
    expect(report.puzzles).toHaveLength(1)
    expect(report.puzzles[0]?.answer).toBe('PREMIERE ENIGME VALIDE')
  })

  it('réimporter le même fichier deux fois n’ajoute rien la seconde fois', () => {
    const entries: readonly ImportedDraft[] = [
      { id: null, answer: 'premiere enigme distincte', category: 'Divers' },
      { id: null, answer: 'deuxieme enigme distincte', category: 'Divers' },
    ]
    const first = mergeImported([], PACK_PUZZLES, entries)
    expect(first.added).toBe(2)

    const pool = [...PACK_PUZZLES, ...first.puzzles]
    const second = mergeImported(first.puzzles, pool, entries)
    expect(second.added).toBe(0)
    expect(second.duplicates).toBe(entries.length)
    expect(second.puzzles).toHaveLength(first.puzzles.length)
  })

  it('n’ajoute qu’une seule fois une énigme répétée dans le même fichier', () => {
    const entries: readonly ImportedDraft[] = [
      { id: null, answer: 'enigme repetee dans le fichier', category: 'Divers' },
      { id: null, answer: 'enigme repetee dans le fichier', category: 'Autre' },
    ]
    const report = mergeImported([], PACK_PUZZLES, entries)
    expect(report.added).toBe(1)
    expect(report.duplicates).toBe(1)
  })

  it('conserve un identifiant importé libre et préfixé', () => {
    const entries: readonly ImportedDraft[] = [
      { id: 'user-042', answer: 'une enigme avec identifiant', category: 'Divers' },
    ]
    const report = mergeImported([], PACK_PUZZLES, entries)
    expect(report.puzzles[0]?.id).toBe(asPuzzleId('user-042'))
  })

  it('régénère un identifiant déjà pris ou sans préfixe', () => {
    const existing = puzzle('user-042', 'ENIGME DEJA PRESENTE ICI')
    const entries: readonly ImportedDraft[] = [
      { id: 'user-042', answer: 'une autre enigme bien distincte', category: 'Divers' }, // déjà pris
      { id: 'exp-999', answer: 'encore une autre enigme ici', category: 'Divers' }, // sans préfixe perso
    ]
    const report = mergeImported([existing], [...PACK_PUZZLES, existing], entries)
    const ids = report.puzzles.map((p) => p.id)
    expect(ids).not.toContain(asPuzzleId('exp-999'))
    expect(ids.filter((id) => id === asPuzzleId('user-042'))).toHaveLength(1)
  })

  it('fusionne sans perdre les énigmes perso déjà présentes', () => {
    const existing = puzzle('user-001', 'ENIGME PERSO EXISTANTE ICI')
    const entries: readonly ImportedDraft[] = [
      { id: null, answer: 'nouvelle enigme importee ici', category: 'Divers' },
    ]
    const report = mergeImported([existing], [...PACK_PUZZLES, existing], entries)
    expect(report.puzzles).toContainEqual(existing)
    expect(report.added).toBe(1)
  })

  it('conserve la réponse attendue d’une question importée', () => {
    const entries: readonly ImportedDraft[] = [
      { id: null, answer: QUESTION_ANSWER, category: QUESTION_CATEGORY, bonusAnswer: 'canberra' },
    ]
    const report = mergeImported([], PACK_PUZZLES, entries)
    expect(report.added).toBe(1)
    expect(report.puzzles[0]?.bonusAnswer).toBe(BONUS_ANSWER)
  })

  it('refuse une question importée sans réponse attendue, comptée invalide et non doublon', () => {
    const entries: readonly ImportedDraft[] = [
      { id: null, answer: QUESTION_ANSWER, category: QUESTION_CATEGORY },
    ]
    const report = mergeImported([], PACK_PUZZLES, entries)
    // `bonus-empty` n'est pas `answer-duplicate` : le refus le plus informatif
    // gagne, cette entrée compte donc dans `invalid`, jamais dans `duplicates`.
    expect(report.added).toBe(0)
    expect(report.invalid).toBe(1)
    expect(report.duplicates).toBe(0)
    expect(report.puzzles).toHaveLength(0)
  })

  it('n’attache pas de réponse attendue à une entrée importée de catégorie ordinaire', () => {
    const entries: readonly ImportedDraft[] = [
      { id: null, answer: 'une enigme importee ordinaire', category: 'Divers', bonusAnswer: 'canberra' },
    ]
    const report = mergeImported([], PACK_PUZZLES, entries)
    const [added] = report.puzzles
    expect(added !== undefined && Object.hasOwn(added, 'bonusAnswer')).toBe(false)
  })
})
