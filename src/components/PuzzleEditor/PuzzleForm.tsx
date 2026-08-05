import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { normalizeAnswer } from '../../game/puzzle'
import type { Puzzle } from '../../game/types'
import { draftIssues, issueMessage } from '../../game/validate'
import type { PuzzleDraft, PuzzleIssue } from '../../game/validate'
import { BUTTON_GHOST, BUTTON_PRIMARY, FIELD, INPUT } from '../classes'

export interface PuzzleFormProps {
  /** Catégories proposées au choix. La route les fournit ; le composant n'en connaît aucune. */
  readonly categories: readonly string[]
  /** Énigme en cours de modification, ou `null` pour une création. */
  readonly initial: Puzzle | null
  /** Énigmes contre lesquelles chercher un doublon — la route en exclut `initial`. */
  readonly others: readonly Puzzle[]
  readonly onSubmit: (draft: PuzzleDraft) => void
  readonly onCancel: () => void
}

function isAnswerIssue(issue: PuzzleIssue): boolean {
  return issue.kind.startsWith('answer-')
}

/** `undefined` si la liste ne contient aucun id, pour ne poser `aria-describedby` que si utile. */
function describedBy(ids: readonly (string | undefined)[]): string | undefined {
  const present = ids.filter((id): id is string => id !== undefined)
  return present.length > 0 ? present.join(' ') : undefined
}

/**
 * Formulaire de création/modification d'une énigme perso. Purement contrôlé
 * par les props : il ne connaît aucun contexte, la route fait le câblage et
 * refait la validation définitive avant d'écrire dans le stockage.
 */
export default function PuzzleForm({ categories, initial, others, onSubmit, onCancel }: PuzzleFormProps) {
  const answerId = useId()
  const categoryId = useId()
  const answerPreviewId = `${answerId}-preview`
  const answerErrorsId = `${answerId}-errors`
  const categoryErrorsId = `${categoryId}-errors`

  const defaultCategory = categories[0] ?? ''

  // Reproduit `initial` dans l'état des champs pendant le rendu, plutôt que
  // dans un `useEffect` : un effet ferait un rendu de plus avec les anciennes
  // valeurs affichées avant de corriger. Comparer la prop à sa valeur
  // précédente (stockée en état) est la technique React idiomatique pour
  // réagir à un changement de prop sans passer par un effet.
  const [prevInitial, setPrevInitial] = useState(initial)
  const [answerInput, setAnswerInput] = useState(initial?.answer ?? '')
  const [categoryInput, setCategoryInput] = useState(initial?.category ?? defaultCategory)
  const [answerTouched, setAnswerTouched] = useState(false)
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setAnswerInput(initial?.answer ?? '')
    setCategoryInput(initial?.category ?? defaultCategory)
    setAnswerTouched(false)
    setCategoryTouched(false)
    setSubmitted(false)
  }

  // La frappe brute n'est jamais normalisée en direct : `normalizeAnswer` fait
  // un `trim` et écrase les espaces multiples, ce qui annulerait un espace
  // tapé entre deux mots. La normalisation ne sert qu'à valider et soumettre.
  const normalizedAnswer = normalizeAnswer(answerInput)
  const trimmedCategory = categoryInput.trim()
  const draft: PuzzleDraft = { answer: normalizedAnswer, category: trimmedCategory }
  const issues = draftIssues(draft, others)
  const answerIssues = issues.filter(isAnswerIssue)
  const categoryIssues = issues.filter((issue) => !isAnswerIssue(issue))

  // Les messages n'apparaissent qu'une fois le champ quitté ou après une
  // soumission refusée : les afficher dès la première lettre serait agressif
  // (« Au moins 10 caractères » sur un champ qu'on commence à peine à remplir).
  const showAnswerErrors = (answerTouched || submitted) && answerIssues.length > 0
  const showCategoryErrors = (categoryTouched || submitted) && categoryIssues.length > 0
  const showPreview = answerInput.length > 0 && normalizedAnswer !== answerInput

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (issues.length > 0) {
      setSubmitted(true)
      setAnswerTouched(true)
      setCategoryTouched(true)
      return
    }
    onSubmit(draft)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className={FIELD}>
        <label htmlFor={answerId} className="text-fg">
          Énoncé
        </label>
        <input
          id={answerId}
          type="text"
          value={answerInput}
          onChange={(event) => setAnswerInput(event.target.value)}
          onBlur={() => setAnswerTouched(true)}
          aria-invalid={showAnswerErrors}
          aria-describedby={describedBy([
            showPreview ? answerPreviewId : undefined,
            showAnswerErrors ? answerErrorsId : undefined,
          ])}
          className={`${INPUT} flex-1`}
        />
      </div>
      {showPreview && (
        <p id={answerPreviewId} className="text-sm text-fg-muted">
          Sera enregistré : {normalizedAnswer}
        </p>
      )}
      {showAnswerErrors && (
        // Pas de `role="alert"` : ces messages changent à chaque frappe une
        // fois affichés, un lecteur d'écran deviendrait bavard à l'excès.
        <div id={answerErrorsId} className="flex flex-col gap-1">
          {answerIssues.map((issue) => (
            <p key={issue.kind} className="text-sm text-danger">
              {issueMessage(issue)}
            </p>
          ))}
        </div>
      )}

      <div className={FIELD}>
        <label htmlFor={categoryId} className="text-fg">
          Catégorie
        </label>
        <select
          id={categoryId}
          value={categoryInput}
          onChange={(event) => setCategoryInput(event.target.value)}
          onBlur={() => setCategoryTouched(true)}
          aria-invalid={showCategoryErrors}
          aria-describedby={showCategoryErrors ? categoryErrorsId : undefined}
          className={INPUT}
        >
          {categories.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
      </div>
      {showCategoryErrors && (
        <div id={categoryErrorsId} className="flex flex-col gap-1">
          {categoryIssues.map((issue) => (
            <p key={issue.kind} className="text-sm text-danger">
              {issueMessage(issue)}
            </p>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        {/*
          Le bouton reste actif même si le brouillon est invalide : un bouton
          inerte (`aria-disabled` ou `disabled`) ne laisserait aucun moyen de
          faire apparaître les messages avant d'avoir quitté un champ. Au
          clic, si `draftIssues` renvoie un problème, on l'affiche et on
          n'appelle pas `onSubmit` — la soumission native du formulaire suffit,
          pas besoin d'un état désactivé.
        */}
        <button type="submit" className={`${BUTTON_PRIMARY} min-h-11`}>
          {initial === null ? "Ajouter l'énigme" : 'Enregistrer'}
        </button>
        {initial !== null && (
          <button type="button" className={`${BUTTON_GHOST} min-h-11`} onClick={onCancel}>
            Annuler
          </button>
        )}
      </div>
    </form>
  )
}
