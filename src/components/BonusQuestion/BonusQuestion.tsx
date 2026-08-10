import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { BUTTON_GHOST, BUTTON_PRIMARY, CARD, INPUT } from '../classes'
import type { JudgeErrorReason } from '../../llm/judge'
import VerdictMessage from './VerdictMessage'

export interface BonusQuestionProps {
  /** L'énoncé de la question, tel qu'il a été deviné à la roue. Déjà entièrement révélé : rien à cacher ici. */
  readonly question: string
  /** Nom du joueur qui répond, pour que l'écran ne mente pas quand c'est un bot qui joue. */
  readonly playerName: string
  /** Montant du bonus, déjà mis en forme par `formatEuros` — le composant n'écrit aucun montant lui-même. */
  readonly prize: string
  /** Verdict en attente : le champ et les deux boutons deviennent inertes. */
  readonly pending: boolean
  /** Dernier échec technique du juge, ou `null`. */
  readonly failure: JudgeErrorReason | null
  /** Vrai quand c'est un bot qui répond : le formulaire n'est alors pas rendu du tout. */
  readonly botTurn: boolean
  readonly onSubmit: (attempt: string) => void
  readonly onSkip: () => void
}

/** `undefined` si la liste ne contient aucun id, pour ne poser `aria-describedby` que si utile. */
function describedBy(ids: readonly (string | null)[]): string | undefined {
  const present = ids.filter((id): id is string => id !== null)
  return present.length > 0 ? present.join(' ') : undefined
}

/**
 * Carte de la question bonus. Purement pilotée par les props : elle ne connaît
 * ni le contexte de jeu, ni le moteur de règles — le câblage sur la partie vit
 * ailleurs.
 *
 * Pas de `<dialog>` : pendant cette étape, `progress.kind` n'est plus `'round'`,
 * donc l'écran de jeu masque déjà de lui-même le plateau, la roue, le clavier
 * et les contrôles. Il n'y a plus rien à recouvrir, et un modal apporterait
 * trois problèmes pour rien — un piège de focus sans contenu concurrent, une
 * touche `Esc` qui fermerait un écran sans issue de repli, et un `showModal()`
 * à piloter depuis la route. Cette carte suit donc le modèle des cartes
 * « Manche terminée » et « Manche bloquée » de `GameRoute` : elle est rendue
 * tant que l'étape bonus dure, elle disparaît quand la partie passe aux
 * résultats.
 *
 * `expected` n'est jamais une prop de ce composant : c'est la seule chose qui
 * reste à trouver dans toute la partie, elle ne doit donc jamais transiter
 * jusqu'à l'écran, même par erreur d'un futur ajout de prop.
 */
export default function BonusQuestion({
  question,
  playerName,
  prize,
  pending,
  failure,
  botTurn,
  onSubmit,
  onSkip,
}: BonusQuestionProps) {
  const attemptId = useId()
  const emptyErrorId = useId()
  const verdictId = useId()

  const [attempt, setAttempt] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const trimmedAttempt = attempt.trim()
  const isEmpty = trimmedAttempt.length === 0
  const showEmptyError = submitted && isEmpty
  // `VerdictMessage` ne rend rien hors attente et hors échec : ne lier son id
  // que dans ces deux cas évite un `aria-describedby` pointant vers un nœud
  // vide.
  const showVerdict = pending || failure !== null

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    // Sécurité au-delà de `readOnly` sur le champ : une soumission par
    // `Entrée` déclenche l'évènement `submit` du formulaire indépendamment de
    // l'attribut posé sur l'input.
    if (pending) return
    if (isEmpty) {
      setSubmitted(true)
      return
    }
    // Version élaguée, jamais la frappe brute : la saisie n'est jamais
    // retouchée sous les doigts du joueur, mais les espaces de bord n'ont
    // aucun sens à traverser un jugement, et le champ refuse déjà une
    // proposition qui n'en contient que.
    onSubmit(trimmedAttempt)
  }

  function handleSkip(): void {
    if (pending) return
    onSkip()
  }

  return (
    <section className={CARD}>
      <h3 className="font-semibold text-fg">Question bonus</h3>
      <p className="mt-1 text-fg-muted">{question}</p>
      <p className="mt-1 text-sm text-fg-muted">
        Cagnotte en jeu : {prize} — au tour de {playerName}
      </p>

      {botTurn ? (
        // Aucun champ actif pendant le tour d'un bot : un formulaire rendu
        // laisserait croire à l'humain que c'est à lui de répondre.
        <p className="mt-3 text-fg-muted">{playerName} répond à la question bonus.</p>
      ) : (
        <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3">
          <label htmlFor={attemptId} className="text-fg">
            Votre réponse
          </label>
          <input
            id={attemptId}
            type="text"
            value={attempt}
            onChange={(event) => setAttempt(event.target.value)}
            // `readOnly` et non `disabled` : un champ `disabled` sort de
            // l'ordre de tabulation et n'est plus annoncé, alors que `readOnly`
            // reste focalisable et lisible tout en refusant la frappe pendant
            // le verdict.
            readOnly={pending}
            aria-invalid={showEmptyError}
            aria-describedby={describedBy([
              showEmptyError ? emptyErrorId : null,
              showVerdict ? verdictId : null,
            ])}
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
              `aria-disabled`, jamais `disabled` : un bouton `disabled` qui
              porte le focus le perd au profit de `<body>`, et le lecteur
              d'écran se tait au moment précis où le joueur attend un verdict.
              Le gestionnaire sort tôt à la place.
            */}
            <button
              type="submit"
              aria-disabled={pending}
              className={`${BUTTON_PRIMARY} min-h-11`}
            >
              Répondre
            </button>
            <button
              type="button"
              aria-disabled={pending}
              className={`${BUTTON_GHOST} min-h-11`}
              onClick={handleSkip}
            >
              Passer
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
