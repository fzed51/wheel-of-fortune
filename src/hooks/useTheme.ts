import { createContext, useContext, useEffect } from 'react'
import type { Theme } from '../storage/settings'
import { applyTheme, resolveTheme } from '../theme/theme'
import type { ResolvedTheme } from '../theme/theme'
import { useSettings } from './useSettings'

/**
 * Préférence de thème **du système**. `ThemeProvider` est le plus extérieur, donc
 * au-dessus des réglages : il ne peut pas connaître le thème choisi, et c'est voulu.
 * Il ne publie que la réponse à `prefers-color-scheme`, que `useTheme` croise
 * ensuite avec le réglage — ce qui évite une dépendance circulaire.
 */
export const PrefersDarkContext = createContext<boolean | null>(null)

export function usePrefersDark(): boolean {
  const prefersDark = useContext(PrefersDarkContext)
  if (prefersDark === null) throw new Error('usePrefersDark hors de ThemeProvider')
  return prefersDark
}

export interface ThemeStore {
  /** Ce qui est réglé, `system` compris. */
  readonly theme: Theme
  /** Ce qui est affiché, `system` déjà tranché. */
  readonly resolved: ResolvedTheme
  readonly setTheme: (theme: Theme) => void
}

/** Lecture et écriture du thème. **N'applique rien** : voir `useApplyTheme`. */
export function useTheme(): ThemeStore {
  const { settings, update } = useSettings()
  const prefersDark = usePrefersDark()
  return {
    theme: settings.theme,
    resolved: resolveTheme(settings.theme, prefersDark),
    setTheme: (theme: Theme) => {
      update({ theme })
    },
  }
}

/**
 * Écrit le thème dans le document. À appeler **une seule fois**, depuis le layout
 * racine : c'est le seul composant garanti monté en permanence. Le mettre dans
 * `ThemeToggle` casserait la bascule sur un écran qui n'affiche pas le bouton, et
 * l'appeler deux fois ferait deux écritures identiques pour rien.
 */
export function useApplyTheme(): void {
  const { settings } = useSettings()
  const prefersDark = usePrefersDark()
  useEffect(() => {
    applyTheme(settings.theme, prefersDark, document)
  }, [settings.theme, prefersDark])
}
