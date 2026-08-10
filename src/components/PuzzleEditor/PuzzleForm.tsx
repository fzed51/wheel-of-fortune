import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { QUESTION_CATEGORY } from '../../game/bonus'
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

function isBonusIssue(issue: PuzzleIssue): boolean {
  return issue.kind.startsWith('bonus-')
}

// Le tri des problèmes de catégorie s'écrivait par complément (« tout ce qui
// n'est pas un problème d'énoncé ») avant l'arrivée de `bonus-empty` et
// `bonus-in-answer` : ce raisonnement rangeait les deux nouveaux problèmes
// sous le champ « Catégorie » plutôt que sous « Réponse attendue », puisqu'un
// filtre par complément absorbe tout nouveau préfixe sans qu'on s'en rende
// compte. Un filtre explicite sur `category-` ne peut plus se tromper quand
// un futur préfixe apparaîtra.
function isCategoryIssue(issue: PuzzleIssue): boolean {
  return issue.kind.startsWith('category-')
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
  const bonusAnswerId = useId()
  const answerPreviewId = `${answerId}-preview`
  const answerErrorsId = `${answerId}-errors`
  const categoryErrorsId = `${categoryId}-errors`
  const bonusAnswerErrorsId = `${bonusAnswerId}-errors`

  const defaultCategory = categories[0] ?? ''

  // Reproduit `initial` dans l'état des champs pendant le rendu, plutôt que
  // dans un `useEffect` : un effet ferait un rendu de plus avec les anciennes
  // valeurs affichées avant de corriger. Comparer la prop à sa valeur
  // précédente (stockée en état) est la technique React idiomatique pour
  // réagir à un changement de prop sans passer par un effet.
  const [prevInitial, setPrevInitial] = useState(initial)
  const [answerInput, setAnswerInput] = useState(initial?.answer ?? '')
  const [categoryInput, setCategoryInput] = useState(initial?.category ?? defaultCategory)
  const [bonusAnswerInput, setBonusAnswerInput] = useState(initial?.bonusAnswer ?? '')
  const [answerTouched, setAnswerTouched] = useState(false)
  const [categoryTouched, setCategoryTouched] = useState(false)
  const [bonusAnswerTouched, setBonusAnswerTouched] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  if (initial !== prevInitial) {
    setPrevInitial(initial)
    setAnswerInput(initial?.answer ?? '')
    setCategoryInput(initial?.category ?? defaultCategory)
    setBonusAnswerInput(initial?.bonusAnswer ?? '')
    setAnswerTouched(false)
    setCategoryTouched(false)
    setBonusAnswerTouched(false)
    setSubmitted(false)
  }

  // La frappe brute n'est jamais normalisée en direct : `normalizeAnswer` fait
  // un `trim` et écrase les espaces multiples, ce qui annulerait un espace
  // tapé entre deux mots. La normalisation ne sert qu'à valider et soumettre.
  // La même prudence vaut pour la réponse attendue, normalisée par la même
  // fonction — `saveCustomPuzzle` la normalise de nouveau à l'écriture, mais
  // l'affichage à l'écran reste la saisie brute jusque-là.
  const normalizedAnswer = normalizeAnswer(answerInput)
  const trimmedCategory = categoryInput.trim()
  const isQuestion = trimmedCategory === QUESTION_CATEGORY
  const normalizedBonusAnswer = normalizeAnswer(bonusAnswerInput)
  // Le champ « réponse attendue » ne pose sa clé dans le brouillon que pour la
  // catégorie « Question » : un `bonusAnswer` construit puis abandonné par un
  // changement de catégorie ne doit jamais voyager jusqu'à la validation ni à
  // `onSubmit`, sans quoi une énigme ordinaire porterait une réponse bonus
  // fantôme. Jamais de clé posée à `undefined` — `Object.hasOwn` distingue
  // « absent » de « présent et vide » ailleurs dans le code (`customPuzzles.ts`).
  const draft: PuzzleDraft = isQuestion
    ? { answer: normalizedAnswer, category: trimmedCategory, bonusAnswer: normalizedBonusAnswer }
    : { answer: normalizedAnswer, category: trimmedCategory }
  const issues = draftIssues(draft, others)
  const answerIssues = issues.filter(isAnswerIssue)
  const categoryIssues = issues.filter(isCategoryIssue)
  const bonusIssues = issues.filter(isBonusIssue)

  // Les messages n'apparaissent qu'une fois le champ quitté ou après une
  // soumission refusée : les afficher dès la première lettre serait agressif
  // (« Au moins 10 caractères » sur un champ qu'on commence à peine à remplir).
  const showAnswerErrors = (answerTouched || submitted) && answerIssues.length > 0
  const showCategoryErrors = (categoryTouched || submitted) && categoryIssues.length > 0
  const showBonusErrors = (bonusAnswerTouched || submitted) && bonusIssues.length > 0
  const showPreview = answerInput.length > 0 && normalizedAnswer !== answerInput

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (issues.length > 0) {
      setSubmitted(true)
      setAnswerTouched(true)
      setCategoryTouched(true)
      setBonusAnswerTouched(true)
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

      {/* Uniquement pour la catégorie « Question » : les autres catégories
          n'ouvrent aucune étape bonus, un champ qu'on ne verrait jamais servir
          n'y a rien à faire. */}
      {isQuestion && (
        <>
          <div className={FIELD}>
            <label htmlFor={bonusAnswerId} className="text-fg">
              Réponse attendue
            </label>
            <input
              id={bonusAnswerId}
              type="text"
              value={bonusAnswerInput}
              onChange={(event) => setBonusAnswerInput(event.target.value)}
              onBlur={() => setBonusAnswerTouched(true)}
              aria-invalid={showBonusErrors}
              aria-describedby={showBonusErrors ? bonusAnswerErrorsId : undefined}
              className={`${INPUT} flex-1`}
            />
          </div>
          {showBonusErrors && (
            <div id={bonusAnswerErrorsId} className="flex flex-col gap-1">
              {bonusIssues.map((issue) => (
                <p key={issue.kind} className="text-sm text-danger">
                  {issueMessage(issue)}
                </p>
              ))}
            </div>
          )}
        </>
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
