import { afterEach } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { installerMatchMedia, reinitialiserMedia } from './media'

// Ce fichier est chargé pour tous les tests, y compris ceux qui tournent en
// environnement `node`, où il n'y a aucun DOM à nettoyer.
// Avec `globals: false`, Testing Library n'enregistre pas son cleanup
// automatique : il faut le faire explicitement.
if (typeof document !== 'undefined') {
  // jsdom n'implémente pas `matchMedia` : sans ce stub, tout test qui monte
  // l'application casse dès `ThemeProvider`.
  installerMatchMedia(window)
  afterEach(cleanup)
  afterEach(reinitialiserMedia)
}
