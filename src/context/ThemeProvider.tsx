import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { PrefersDarkContext } from '../hooks/useTheme'
import { prefersDarkFrom } from '../theme/theme'

/** Publie la préférence de thème du système, et rien d'autre. */
export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  // Lu au premier rendu, pas dans un effet : sinon le premier rendu suppose
  // « clair » et l'écran clignote quand le système est sombre.
  const [prefersDark, setPrefersDark] = useState(() => prefersDarkFrom(window))

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    // Relu à l'abonnement : la préférence peut avoir changé entre le premier
    // rendu et cet effet.
    setPrefersDark(query.matches)
    const onChange = (event: MediaQueryListEvent) => {
      setPrefersDark(event.matches)
    }
    query.addEventListener('change', onChange)
    return () => {
      query.removeEventListener('change', onChange)
    }
  }, [])

  return <PrefersDarkContext value={prefersDark}>{children}</PrefersDarkContext>
}
