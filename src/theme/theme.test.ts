// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
// Lus en texte brut plutôt qu'avec `node:fs` : le typage de l'application n'expose
// que `vite/client`, et lui ouvrir les API Node laisserait un composant importer
// le système de fichiers.
import script from '../../public/theme-init.js?raw'
import styles from '../index.css?raw'
import { STORAGE_KEYS } from '../storage/keys'
import { THEME_COLORS, applyTheme, prefersDarkFrom, resolveTheme } from './theme'

describe('resolveTheme', () => {
  it('tranche « système » selon la préférence du navigateur', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  it('ignore la préférence du système quand le thème est choisi', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('applyTheme', () => {
  function preparer(): void {
    document.documentElement.removeAttribute('data-theme')
    document.head.innerHTML =
      '<meta name="theme-color" content="#faf7ff" media="(prefers-color-scheme: light)" />' +
      '<meta name="theme-color" content="#1b1033" media="(prefers-color-scheme: dark)" />'
  }

  it('pose `data-theme` sur la racine', () => {
    preparer()
    expect(applyTheme('dark', false, document)).toBe('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('réécrit les deux balises `theme-color`, média compris', () => {
    // Une balise sans média ajoutée en fin de `<head>` perdrait contre celles-ci :
    // le navigateur retient la première dont le média correspond.
    preparer()
    applyTheme('dark', false, document)
    const contenus = [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
      meta.getAttribute('content'),
    )
    expect(contenus).toEqual([THEME_COLORS.dark, THEME_COLORS.dark])
  })

  it('revient au clair quand le thème est forcé clair sur un système sombre', () => {
    preparer()
    expect(applyTheme('light', true, document)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
  })
})

describe('prefersDarkFrom', () => {
  it('lit la requête média, sans en supposer le résultat', () => {
    const view = { matchMedia: () => ({ matches: true }) } as unknown as Window
    expect(prefersDarkFrom(view)).toBe(true)
  })
})

/**
 * `theme-init.js` tourne avant le bundle : il ne peut rien importer, donc il
 * recopie la clé de stockage et les deux couleurs de fond. Ces tests sont le seul
 * garde-fou contre une divergence silencieuse.
 */
describe('bootstrap du thème', () => {
  it('lit la même clé de réglages que le reste de l’application', () => {
    expect(script).toContain(STORAGE_KEYS.settings)
  })

  it('utilise les mêmes couleurs de fond que les tokens CSS', () => {
    for (const color of Object.values(THEME_COLORS)) {
      expect(script, `${color} absente du bootstrap`).toContain(color)
      expect(styles, `${color} absente des tokens`).toContain(color)
    }
  })

  it('n’est pas un module, pour rester chargeable en script classique', () => {
    expect(script).not.toMatch(/^\s*(import|export)\s/m)
  })
})
