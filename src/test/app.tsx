import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import type { ReactNode } from 'react'
import { AnnouncerProvider } from '../context/AnnouncerProvider'
import { GameProvider } from '../context/GameProvider'
import { PuzzlesProvider } from '../context/PuzzlesProvider'
import { SettingsProvider } from '../context/SettingsProvider'
import { ThemeProvider } from '../context/ThemeProvider'
import { ROUTES } from '../router'

/**
 * Harnais de rendu des tests DOM.
 *
 * Les providers sont empilés **dans le même ordre que `main.tsx`** : un test qui
 * les monterait autrement validerait une application qui n'existe pas. Le routeur
 * est un `createMemoryRouter` sur les mêmes `ROUTES` — un routeur de navigateur
 * exigerait de piloter `history`, et jsdom ne suit pas les navigations.
 */
export function Providers({ children }: { readonly children: ReactNode }) {
  return (
    <ThemeProvider>
      <SettingsProvider>
        <PuzzlesProvider>
          <AnnouncerProvider>
            <GameProvider>{children}</GameProvider>
          </AnnouncerProvider>
        </PuzzlesProvider>
      </SettingsProvider>
    </ThemeProvider>
  )
}

/** Monte l'application entière sur une URL donnée. */
export function monterApp(path = '/'): RenderResult {
  const router = createMemoryRouter([...ROUTES], { initialEntries: [path] })
  return render(
    <Providers>
      <RouterProvider router={router} />
    </Providers>,
  )
}

/** Monte un composant isolé, avec les contextes mais sans routeur. */
export function monter(node: ReactNode): RenderResult {
  return render(<Providers>{node}</Providers>)
}
