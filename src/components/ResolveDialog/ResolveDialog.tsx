import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { BUTTON_GHOST, BUTTON_PRIMARY, INPUT } from '../classes'

export interface ResolveDialogProps {
  readonly open: boolean
  /** Catégorie de l'énigme, rappelée dans la boîte — le plateau est masqué par le dialogue modal. */
  readonly category: string
  readonly onSubmit: (attempt: string) => void
  readonly onClose: () => void
}

/**
 * Boîte de dialogue « Résoudre ». Purement pilotée par les props : elle ne
 * connaît ni le contexte de jeu, ni le moteur de règles — le câblage sur
 * la partie vit ailleurs.
 *
 * Le verdict est désormais synchrone et déterministe (`matchesAnswer` dans le
 * reducer) : soumettre ferme donc toujours la boîte, qu'il soit gagnant ou
 * non. Un dialogue resté ouvert après une mauvaise réponse offrirait un
 * bouton qui ne mène plus nulle part, la main ayant déjà changé de joueur.
 */
export default function ResolveDialog({ open, category, onSubmit, onClose }: ResolveDialogProps) {
  const titleId = useId()
  const attemptId = useId()
  const emptyErrorId = useId()
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

  // Lu par ref : l'écouteur natif ci-dessous ne se réinscrit pas à chaque
  // rendu et lit toujours la dernière valeur, sans dépendre d'une égalité de
  // callback que l'appelant ne garantit pas.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialog === null) return

    // `Esc` ferme le dialogue de lui-même côté natif : sans cet écouteur,
    // l'état du parent croirait la boîte encore ouverte.
    function handleClose(): void {
      onCloseRef.current()
    }

    dialog.addEventListener('close', handleClose)
    return () => {
      dialog.removeEventListener('close', handleClose)
    }
  }, [])

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    if (isEmpty) {
      setSubmitted(true)
      return
    }
    // Version élaguée, pas la frappe brute : la saisie n'est jamais retouchée
    // sous les doigts du joueur, mais les espaces de bord n'ont aucun sens à
    // traverser dans une comparaison, et le champ refuse déjà une proposition
    // qui n'en contient que — refuser « " " » puis envoyer « " chaise " »
    // serait incohérent.
    onSubmit(trimmedAttempt)
    // Le verdict est immédiat : soit la manche est gagnée et l'écran change,
    // soit la main passe au joueur suivant. Dans les deux cas la boîte n'a
    // plus rien à faire ouverte. On passe par le natif `close()` plutôt que
    // par `onClose` directement pour garder un seul chemin de fermeture.
    dialogRef.current?.close()
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
      <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
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
          aria-describedby={showEmptyError ? emptyErrorId : undefined}
          className={`${INPUT} text-base`}
        />
        {showEmptyError && (
          <p id={emptyErrorId} className="text-sm text-danger">
            Tapez une réponse avant de la proposer.
          </p>
        )}
        <div className="flex gap-2">
          <button type="submit" className={`${BUTTON_PRIMARY} min-h-11`}>
            Proposer
          </button>
          {/*
            Ferme via le natif plutôt que d'appeler `onClose` directement :
            c'est l'évènement `close` qui remonte la fermeture, un seul chemin
            pour `Esc` et pour ce bouton.
          */}
          <button
            type="button"
            className={`${BUTTON_GHOST} min-h-11`}
            onClick={() => dialogRef.current?.close()}
          >
            Annuler
          </button>
        </div>
      </form>
    </dialog>
  )
}
