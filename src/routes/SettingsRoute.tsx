import { CARD, FIELD } from '../components/classes'
import ThemeToggle from '../components/ThemeToggle'
import { useSettings } from '../hooks/useSettings'

/**
 * Réglages. Coquille : la saisie de la clé Mistral et la remise à zéro des données
 * arrivent avec le connecteur, pour que la clé et le juge soient écrits d'un seul
 * tenant plutôt qu'à moitié.
 */
export default function SettingsRoute() {
  const { hasMistralKey } = useSettings()

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="font-semibold text-fg">Apparence</h2>
        <div className={FIELD}>
          <span className="text-fg">Thème</span>
          <ThemeToggle />
        </div>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Résolution jugée par IA</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {hasMistralKey
            ? 'Une clé est enregistrée sur cet appareil : « Résoudre » est disponible.'
            : 'Aucune clé enregistrée : « Résoudre » reste indisponible.'}
        </p>
        <p className="mt-2 text-sm text-fg-muted">La saisie de la clé arrive plus tard.</p>
      </section>
    </div>
  )
}
