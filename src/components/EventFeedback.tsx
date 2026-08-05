import { CARD } from './classes'

export interface EventFeedbackProps {
  readonly text: string | null
}

/**
 * Retour visible du dernier évènement de manche (« Pas de K. À vous de
 * jouer. », « Mauvaise réponse. », etc.) : la même phrase que celle déjà
 * envoyée aux lecteurs d'écran par `LiveRegions`, ici pour l'œil.
 *
 * Aucune live region ici : l'application n'en possède que deux, montées une
 * fois pour toutes dans `LiveRegions.tsx`, et cette phrase y part déjà. En
 * ajouter une troisième dédoublerait l'annonce et rendrait `role="status"`
 * ambigu pour les tests qui l'interrogent au singulier.
 */
export default function EventFeedback({ text }: EventFeedbackProps) {
  if (text === null) return null
  return <p className={`${CARD} text-fg`}>{text}</p>
}
