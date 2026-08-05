import { useSyncExternalStore } from 'react'

const QUERY = '(min-width: 640px)'

/**
 * Écart au plan : une container query ne peut pas réordonner le DOM, et monter
 * les deux dispositions à la fois mettrait 52 boutons dans l'arbre
 * d'accessibilité. Le choix se fait donc en JS, sur une media query classique.
 */
function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY)
  query.addEventListener('change', onChange)
  return () => {
    query.removeEventListener('change', onChange)
  }
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches
}

/** Vrai à partir de 640 px de large : bascule vers la disposition AZERTY. */
export function useWideLayout(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot)
}
