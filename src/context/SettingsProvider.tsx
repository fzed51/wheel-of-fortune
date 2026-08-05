import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { SettingsContext } from '../hooks/useSettings'
import type { SettingsStore } from '../hooks/useSettings'
import {
  clearMistralKey,
  loadMistralKey,
  loadSettings,
  saveMistralKey,
  saveSettings,
} from '../storage/persist'
import { DEFAULT_SETTINGS } from '../storage/settings'
import type { Settings } from '../storage/settings'

export function SettingsProvider({ children }: { readonly children: ReactNode }) {
  // Hydratation synchrone : un `useEffect` ferait afficher les réglages par défaut
  // le temps d'un rendu, donc un flash de thème et un formulaire qui se remplit
  // sous les doigts de l'utilisateur.
  const [settings, setSettings] = useState<Settings>(() => {
    const decoded = loadSettings()
    return decoded.ok ? decoded.value : DEFAULT_SETTINGS
  })
  const [hasMistralKey, setHasMistralKey] = useState(() => loadMistralKey() !== null)

  // L'écriture se fait dans le gestionnaire, pas dans un effet : un effet
  // réécrirait les réglages au montage et serait double-invoqué par StrictMode.
  // Le calcul reste **hors** de l'updater de `setSettings`, que React peut lui
  // aussi invoquer deux fois : une écriture de stockage n'a rien à y faire.
  const update = useCallback(
    (patch: Partial<Settings>) => {
      const next = { ...settings, ...patch }
      saveSettings(next)
      setSettings(next)
    },
    [settings],
  )

  // La clé traverse cette fonction sans être conservée : ni état, ni ref, ni
  // journal. Seule sa présence est retenue.
  const setMistralKey = useCallback((key: string) => {
    saveMistralKey(key)
    setHasMistralKey(loadMistralKey() !== null)
  }, [])

  const forgetMistralKey = useCallback(() => {
    clearMistralKey()
    setHasMistralKey(false)
  }, [])

  const store = useMemo<SettingsStore>(
    () => ({ settings, hasMistralKey, update, setMistralKey, forgetMistralKey }),
    [settings, hasMistralKey, update, setMistralKey, forgetMistralKey],
  )

  return <SettingsContext value={store}>{children}</SettingsContext>
}
