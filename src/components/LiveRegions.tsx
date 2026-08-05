import { useAnnouncements } from '../hooks/useAnnouncer'

/**
 * Les deux live regions de l'application, montées une seule fois dans le layout
 * racine et pour toute la durée de vie de l'app. Une live region créée au moment où
 * le message arrive n'annonce rien : le navigateur doit l'observer avant que son
 * contenu change.
 *
 * Chaque région elle-même reste montée en permanence — seul le nœud interne qui
 * porte le texte se remonte, sur l'`id` du message. C'est ce remontage qui force la
 * relecture : une live region ne rediffuse pas un texte identique au précédent, donc
 * deux annonces successives du même texte ne seraient lues qu'une fois sans lui.
 */
export default function LiveRegions() {
  const { status, alert } = useAnnouncements()

  return (
    <>
      <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        <span key={status.id}>{status.text}</span>
      </div>
      {/* `role="alert"` est implicitement assertif : ajouter `aria-live="assertive"`
          ferait doublon. Réservé aux échecs techniques, jamais aux événements de jeu. */}
      <div role="alert" className="sr-only">
        <span key={alert.id}>{alert.text}</span>
      </div>
    </>
  )
}
