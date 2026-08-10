import { createContext, useContext } from 'react'
import type { Settings } from '../storage/settings'

/**
 * Réglages persistés.
 *
 * **La clé Mistral n'entre jamais dans cette valeur de contexte.** Seul le booléen
 * `hasMistralKey` en sort : c'est la seule chose dont le reste de l'application a
 * besoin — savoir qu'une clé existe, jamais laquelle. Les écrans qui doivent
 * afficher un indice de clé la relisent eux-mêmes depuis le stockage, ce qui garde
 * la valeur hors de tout instantané d'état React, donc hors des messages d'erreur
 * et des outils de dev.
 *
 * Les commandes sont déclarées en **propriétés fonction**, pas en méthodes : une
 * méthode déstructurée déclenche `unbound-method`, et ces fonctions n'ont de toute
 * façon aucun `this`.
 */
export interface SettingsStore {
  readonly settings: Settings
  readonly hasMistralKey: boolean
  readonly update: (patch: Partial<Settings>) => void
  readonly setMistralKey: (key: string) => void
  readonly forgetMistralKey: () => void
}

/**
 * Le contexte vit avec son lecteur, hors du fichier du provider : un fichier de
 * composants qui exporte autre chose casse le rafraîchissement à chaud, et
 * `react/only-export-components` le signale.
 */
export const SettingsContext = createContext<SettingsStore | null>(null)

export function useSettings(): SettingsStore {
  const store = useContext(SettingsContext)
  if (store === null) throw new Error('useSettings hors de SettingsProvider')
  return store
}
