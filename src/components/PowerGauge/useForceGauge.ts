import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'

/** Durée d'un aller (ou d'un retour) du balayage de la jauge, en millisecondes. */
const GAUGE_SWEEP_MS = 900

/**
 * Facteur appliqué à `GAUGE_SWEEP_MS` sous mouvement réduit : le garde global
 * `@media (prefers-reduced-motion: reduce)` de `src/index.css` neutralise les
 * animations CSS, mais n'a aucune prise sur la Web Animations API — c'est
 * pourquoi cette jauge y passe explicitement, et pourquoi elle doit se
 * ralentir elle-même plutôt que de compter sur ce garde. On ralentit le
 * balayage, on ne le supprime pas : sans jauge visible il n'y a plus de jeu
 * du tout, et c'est le mode « lancer simple » d'une tâche à venir qui sert de
 * vrai chemin de repli.
 */
const REDUCED_MOTION_GAUGE_FACTOR = 2.5

/** Force renvoyée quand l'animation n'a pas pu être mesurée (WAAPI absente, jsdom). */
const FALLBACK_FORCE = 0.5

export interface ForceGauge {
  readonly charging: boolean
  readonly markerRef: RefObject<HTMLDivElement | null>
  readonly start: () => void
  /** Force ∈ [0,1] ; `null` si la jauge n'était pas en charge. */
  readonly fire: () => number | null
  readonly cancel: () => void
}

/**
 * Jauge de puissance à deux temps : `start()` arme la charge, `fire()` la lit
 * et l'arrête. La force sort en `[0,1]`, à passer telle quelle à la commande
 * `spin`.
 */
export function useForceGauge(): ForceGauge {
  const [charging, setCharging] = useState(false)
  const markerRef = useRef<HTMLDivElement | null>(null)
  const animationRef = useRef<Animation | null>(null)
  // Mémorisée pour que `fire()` divise `currentTime` par la même durée que
  // celle réellement utilisée par l'effet (mouvement réduit ou non).
  const sweepMsRef = useRef(GAUGE_SWEEP_MS)

  // L'animation ne démarre pas dans `start()` : `PowerGauge` n'est monté que
  // pendant la charge, donc au moment où `start()` s'exécute le marqueur
  // n'est pas encore dans le DOM et `markerRef.current` vaut `null`. `start()`
  // se contente donc de faire passer `charging` à vrai ; c'est cet effet, qui
  // s'exécute après le rendu qui monte `PowerGauge`, qui trouve le nœud.
  useEffect(() => {
    if (!charging) return

    const marker = markerRef.current
    if (marker === null || typeof marker.animate !== 'function') return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sweepMs = prefersReducedMotion ? GAUGE_SWEEP_MS * REDUCED_MOTION_GAUGE_FACTOR : GAUGE_SWEEP_MS
    sweepMsRef.current = sweepMs

    // Écart au plan initial, assumé : les keyframes prévues en
    // `translateX(0%)` → `translateX(100%)` sont fausses géométriquement — un
    // pourcentage de `translateX` se rapporte à la largeur de l'élément
    // translaté lui-même, donc un curseur de quelques pixels ne balaierait
    // que sa propre largeur au lieu de la barre entière. La course se calcule
    // donc en pixels, à partir de la largeur utile du conteneur. Sous jsdom
    // ces mesures valent 0, donc `span` vaut 0 et le curseur ne bouge pas —
    // sans conséquence : la force se lit sur `currentTime`, jamais sur la
    // géométrie. Un redimensionnement de fenêtre en pleine charge laisserait
    // `span` périmé ; acceptable sur une charge de quelques secondes.
    const span = Math.max(0, (marker.parentElement?.clientWidth ?? 0) - marker.offsetWidth)

    const animation = marker.animate(
      [{ transform: 'translateX(0px)' }, { transform: `translateX(${span}px)` }],
      { duration: sweepMs, iterations: Infinity, direction: 'alternate', easing: 'linear' },
    )
    animationRef.current = animation

    return () => {
      animation.cancel()
      animationRef.current = null
    }
  }, [charging])

  function start(): void {
    setCharging(true)
  }

  function fire(): number | null {
    if (!charging) return null

    // Lu avant `setCharging(false)` : l'effet de nettoyage annulerait
    // `animationRef.current` en réaction au changement d'état, trop tard pour
    // le lire ici sinon.
    const animation = animationRef.current
    setCharging(false)

    if (animation === null || animation.currentTime === null) return FALLBACK_FORCE

    // Lu sur `currentTime`, jamais sur `getComputedTiming().progress` : ce
    // dernier est ambigu vis-à-vis de `direction: 'alternate'` (il ne dit pas
    // de lui-même si l'aller ou le retour est en cours). L'onde triangulaire
    // reconstruit donc la progression réelle : un aller-retour complet dure
    // `2 * sweepMs`, et le second temps se lit à l'envers.
    const t = (Number(animation.currentTime) / sweepMsRef.current) % 2
    return t <= 1 ? t : 2 - t
  }

  function cancel(): void {
    setCharging(false)
  }

  return { charging, markerRef, start, fire, cancel }
}
