import { useEffect, useRef } from 'react'
import { useRegisterSW as useRegisterSWDefault } from 'virtual:pwa-register/react'
import { useAnnouncer } from '../../hooks/useAnnouncer'
import UpdateBanner, { UPDATE_MESSAGE } from './UpdateBanner'

interface UpdatePromptProps {
  /**
   * Couture d'injection, à l'image de `createJudge` (`src/llm/index.ts`), qui
   * reçoit un `fetchImpl` de test plutôt que de mocker `fetch` globalement.
   * En production, la valeur par défaut est le vrai hook du module virtuel :
   * le comportement livré ne change pas d'un iota.
   *
   * En dev comme en test, le plugin PWA remplace `virtual:pwa-register/react`
   * par un stub inerte dont `needRefresh` vaut toujours `false` — sans cette
   * prop, l'annonce et le rappel de `visibilitychange` resteraient hors de
   * portée de tout test et ne se vérifieraient qu'à la main, sur un vrai
   * build servi par `yarn preview`. Les tests de ce dossier fournissent un
   * stub qui pilote `needRefresh` et livre une fausse
   * `ServiceWorkerRegistration`.
   */
  readonly useRegisterSW?: typeof useRegisterSWDefault
}

/**
 * Coquille de câblage : elle isole le hook d'infrastructure (`useRegisterSW`,
 * qui parle au service worker réel) du composant d'affichage testable
 * `UpdateBanner`.
 */
export default function UpdatePrompt({ useRegisterSW = useRegisterSWDefault }: UpdatePromptProps = {}) {
  const registrationRef = useRef<ServiceWorkerRegistration | undefined>(undefined)
  const { say } = useAnnouncer()

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      registrationRef.current = registration
    },
  })

  /*
   * L'annonce passe par la live region du layout, pas par un `role="status"`
   * propre à la bannière : celle-là est montée depuis le premier rendu, donc
   * observée par le lecteur d'écran avant que le message n'y arrive.
   *
   * `say` est stable à vie, la dépendance ne redéclenche donc rien ; c'est
   * `needRefresh` qui pilote, et il ne repasse jamais de faux à vrai sans une
   * nouvelle version.
   */
  useEffect(() => {
    if (needRefresh) say(UPDATE_MESSAGE)
  }, [needRefresh, say])

  useEffect(() => {
    // Une PWA installée sur iOS n'est jamais vraiment fermée : revenir dessus
    // ne redémarre pas le processus, donc rien ne redéclencherait la détection
    // d'une nouvelle version sans ce rappel explicite au retour au premier plan.
    function handleVisibilityChange() {
      if (document.visibilityState !== 'visible') return
      const registration = registrationRef.current
      if (registration === undefined) return
      // Hors ligne, `update()` rejette : c'est un cas normal, pas une panne à
      // journaliser.
      registration.update().catch(() => {})
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  function handleUpdate() {
    // Le rechargement de page est piloté par le service worker lui-même ;
    // il n'y a rien à attendre côté interface une fois l'appel lancé.
    void updateServiceWorker(true)
  }

  function handleDismiss() {
    setNeedRefresh(false)
  }

  return <UpdateBanner needRefresh={needRefresh} onUpdate={handleUpdate} onDismiss={handleDismiss} />
}
