// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
// Lus en texte brut plutôt qu'avec `node:fs` : le typage de l'application n'expose
// que `vite/client`, et lui ouvrir les API Node laisserait un composant importer
// le système de fichiers.
import script from '../../public/theme-init.js?raw'
import styles from '../index.css?raw'
import { SCHEMA_VERSION, STORAGE_KEYS } from '../storage/keys'
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

/**
 * Le script n'est pas un module : impossible d'en importer une fonction, donc
 * impossible d'appeler `installerMatchMedia` sur la même réalité que celle où
 * il tourne.
 *
 * Deux pistes écartées avant celle-ci :
 * - `new Function(script)` est ce que `no-implied-eval` interdit nommément,
 *   et `eval(script)` déclenche la même famille de règle (`no-eval`) ;
 * - une balise `<script>` injectée seule échoue autrement : jsdom l'exécute
 *   dans une réalité distincte de celle où `installerMatchMedia` a posé son
 *   double sur `window` — `window.matchMedia` y est tout simplement absent, et
 *   seul le cas « thème forcé », qui court-circuite l'appel, s'en sortirait.
 *
 * La solution : injecter le double de `matchMedia` **dans la même balise**
 * que le bootstrap, avant lui. Les deux tournent alors dans la même réalité
 * jsdom, quelle qu'elle soit — le double n'a plus besoin d'être partagé avec
 * l'extérieur.
 */
function executerBootstrap(systemePrefereSombre: boolean): void {
  const doubleMatchMedia =
    'window.matchMedia = function (requete) {' +
    `  return { matches: ${String(systemePrefereSombre)} && requete.indexOf('dark') !== -1 }` +
    '}\n'
  const balise = document.createElement('script')
  balise.textContent = doubleMatchMedia + script
  document.head.appendChild(balise)
  balise.remove()
}

describe('bootstrap du thème — exécution réelle', () => {
  function nettoyer(): void {
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    // Les balises `theme-color` posées par un test voisin (`applyTheme`) ne
    // doivent pas laisser croire qu'une exécution précédente a réussi ici.
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove()
  }

  beforeEach(nettoyer)
  afterEach(nettoyer)

  it('applique le thème stocké quand l’enveloppe est à la version courante', () => {
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ version: SCHEMA_VERSION, value: { theme: 'dark' } }),
    )
    executerBootstrap(false)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('ignore une enveloppe d’une version périmée et retombe sur le système', () => {
    // Une version différente de `SCHEMA_VERSION` est rejetée par l'application
    // (`decodeRecord`) : le bootstrap doit se comporter pareil, sinon l'écran
    // sombre lu ici serait aussitôt rebasculé au clair par le rendu React —
    // exactement le flash que ce fichier existe pour éviter.
    localStorage.setItem(
      STORAGE_KEYS.settings,
      JSON.stringify({ version: SCHEMA_VERSION - 1, value: { theme: 'dark' } }),
    )
    executerBootstrap(false)
    expect(document.documentElement.dataset.theme).toBe('light')
  })

  it('retombe sur la préférence système sans aucune enveloppe en stockage', () => {
    executerBootstrap(true)
    expect(document.documentElement.dataset.theme).toBe('dark')
  })
})
