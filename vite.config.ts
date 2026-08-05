import { defineConfig } from 'vitest/config'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Déploiement sur un sous-chemin GitHub Pages. Source unique : `basename` du
  // routeur et le chemin de `theme-init.js` en dérivent via `BASE_URL`.
  base: '/wheel-of-fortune/',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  test: {
    globals: false,
    // Défaut volontaire : le moteur de jeu se teste sans DOM. Les rares fichiers
    // qui en ont besoin déclarent `// @vitest-environment jsdom` en tête.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // Sans ça, Vitest renvoie une chaîne vide pour tout import CSS, `?raw` compris.
    // `theme.test.ts` compare les couleurs des tokens à celles du script de
    // bootstrap, et c'est le seul test qui importe une feuille de style.
    css: true,
  },
})
