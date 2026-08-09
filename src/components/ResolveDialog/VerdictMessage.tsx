import { announceJudgeFailure } from '../../game/announce'
import type { JudgeErrorReason } from '../../llm/judge'

export interface VerdictMessageProps {
  /** Verdict en attente : la phrase d'attente prime sur tout échec précédent. */
  readonly pending: boolean
  /** Dernier échec technique du juge, ou `null` si rien à signaler. */
  readonly failure: JudgeErrorReason | null
  /** Lié au champ par `aria-describedby` : c'est ce lien qui fait lire le message. */
  readonly id: string
}

/**
 * Phrase d'attente ou d'échec du juge, **purement visuelle**.
 *
 * **Sans consommateur depuis que « Résoudre » est tranché localement** : le
 * verdict est synchrone, il n'y a plus ni attente ni panne à afficher sur ce
 * chemin. Conservé tel quel parce que l'étape suivante du chantier le remonte
 * dans le dialogue de la question bonus, seul appel au juge restant, où l'attente
 * et l'échec réseau existent bel et bien. Ne pas supprimer.
 *
 * Ni `role="status"` ni `role="alert"` ici, contrairement au réflexe : les deux
 * live regions du projet vivent dans le layout racine et `announceTransition`
 * les alimente déjà pour l'ouverture d'une proposition et pour l'échec du juge.
 * Une troisième région doublerait donc l'énoncé, et comme elle serait créée au
 * moment même où son message arrive, elle risquerait de n'être pas lue du tout
 * (voir `LiveRegions.tsx`, qui documente cette contrainte). Le lien
 * `aria-describedby` depuis le champ suffit : le focus y revient, la phrase est
 * lue avec lui.
 *
 * Les phrases d'échec viennent de `announceJudgeFailure` et ne sont pas
 * réécrites ici : deux jeux de formulations pour la même panne finiraient par
 * se contredire, l'un disant de vérifier la connexion et l'autre la clé.
 */
export default function VerdictMessage({ pending, failure, id }: VerdictMessageProps) {
  if (pending) {
    return (
      <p id={id} className="text-sm text-fg-muted">
        Le juge examine votre réponse…
      </p>
    )
  }

  if (failure !== null) {
    return (
      <p id={id} className="text-sm text-danger">
        {announceJudgeFailure(failure)}
      </p>
    )
  }

  return null
}
