import type { Theme } from '../storage/settings'

/** Thème réellement appliqué : `system` a été tranché. */
export type ResolvedTheme = 'light' | 'dark'

/**
 * Couleur de la barre d'URL et de la barre d'état, par thème résolu. Elle doit
 * valoir `--wof-bg` : ces deux constantes sont donc la troisième copie de la même
 * valeur, avec `index.css` et `public/theme-init.js`. `theme.test.ts` les compare,
 * faute de pouvoir les partager — le script de bootstrap tourne avant le bundle.
 */
export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#faf7ff',
  dark: '#1b1033',
}

export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return prefersDark ? 'dark' : 'light'
  return theme
}

/**
 * Applique le thème au document : `data-theme` sur `<html>`, puis la couleur de
 * barre d'état.
 *
 * Les deux balises `theme-color` d'`index.html` portent un attribut `media` et
 * couvrent le cas « avant que JavaScript ne tourne ». Ici on écrit **dans les
 * deux** plutôt que d'en ajouter une : le navigateur retient la première dont le
 * média correspond, donc une balise sans média ajoutée en fin de `<head>` serait
 * perdante face à elles et la bascule manuelle n'aurait aucun effet.
 */
export function applyTheme(theme: Theme, prefersDark: boolean, doc: Document): ResolvedTheme {
  const resolved = resolveTheme(theme, prefersDark)
  doc.documentElement.dataset.theme = resolved
  for (const meta of doc.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute('content', THEME_COLORS[resolved])
  }
  return resolved
}

/** Vrai si le système demande le thème sombre. Isolé pour rester testable. */
export function prefersDarkFrom(view: Window): boolean {
  return view.matchMedia('(prefers-color-scheme: dark)').matches
}
