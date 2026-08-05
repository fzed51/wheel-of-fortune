// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ThemeToggle from './ThemeToggle'
import { useApplyTheme } from '../hooks/useTheme'
import { clearAllData, loadSettings } from '../storage/persist'
import { THEME_COLORS } from '../theme/theme'
import { monter } from '../test/app'

const CHOIX = ['Système', 'Clair', 'Sombre'] as const

/**
 * Les deux balises d'`index.html`, avec leur `media` et leur couleur de départ.
 * `applyTheme` doit réécrire les **deux** : le navigateur retient la première dont
 * le média correspond, donc en oublier une laisse la barre d'état sur l'ancien
 * thème.
 */
const BALISES_INITIALES = [
  { media: '(prefers-color-scheme: light)', content: THEME_COLORS.light },
  { media: '(prefers-color-scheme: dark)', content: THEME_COLORS.dark },
] as const

/**
 * `ThemeToggle` n'applique rien au document : c'est `useApplyTheme`, appelé par le
 * layout racine. Ce composant rejoue ce couple sans monter toute l'application.
 */
function AppliqueLeTheme() {
  useApplyTheme()
  return null
}

function monterLaBascule() {
  return monter(
    <>
      <ThemeToggle />
      <AppliqueLeTheme />
    </>,
  )
}

function bouton(nom: string): HTMLElement {
  return screen.getByRole('button', { name: nom })
}

function couleursDeBarre(): readonly (string | null)[] {
  return [...document.querySelectorAll('meta[name="theme-color"]')].map((meta) =>
    meta.getAttribute('content'),
  )
}

beforeEach(() => {
  localStorage.clear()
  // Le repli en mémoire de `persist.ts` survit à `localStorage.clear()` : sans cet
  // appel, les réglages écrits par un test précédent seraient encore relus.
  clearAllData()

  document.documentElement.removeAttribute('data-theme')
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) meta.remove()
  for (const { media, content } of BALISES_INITIALES) {
    const meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    meta.setAttribute('media', media)
    meta.setAttribute('content', content)
    document.head.append(meta)
  }
})

describe('ThemeToggle', () => {
  it('rend les trois choix dans un groupe « Thème », « Système » actif par défaut', () => {
    monterLaBascule()

    const groupe = screen.getByRole('group', { name: 'Thème' })
    const boutons = within(groupe).getAllByRole('button')
    expect(boutons.map((element) => element.textContent)).toEqual([...CHOIX])
    expect(bouton('Système')).toHaveAttribute('aria-pressed', 'true')
  })

  it('déplace l’état pressé sur le choix cliqué', async () => {
    const user = userEvent.setup()
    monterLaBascule()

    await user.click(bouton('Sombre'))

    expect(bouton('Sombre')).toHaveAttribute('aria-pressed', 'true')
    expect(bouton('Système')).toHaveAttribute('aria-pressed', 'false')
  })

  it('applique le thème sombre au document et aux deux balises « theme-color »', async () => {
    const user = userEvent.setup()
    monterLaBascule()

    await user.click(bouton('Sombre'))

    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(couleursDeBarre()).toEqual([THEME_COLORS.dark, THEME_COLORS.dark])
  })

  it('persiste le choix dans les réglages', async () => {
    const user = userEvent.setup()
    monterLaBascule()

    await user.click(bouton('Sombre'))

    expect(loadSettings()).toMatchObject({ ok: true, value: { theme: 'dark' } })
  })

  it('revient au thème clair après être passé par le sombre', async () => {
    const user = userEvent.setup()
    monterLaBascule()

    await user.click(bouton('Sombre'))
    await user.click(bouton('Clair'))

    expect(document.documentElement.dataset.theme).toBe('light')
    expect(couleursDeBarre()).toEqual([THEME_COLORS.light, THEME_COLORS.light])
  })

  it('n’utilise jamais « disabled », même sur le choix actif', async () => {
    const user = userEvent.setup()
    monterLaBascule()

    // Un bouton désactivé perd le focus au profit de `<body>` : l'utilisateur au
    // clavier serait renvoyé en haut de page à chaque bascule.
    for (const nom of CHOIX) expect(bouton(nom)).toBeEnabled()

    await user.click(bouton('Sombre'))

    for (const nom of CHOIX) expect(bouton(nom)).toBeEnabled()
  })
})
