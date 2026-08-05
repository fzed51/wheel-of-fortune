import { Link, Outlet } from 'react-router'
import ThemeToggle from './components/ThemeToggle'
import { useApplyTheme } from './hooks/useTheme'

/**
 * Layout racine. Il ne contient que l'ossature : en-tête, contenu, et bientôt les
 * live regions et l'invite de mise à jour. Aucune règle de jeu ici.
 *
 * C'est le seul composant garanti monté en permanence : c'est donc lui qui applique
 * le thème au document.
 */
export default function App() {
  useApplyTheme()

  return (
    <div className="min-h-dvh bg-bg">
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary"
      >
        Aller au contenu
      </a>

      <header className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-6 py-4">
        <Link to="/" className="text-lg font-bold text-fg">
          La Roue de la Fortune
        </Link>
        <ThemeToggle />
      </header>

      <main id="contenu" className="mx-auto max-w-3xl px-6 pb-safe-b">
        <Outlet />
      </main>
    </div>
  )
}
