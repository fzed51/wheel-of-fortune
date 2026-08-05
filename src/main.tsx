import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router/dom'
import './index.css'
import { AnnouncerProvider } from './context/AnnouncerProvider'
import { GameProvider } from './context/GameProvider'
import { PuzzlesProvider } from './context/PuzzlesProvider'
import { SettingsProvider } from './context/SettingsProvider'
import { ThemeProvider } from './context/ThemeProvider'
import { router } from './router'

const root = document.getElementById('root')
if (root === null) throw new Error('Élément #root absent de index.html')

/**
 * Providers montés **au-dessus** du routeur, pas dans le layout de route : une
 * garde `<Navigate>` ne peut alors jamais rendre avant que le contexte existe.
 *
 * L'ordre est imposé par les dépendances : `SettingsProvider` enveloppe
 * `GameProvider`, qui a besoin de savoir si un juge est disponible, et
 * `PuzzlesProvider` le précède parce que le tirage d'énigme puise dans son lot.
 */
createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <SettingsProvider>
        <PuzzlesProvider>
          <AnnouncerProvider>
            <GameProvider>
              <RouterProvider router={router} />
            </GameProvider>
          </AnnouncerProvider>
        </PuzzlesProvider>
      </SettingsProvider>
    </ThemeProvider>
  </StrictMode>,
)
