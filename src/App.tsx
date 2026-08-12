import { Link, Outlet } from 'react-router'
import BrandMark from './components/BrandMark'
import LiveRegions from './components/LiveRegions'
import UpdatePrompt from './components/UpdatePrompt'
import { useApplyTheme } from './hooks/useTheme'

/**
 * Layout racine. Il ne contient que l'ossature : en-tête, contenu, les live regions
 * et l'invite de mise à jour du service worker. Aucune règle de jeu ici.
 *
 * C'est le seul composant garanti monté en permanence : c'est donc lui qui applique
 * le thème au document, et qui monte les live regions une fois pour toute la partie.
 */
export default function App() {
  useApplyTheme()

  return (
    <div className="min-h-dvh bg-bg">
      <LiveRegions />
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:m-2 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-on-primary"
      >
        Aller au contenu
      </a>

      {/*
        Le filet du bas donne son assise à l'en-tête. Sans lui, le titre flottait
        au-dessus du contenu sans rien qui l'en sépare — d'autant plus depuis que
        la bascule de thème est partie et qu'il n'y a plus qu'un seul élément.
      */}
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-3xl items-center px-6 py-3">
          <Link
            to="/"
            className="-mx-2 flex items-center gap-2.5 rounded-lg px-2 py-1 text-lg font-bold tracking-tight text-fg hover:bg-bg-soft"
          >
            <BrandMark className="size-8 shrink-0" />
            La Roue de la Fortune
          </Link>
        </div>
      </header>

      <UpdatePrompt />

      <main id="contenu" className="mx-auto max-w-3xl px-6 pb-safe-b">
        <Outlet />
      </main>
    </div>
  )
}
