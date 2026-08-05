import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { JudgeErrorReason } from '../../llm/judge'
import { BUTTON_GHOST, BUTTON_PRIMARY, INPUT } from '../classes'
import VerdictMessage from './VerdictMessage'

export interface ResolveDialogProps {
  readonly open: boolean
  /** Verdict en attente : le formulaire est verrouillé et il n'y a **aucun** bouton d'annulation. */
  readonly pending: boolean
  /** Dernier échec technique du juge, ou `null`. Un échec ne coûte rien au joueur : il rejoue. */
  readonly failure: JudgeErrorReason | null
  /** Catégorie de l'énigme, rappelée dans la boîte — le plateau est masqué par le dialogue modal. */
  readonly category: string
  readonly onSubmit: (attempt: string) => void
  readonly onClose: () => void
}

/**
 * Boîte de dialogue « Résoudre ». Purement pilotée par les props : elle ne
 * connaît ni le contexte de jeu, ni le juge, ni le stockage — le câblage sur
 * la partie vit ailleurs.
 */
export default function ResolveDialog({
  open,
  pending,
  failure,
  category,
  onSubmit,
  onClose,
}: ResolveDialogProps) {
  const titleId = useId()
  const attemptId = useId()
  const emptyErrorId = useId()
  const verdictId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const [attempt, setAttempt] = useState('')
  const [submitted, setSubmitted] = useState(false)

  // Repli sur la valeur précédente comparée pendant le rendu, comme dans
  // `PuzzleForm` : à la fermeture on vide le champ pour que la tentative
  // suivante reparte propre, sans passer par un effet dédié à ce seul reset.
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (!open) {
      setAttempt('')
      setSubmitted(false)
    }
  }

  const trimmedAttempt = attempt.trim()
  const isEmpty = trimmedAttempt.length === 0
  const showEmptyError = submitted && isEmpty
  const hasVerdictMessage = pending || failure !== null

  // Plusieurs identifiants séparés par une espace : c'est la forme attendue par
  // `aria-describedby`, et elle laisse le champ décrire à la fois son propre
  // refus et l'état du juge sans qu'un message chasse l'autre.
  const describedBy = [showEmptyError ? emptyErrorId : null, hasVerdictMessage ? verdictId : null]
    .filter((id) => id !== null)
    .join(' ')

  // `showModal()` est ce qui donne au natif son piège de focus, `Esc` et son
  // top-layer : la prop `open` de React afficherait la boîte non modale.
  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return
    if (open) {
      if (!dialog.open) dialog.showModal()
      // `autoFocus` n'est pas fiable dans un `<dialog>` : on focalise à la main.
      inputRef.current?.focus()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open])

  // Lus par ref : les écouteurs natifs ci-dessous ne se réinscrivent pas à
  // chaque rendu et lisent toujours la dernière valeur, sans dépendre d'une
  // égalité de callback que l'appelant ne garantit pas.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const pendingRef = useRef(pending)
  pendingRef.current = pending

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return

    // `Esc` ferme le dialogue de lui-même côté natif : sans cet écouteur,
    // l'état du parent croirait la boîte encore ouverte.
    function handleClose(): void {
      onCloseRef.current()
    }

    // Pendant l'attente d'un verdict, `Esc` ne doit pas laisser le joueur
    // esquiver une réponse qui tarde — même raison qu'il n'y a pas de bouton
    // « Annuler » à ce moment-là.
    function handleCancel(event: Event): void {
      if (pendingRef.current) event.preventDefault()
    }

    dialog.addEventListener('close', handleClose)
    dialog.addEventListener('cancel', handleCancel)
    return () => {
      dialog.removeEventListener('close', handleClose)
      dialog.removeEventListener('cancel', handleCancel)
    }
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (pending) return
    if (isEmpty) {
      setSubmitted(true)
      return
    }
    // Version élaguée, pas la frappe brute : la saisie n'est jamais retouchée
    // sous les doigts du joueur, mais les espaces de bord n'ont aucun sens à
    // traverser le réseau, et le champ refuse déjà une proposition qui n'en
    // contient que — refuser « " " » puis envoyer « " chaise " » serait
    // incohérent.
    onSubmit(trimmedAttempt)
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      className="rounded-xl border border-border bg-surface p-4 text-fg"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        Proposer une réponse
      </h2>
      <p className="text-sm text-fg-muted">Catégorie : {category}</p>
      <form onSubmit={handleSubmit} aria-busy={pending} className="mt-3 flex flex-col gap-3">
        <label htmlFor={attemptId} className="text-fg">
          Votre réponse
        </label>
        <input
          ref={inputRef}
          id={attemptId}
          type="text"
          value={attempt}
          onChange={(event) => setAttempt(event.target.value)}
          aria-invalid={showEmptyError}
          aria-describedby={describedBy === '' ? undefined : describedBy}
          className={`${INPUT} text-base`}
        />
        {showEmptyError && (
          <p id={emptyErrorId} className="text-sm text-danger">
            Tapez une réponse avant de la proposer.
          </p>
        )}
        <VerdictMessage pending={pending} failure={failure} id={verdictId} />
        <div className="flex gap-2">
          {/*
            `aria-disabled`, jamais `disabled` : le bouton peut porter le focus
            pendant l'attente, et un `disabled` natif le renverrait à `<body>`.
            Le verrouillage réel se fait dans `handleSubmit`, qui sort tôt.
          */}
          <button type="submit" aria-disabled={pending} className={`${BUTTON_PRIMARY} min-h-11`}>
            Proposer
          </button>
          {!pending && (
            // Ferme via le natif plutôt que d'appeler `onClose` directement :
            // c'est l'évènement `close` qui remonte la fermeture, un seul chemin
            // pour `Esc` et pour ce bouton.
            <button
              type="button"
              className={`${BUTTON_GHOST} min-h-11`}
              onClick={() => dialogRef.current?.close()}
            >
              Annuler
            </button>
          )}
        </div>
      </form>
    </dialog>
  )
}
