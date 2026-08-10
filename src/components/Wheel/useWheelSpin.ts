import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import type { SpinLanding } from '../../game/types'

/** Repli sans WAAPI/mouvement réduit : délai avant de considérer la roue arrêtée. */
const REDUCED_MOTION_SETTLE_MS = 300
/** Constante de la décroissance exponentielle de la course : plus haut, l'arrêt est plus sec. */
const DECAY_K = 3.4
/** Nombre de points de la trajectoire échantillonnée, entre le lancer et l'arrêt. */
const KEYFRAME_SAMPLES = 24

/**
 * Anime la course réelle décidée par le moteur (`spin.travel`, `spin.durationMs`),
 * et appelle `onSettled` une fois l'arrêt effectif. La ref renvoyée se pose sur
 * le `<div>` rotor — jamais un `<g>` interne du SVG : un `transform` sur un `<g>`
 * n'est pas fiablement promu en couche composite, et beaucoup de moteurs
 * repeignent tout le SVG à chaque image, ce qui saccade sur Android milieu de
 * gamme.
 */
export function useWheelSpin(
  angle: number,
  spin: SpinLanding | null,
  onSettled: () => void,
): RefObject<HTMLDivElement | null> {
  const rotorRef = useRef<HTMLDivElement | null>(null)
  // Rotation absolue cumulée : ne jamais remettre à zéro sous peine de faire
  // sauter la roue en arrière au tirage suivant. `null` tant que l'effet ne l'a
  // pas hydratée depuis `angle` — voir `??=` ci-dessous.
  const rotationRef = useRef<number | null>(null)
  const animationRef = useRef<Animation | null>(null)

  // « Latest ref » : assignées pendant le rendu, lues seulement depuis l'effet
  // ou un gestionnaire. Ça garde le tableau de dépendances de l'effet réduit à
  // `[spin?.spinId]` sans pour autant travailler sur des valeurs périmées.
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled
  const spinRef = useRef(spin)
  spinRef.current = spin
  const angleRef = useRef(angle)
  angleRef.current = angle

  useEffect(() => {
    // Annule toute animation en cours avant d'en lancer une autre : sans ça,
    // StrictMode (double-invocation des effets) lancerait deux animations
    // concurrentes, dont deux promesses `finished` qui joueraient le tour deux fois.
    animationRef.current?.cancel()

    // Hydratation depuis l'angle de repos de l'état, une seule fois : un
    // remontage (retour de l'étape bonus) ne doit pas faire sauter la roue à
    // zéro alors que le modèle sait déjà où elle s'est arrêtée.
    rotationRef.current ??= angleRef.current

    const currentSpin = spinRef.current
    const element = rotorRef.current
    if (element === null) return

    if (currentSpin === null) {
      // Hors rotation : la roue doit rester exactement où `rotationRef` la
      // laisse. Sans ça elle se dessinerait à 0° au premier rendu, en
      // désaccord avec l'état, et le premier lancer sauterait au démarrage.
      // Idempotent : après une animation terminée, `commitStyles()` a déjà
      // posé cette valeur.
      element.style.transform = `rotate(${rotationRef.current}deg)`
      return
    }

    const from = rotationRef.current
    const to = from + currentSpin.travel
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

    // Décroissance exponentielle échantillonnée en keyframes : une vraie roue
    // freinée par friction ralentit ainsi, pas en accélérant d'abord comme le
    // ferait un easing générique. `denom` normalise la progression pour que le
    // dernier échantillon (t = 1) vaille exactement 1, donc que la course
    // parcourue soit exactement `travel`.
    const denom = 1 - Math.exp(-DECAY_K)
    const frames = Array.from({ length: KEYFRAME_SAMPLES + 1 }, (_, i) => {
      const t = i / KEYFRAME_SAMPLES
      const progress = (1 - Math.exp(-DECAY_K * t)) / denom
      return { offset: t, transform: `rotate(${from + currentSpin.travel * progress}deg)`, easing: 'linear' }
    })
    const animation = element.animate(frames, { duration: currentSpin.durationMs, fill: 'forwards' })
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
