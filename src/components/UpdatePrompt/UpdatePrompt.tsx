import { useEffect, useRef } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useAnnouncer } from '../../hooks/useAnnouncer'
import UpdateBanner, { UPDATE_MESSAGE } from './UpdateBanner'

/**
 * Coquille de câblage : elle isole le hook d'infrastructure (`useRegisterSW`,
 * qui parle au service worker réel) du composant d'affichage testable
 * `UpdateBanner`.
 *
 * Elle n'est pas testée, et ne peut pas l'être en l'état : en dev comme en test,
 * le plugin remplace le module virtuel par un stub inerte dont `needRefresh`
 * vaut toujours `false`. Aucun test ne peut donc atteindre ni l'annonce, ni le
 * rappel de `visibilitychange` — ces deux chemins ne se vérifient qu'à la main,
 * sur un vrai build servi par `yarn preview`.
 */
export default function UpdatePrompt() {
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
