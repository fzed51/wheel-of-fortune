import { Link } from 'react-router'
import { BUTTON_PRIMARY } from '../components/classes'

/**
 * Route attrape-tout. Elle est enfant du layout, donc l'en-tête et la navigation
 * restent en place : une PWA rechargée sur une URL périmée ne doit pas laisser
 * l'utilisateur dans un cul-de-sac.
 */
export default function NotFoundRoute() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-semibold text-fg">Écran introuvable</h2>
      <p className="text-fg-muted">Cette adresse ne correspond à aucun écran du jeu.</p>
      <Link to="/" className={`${BUTTON_PRIMARY} self-start`}>
        Revenir à l’accueil
      </Link>
    </div>
  )
}
