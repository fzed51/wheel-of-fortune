import { isRouteErrorResponse, useRouteError } from 'react-router'
import { BUTTON_PRIMARY, CARD } from '../components/classes'

/**
 * `errorElement` de la route racine : dernier filet avant l'écran blanc.
 *
 * Le détail technique n'est affiché **qu'en développement**. En production, un
 * message d'exception peut contenir n'importe quelle donnée manipulée au moment de
 * la panne, et il n'y a aucune raison de l'exposer.
 *
 * Il ne consomme aucun contexte : c'est justement le contexte qui peut manquer.
 * Le lien est un `<a>` et non un `<Link>`, pour repartir d'un document neuf plutôt
 * que d'un routeur dont l'état est peut-être la cause de la panne.
 */
export default function ErrorRoute() {
  const error = useRouteError()

  const detail = isRouteErrorResponse(error)
    ? `${String(error.status)} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-10">
      <h1 className="text-2xl font-bold text-fg">Quelque chose s’est mal passé</h1>
      <p className="text-fg-muted">
        L’écran n’a pas pu s’afficher. La partie en cours est enregistrée : rouvrir
        l’accueil devrait suffire.
      </p>
      {import.meta.env.DEV && detail !== null && (
        <pre className={`${CARD} overflow-x-auto text-sm text-fg`}>{detail}</pre>
      )}
      <a href={import.meta.env.BASE_URL} className={`${BUTTON_PRIMARY} self-start`}>
        Revenir à l’accueil
      </a>
    </main>
  )
}
