import { describe, expect, it } from 'vitest'
import { draftIssues, issueMessage } from './validate'
import type { PuzzleDraft, PuzzleIssue } from './validate'
import { asPuzzleId } from './types'
import type { Puzzle } from './types'

/** Brouillon valide de référence : chaque test invalide n'en modifie qu'un seul aspect. */
const VALID: PuzzleDraft = { answer: 'LE CHAT NOIR', category: 'Animaux' }

const puzzle = (answer: string): Puzzle => ({
  id: asPuzzleId('test-000'),
  answer,
  category: 'Animaux',
  source: 'custom',
})

describe('draftIssues', () => {
  it('n’a aucun problème pour une énigme valide', () => {
    expect(draftIssues(VALID, [])).toEqual([])
  })

  it('signale un énoncé vide', () => {
    const issues = draftIssues({ ...VALID, answer: '' }, [])
    // Un champ vide n'est pas « trop court » : un seul des deux au maximum.
    expect(issues).toEqual([{ kind: 'answer-empty' }])
  })

  it('signale un énoncé trop court', () => {
    const issues = draftIssues({ ...VALID, answer: 'LE CHAT' }, [])
    expect(issues).toEqual([{ kind: 'answer-too-short' }])
  })

  it('signale un énoncé trop long', () => {
    const issues = draftIssues(
      { ...VALID, answer: 'LA TRES BELLE HISTOIRE DU ROI FAINEANT ENDORMI' },
      [],
    )
    expect(issues).toEqual([{ kind: 'answer-too-long' }])
  })

  it('signale les caractères refusés, dédoublonnés et dans l’ordre d’apparition', () => {
    const issues = draftIssues({ ...VALID, answer: 'LE CHAT N0IR ?0' }, [])
    expect(issues).toEqual([{ kind: 'answer-bad-chars', chars: ['0', '?'] }])
  })

  it('signale un énoncé avec moins de trois consonnes distinctes', () => {
    const issues = draftIssues({ ...VALID, answer: 'AI EU OUI EAU' }, [])
    expect(issues).toEqual([{ kind: 'answer-few-consonants' }])
  })

  it('signale un énoncé avec moins de deux voyelles distinctes', () => {
    const issues = draftIssues({ ...VALID, answer: 'SALSA CANAL PLAN BAL' }, [])
    expect(issues).toEqual([{ kind: 'answer-few-vowels' }])
  })

  it('signale un doublon même si l’énigme du catalogue n’est pas sous forme canonique', () => {
    const issues = draftIssues(VALID, [puzzle('le   chat noir')])
    expect(issues).toEqual([{ kind: 'answer-duplicate' }])
  })

  it('ne signale aucun doublon quand les autres énigmes sont distinctes', () => {
    const issues = draftIssues(VALID, [puzzle('LE CHIEN BLANC')])
    expect(issues).toEqual([])
  })

  it('signale une catégorie vide', () => {
    const issues = draftIssues({ ...VALID, category: '' }, [])
    expect(issues).toEqual([{ kind: 'category-empty' }])
  })

  it('signale une catégorie trop longue', () => {
    const issues = draftIssues({ ...VALID, category: 'A'.repeat(31) }, [])
    expect(issues).toEqual([{ kind: 'category-too-long' }])
  })

  it('remonte plusieurs problèmes ensemble, dans l’ordre énoncé puis catégorie', () => {
    const issues = draftIssues({ answer: 'AAA', category: '' }, [])
    expect(issues).toEqual([
      { kind: 'answer-too-short' },
      { kind: 'answer-few-consonants' },
      { kind: 'answer-few-vowels' },
      { kind: 'category-empty' },
    ])
  })

  describe('question de la manche finale', () => {
    // Trente-sept caractères, sans point d'interrogation (refusé par ANSWER_CHARS).
    const QUESTION_ANSWER = "QUELLE EST LA CAPITALE DE L'AUSTRALIE"

    it('n’a aucun problème pour une question complète et bien formée', () => {
      const issues = draftIssues(
        { answer: QUESTION_ANSWER, category: 'Question', bonusAnswer: 'CANBERRA' },
        [],
      )
      expect(issues).toEqual([])
    })

    it('signale une question sans réponse attendue', () => {
      const issues = draftIssues({ answer: QUESTION_ANSWER, category: 'Question' }, [])
      expect(issues).toEqual([{ kind: 'bonus-empty' }])
    })

    it('signale une question dont la réponse attendue n’est que des espaces', () => {
      const issues = draftIssues(
        { answer: QUESTION_ANSWER, category: 'Question', bonusAnswer: '   ' },
        [],
      )
      expect(issues).toEqual([{ kind: 'bonus-empty' }])
    })

    it('signale une réponse attendue contenue dans l’énoncé, même avec accents et espaces différents', () => {
      const issues = draftIssues(
        {
          answer: QUESTION_ANSWER,
          category: 'Question',
          // « càpitale » au lieu de « capitale » : seul le pliage rapproche
          // les deux chaînes malgré l'accent et les espaces en trop.
          bonusAnswer: ' càp itale ',
        },
        [],
      )
      expect(issues).toEqual([{ kind: 'bonus-in-answer' }])
    })

    it('ne signale aucun problème de bonus pour une énigme ordinaire portant un bonusAnswer', () => {
      // Les deux règles bonus ne s'appliquent qu'à la catégorie « Question » :
      // sans cette garde, dix-huit sites de construction existants qui ne
      // posent jamais `bonusAnswer` casseraient dès qu'un import leur en
      // donnerait un par erreur — ce test protège l'inverse aussi, une
      // énigme normale qui en porterait un ne doit rien déclencher.
      const issues = draftIssues(
        { answer: VALID.answer, category: VALID.category, bonusAnswer: 'LE CHAT NOIR' },
        [],
      )
      expect(issues).toEqual([])
    })
  })
})

describe('issueMessage', () => {
  // Typé en `Record<PuzzleIssue['kind'], PuzzleIssue>` : si un `kind` est ajouté
  // à l'union sans être ajouté ici, la compilation échoue (yarn build), ce qui
  // garantit qu'aucun cas ne reste sans message français.
  const ALL_ISSUES: Record<PuzzleIssue['kind'], PuzzleIssue> = {
    'answer-empty': { kind: 'answer-empty' },
    'answer-too-short': { kind: 'answer-too-short' },
    'answer-too-long': { kind: 'answer-too-long' },
    'answer-bad-chars': { kind: 'answer-bad-chars', chars: ['?'] },
    'answer-few-consonants': { kind: 'answer-few-consonants' },
    'answer-few-vowels': { kind: 'answer-few-vowels' },
    'answer-duplicate': { kind: 'answer-duplicate' },
    'category-empty': { kind: 'category-empty' },
    'category-too-long': { kind: 'category-too-long' },
    'bonus-empty': { kind: 'bonus-empty' },
    'bonus-in-answer': { kind: 'bonus-in-answer' },
  }

  it.each(Object.values(ALL_ISSUES))('produit une phrase française pour %j', (issue) => {
    const message = issueMessage(issue)
    expect(message.length).toBeGreaterThan(0)
    expect(message).toMatch(/\.$/)
  })

  it('cite les caractères refusés dans le message', () => {
    expect(issueMessage({ kind: 'answer-bad-chars', chars: ['3', '?'] })).toContain(
      'Caractères refusés : 3, ?.',
    )
  })
})
