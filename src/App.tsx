/**
 * Coquille de l'application. Le routeur, l'en-tête et les live regions arrivent
 * avec la navigation ; ce fichier ne garde ici que de quoi vérifier que Tailwind
 * et les tokens de thème sont bien câblés.
 */
export default function App() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center gap-4 px-6 pb-safe-b text-center">
      <h1 className="text-3xl font-bold text-fg">La Roue de la Fortune</h1>
      <p className="text-fg-muted">Les écrans de jeu arrivent aux étapes suivantes.</p>
      <span className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-on-primary">
        Thème clair et sombre
      </span>
    </main>
  )
}
