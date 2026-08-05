import { THEMES } from '../storage/settings'
import type { Theme } from '../storage/settings'
import { useTheme } from '../hooks/useTheme'

const LABELS: Record<Theme, string> = {
  system: 'Système',
  light: 'Clair',
  dark: 'Sombre',
}

/**
 * Trois boutons plutôt qu'un interrupteur : « système » est un état à part entière,
 * qu'un interrupteur à deux positions ne sait pas représenter.
 *
 * `aria-pressed` et non `disabled` sur le bouton actif : un bouton désactivé perd
 * le focus au profit de `<body>`, et l'utilisateur au clavier se retrouve en haut
 * de page après chaque bascule.
 */
export default function ThemeToggle() {
  const { theme, setTheme } = useTheme()

  return (
    <div role="group" aria-label="Thème" className="flex gap-1">
      {THEMES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          aria-pressed={candidate === theme}
          onClick={() => {
            setTheme(candidate)
          }}
          className="rounded-md px-2 py-1 text-sm text-fg-muted aria-pressed:bg-primary aria-pressed:text-on-primary"
        >
          {LABELS[candidate]}
        </button>
      ))}
    </div>
  )
}
