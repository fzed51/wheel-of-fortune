import { Link, Outlet } from 'react-router'
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

      <header className="mx-auto flex max-w-3xl items-center px-6 py-4">
        {/*
          L'icône est décorative : le nom accessible du lien reste le seul titre,
          sinon un lecteur d'écran annoncerait deux fois la même chose. Elle est
          servie depuis `public/favicon.svg`, la source unique des icônes de la
          PWA, plutôt que redessinée ici — une roue de plus à maintenir.
        */}
        <Link to="/" className="flex items-center gap-2 text-lg font-bold text-fg">
          <img src="/favicon.svg" alt="" aria-hidden="true" className="size-7 shrink-0" />
          La Roue de la Fortune
        </Link>
      </header>

      <UpdatePrompt />

      <main id="contenu" className="mx-auto max-w-3xl px-6 pb-safe-b">
        <Outlet />
      </main>
    </div>
  )
}
