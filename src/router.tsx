import { createBrowserRouter } from 'react-router'
import type { RouteObject } from 'react-router'
import App from './App'
import RequireGame from './components/RequireGame'
import ErrorRoute from './routes/ErrorRoute'
import GameOverRoute from './routes/GameOverRoute'
import GameRoute from './routes/GameRoute'
import HomeRoute from './routes/HomeRoute'
import HowToPlayRoute from './routes/HowToPlayRoute'
import NotFoundRoute from './routes/NotFoundRoute'
import PuzzleEditorRoute from './routes/PuzzleEditorRoute'
import SettingsRoute from './routes/SettingsRoute'

/**
 * Routes en *data mode*, **sans `loader` ni `action`** : aucune donnée ne vient
 * d'un serveur. Ce mode est quand même le bon, parce que `errorElement` et
 * `basename` en dépendent.
 *
 * Exportées à part du routeur pour que les tests montent les mêmes routes dans un
 * `createMemoryRouter` — un routeur de navigateur exigerait de piloter `history`.
 */
export const ROUTES: readonly RouteObject[] = [
  {
    path: '/',
    element: <App />,
    errorElement: <ErrorRoute />,
    children: [
      { index: true, element: <HomeRoute /> },
      { path: 'enigmes', element: <PuzzleEditorRoute /> },
      { path: 'reglages', element: <SettingsRoute /> },
      { path: 'regles', element: <HowToPlayRoute /> },
      // Route pivot sans chemin : la garde n'est écrite qu'une fois pour les deux
      // écrans qui exigent une partie.
      {
        element: <RequireGame />,
        children: [
          { path: 'jeu', element: <GameRoute /> },
          { path: 'resultats', element: <GameOverRoute /> },
        ],
      },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
]

/**
 * `basename` vient de `BASE_URL`, donc du `base` de Vite : le sous-chemin de
 * GitHub Pages n'est écrit qu'à un seul endroit.
 */
// Copie du tableau : `createBrowserRouter` demande un tableau mutable, et `ROUTES`
// reste en lecture seule pour que personne ne le modifie depuis un test.
export const router = createBrowserRouter([...ROUTES], { basename: import.meta.env.BASE_URL })
