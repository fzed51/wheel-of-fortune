import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { nextRotation } from './geometry'
import { SPIN_LAUNCH_MS, SPIN_MS } from '../../game/wheel'
import type { SpinOutcome } from '../../game/types'

/** Léger dépassement avant l'arrêt final, pour que le rebond se sente sans rejouer un tour complet. */
const OVERSHOOT_DEGREES = 3
/** Deux tours de lancement à vitesse constante, avant le ralentissement. */
const LAUNCH_TURNS_DEGREES = 720
/** Repli sans WAAPI/mouvement réduit : délai avant de considérer la roue arrêtée. */
const REDUCED_MOTION_SETTLE_MS = 300

/**
 * Anime la rotation de la roue vers le segment tiré, et appelle `onSettled`
 * une fois l'arrêt effectif. La ref renvoyée se pose sur le `<div>` rotor —
 * jamais un `<g>` interne du SVG : un `transform` sur un `<g>` n'est pas
 * fiablement promu en couche composite, et beaucoup de moteurs repeignent
 * tout le SVG à chaque image, ce qui saccade sur Android milieu de gamme.
 */
export function useWheelSpin(spin: SpinOutcome | null, onSettled: () => void): RefObject<HTMLDivElement | null> {
  const rotorRef = useRef<HTMLDivElement | null>(null)
  // Rotation absolue cumulée : ne jamais remettre à zéro sous peine de faire
  // sauter la roue en arrière au tirage suivant.
  const rotationRef = useRef(0)
  const animationRef = useRef<Animation | null>(null)

  // « Latest ref » : assignées pendant le rendu, lues seulement depuis l'effet
  // ou un gestionnaire. Ça garde le tableau de dépendances de l'effet réduit à
  // `[spin?.spinId]` sans pour autant travailler sur des valeurs périmées.
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled
  const spinRef = useRef(spin)
  spinRef.current = spin

  useEffect(() => {
    // Annule toute animation en cours avant d'en lancer une autre : sans ça,
    // StrictMode (double-invocation des effets) lancerait deux animations
    // concurrentes, dont deux promesses `finished` qui joueraient le tour deux fois.
    animationRef.current?.cancel()

    const currentSpin = spinRef.current
    if (currentSpin === null) return

    const element = rotorRef.current
    if (element === null) return

    const from = rotationRef.current
    const to = nextRotation(from, currentSpin)
    rotationRef.current = to

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Mouvement réduit ou WAAPI absente (jsdom, navigateur ancien) : même
    // chemin de sortie, exprès. La machine à états ne doit connaître qu'un
    // seul flux — `onSettled` appelé dans les deux branches — sinon il faudrait
    // tester deux enchaînements de jeu distincts. Ici on *supprime* la rotation,
    // on ne la raccourcit pas : c'est ce que demande la préférence utilisateur.
    if (prefersReducedMotion || typeof element.animate !== 'function') {
      element.style.transform = `rotate(${to}deg)`
      const timer = setTimeout(() => {
        onSettledRef.current()
      }, REDUCED_MOTION_SETTLE_MS)
      return () => {
        clearTimeout(timer)
      }
    }

    // Couche composite dédiée uniquement pendant l'animation : la garder en
    // permanence coûterait une couche pour rien le reste du temps.
    element.style.willChange = 'transform'
    element.style.contain = 'paint'

    const animation = element.animate(
      [
        { offset: 0, transform: `rotate(${from}deg)`, easing: 'linear' },
        {
          offset: SPIN_LAUNCH_MS / SPIN_MS,
          transform: `rotate(${from + LAUNCH_TURNS_DEGREES}deg)`,
          easing: 'cubic-bezier(.17,.67,.12,1)',
        },
        { offset: 0.94, transform: `rotate(${to + OVERSHOOT_DEGREES}deg)` },
        { offset: 1, transform: `rotate(${to}deg)` },
      ],
      { duration: SPIN_MS, fill: 'forwards' },
    )
    animationRef.current = animation

    // Un onglet en arrière-plan bride les animations : `finished` pourrait ne
    // se résoudre qu'au retour au premier plan, et la partie resterait figée
    // en attendant. `finish()` force la résolution immédiate.
    function handleVisibilityChange(): void {
      if (document.hidden) animation.finish()
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    // L'onglet peut déjà être caché au lancement — un bot qui lance la roue
    // pendant que l'utilisateur est ailleurs, à l'étape suivante. Aucun
    // `visibilitychange` ne se déclencherait alors, et il faudrait attendre le
    // chien de garde : on tranche tout de suite.
    handleVisibilityChange()

    // Le composant peut être démonté avant la résolution de `finished` : le
    // drapeau évite d'appeler `onSettled` sur un rotor disparu.
    let active = true

    animation.finished
      .then(() => {
        if (!active) return
        // Désabonnement dès la fin naturelle, et pas seulement au nettoyage :
        // un `finish()` sur une animation déjà annulée réappliquerait son
        // remplissage avant, pour rien.
        document.removeEventListener('visibilitychange', handleVisibilityChange)
        // Fige la valeur exacte dans le style inline, puis retire l'animation :
        // sans `cancel()` après `commitStyles()`, l'animation resterait active.
        animation.commitStyles()
        animation.cancel()
        element.style.willChange = ''
        element.style.contain = ''
        onSettledRef.current()
      })
      .catch(() => {
        // `cancel()` rejette `finished` avec une `AbortError` : c'est le cas
        // normal du nettoyage ci-dessous, rien à faire.
      })

    return () => {
      active = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      animationRef.current?.cancel()
    }
  }, [spin?.spinId])

  return rotorRef
}
