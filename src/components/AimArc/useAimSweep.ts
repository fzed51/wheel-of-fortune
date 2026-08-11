import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { AIM_SPAN_DEGREES, normalizeDegrees } from '../../game/wheel'

/**
 * Durée d'un aller (ou d'un retour) du balayage de l'arc de visée, en
 * millisecondes. Le double des 900 ms de l'ancienne jauge de puissance : la
 * course couvre désormais un tour complet (`AIM_SPAN_DEGREES`) au lieu d'une
 * simple barre, et à cette vitesse une case de 15° passe sous l'arc en 75 ms.
 */
const AIM_SWEEP_MS = 1800

/**
 * Facteur appliqué à `AIM_SWEEP_MS` sous mouvement réduit : le garde global
 * `@media (prefers-reduced-motion: reduce)` de `src/index.css` neutralise les
 * animations CSS, mais n'a aucune prise sur la Web Animations API — c'est
 * pourquoi cet arc y passe explicitement, et pourquoi il doit se ralentir
 * lui-même plutôt que de compter sur ce garde. On ralentit le balayage, on ne
 * le supprime pas : sans arc visible il n'y a plus de jeu du tout, et c'est le
 * mode « lancer simple » qui sert de vrai chemin de repli.
 */
const REDUCED_MOTION_SWEEP_FACTOR = 2.5

/** Angle rendu quand l'animation n'a pas pu être mesurée (WAAPI absente, jsdom) : le milieu de la course. */
const FALLBACK_AIM = AIM_SPAN_DEGREES / 2

export interface AimSweep {
  /** L'arc balaie : le bouton de lancer devient le bouton d'arrêt. */
  readonly aiming: boolean
  readonly arcRef: RefObject<HTMLDivElement | null>
  readonly start: () => void
  /** Angle visé en degrés, dans `[0, 360)` ; `null` si l'arc ne balayait pas. */
  readonly fire: () => number | null
  readonly cancel: () => void
}

/**
 * Visée à deux temps : `start()` arme le balayage, `fire()` le lit et
 * l'arrête. L'angle sort dans `[0, 360)`, à passer tel quel à `throwFromAim`.
 * Transposition angulaire de l'ancienne `useForceGauge` (`PowerGauge/`) :
 * même machine à deux temps, mêmes précautions de mouvement réduit.
 */
export function useAimSweep(): AimSweep {
  const [aiming, setAiming] = useState(false)
  const arcRef = useRef<HTMLDivElement | null>(null)
  const animationRef = useRef<Animation | null>(null)
  // Mémorisée pour que `fire()` divise `currentTime` par la même durée que
  // celle réellement utilisée par l'effet (mouvement réduit ou non).
  const sweepMsRef = useRef(AIM_SWEEP_MS)

  // L'animation ne démarre pas dans `start()` : `AimArc` n'est monté que
  // pendant la visée, donc au moment où `start()` s'exécute le nœud n'est pas
  // encore dans le DOM et `arcRef.current` vaut `null`. `start()` se contente
  // donc de faire passer `aiming` à vrai ; c'est cet effet, qui s'exécute
  // après le rendu qui monte `AimArc`, qui trouve le nœud et lance
  // l'animation.
  useEffect(() => {
    if (!aiming) return

    const arc = arcRef.current
    if (arc === null || typeof arc.animate !== 'function') return

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sweepMs = prefersReducedMotion ? AIM_SWEEP_MS * REDUCED_MOTION_SWEEP_FACTOR : AIM_SWEEP_MS
    sweepMsRef.current = sweepMs

    // Rien à mesurer en pixels, contrairement à l'ancienne jauge : une
    // rotation ne dépend d'aucune géométrie de conteneur. C'est ce qui permet
    // à ce hook de fonctionner sous jsdom sans aucune mesure valide.
    const animation = arc.animate(
      [{ transform: 'rotate(0deg)' }, { transform: `rotate(${AIM_SPAN_DEGREES}deg)` }],
      { duration: sweepMs, iterations: Infinity, direction: 'alternate', easing: 'linear' },
    )
    animationRef.current = animation

    return () => {
      animation.cancel()
      animationRef.current = null
    }
  }, [aiming])

  function start(): void {
    setAiming(true)
  }

  function fire(): number | null {
    if (!aiming) return null

    // Lu avant `setAiming(false)` : l'effet de nettoyage annulerait
    // `animationRef.current` en réaction au changement d'état, trop tard pour
    // le lire ici sinon.
    const animation = animationRef.current
    setAiming(false)

    if (animation === null || animation.currentTime === null) return FALLBACK_AIM

    // Lu sur `currentTime`, jamais sur `getComputedTiming().progress` : ce
    // dernier est ambigu vis-à-vis de `direction: 'alternate'` (il ne dit pas
    // de lui-même si l'aller ou le retour est en cours). L'onde triangulaire
    // reconstruit donc la progression réelle : un aller-retour complet dure
    // `2 * sweepMs`, et le second temps se lit à l'envers.
    const t = (Number(animation.currentTime) / sweepMsRef.current) % 2
    const progress = t <= 1 ? t : 2 - t
    // `normalizeDegrees` n'est pas décoratif : à l'instant exact du demi-tour,
    // `progress` vaut 1, et `1 × 360` doit sortir `0`, pas `360` — le contrat
    // annonce `[0, 360)`.
    return normalizeDegrees(progress * AIM_SPAN_DEGREES)
  }

  function cancel(): void {
    setAiming(false)
  }

  return { aiming, arcRef, start, fire, cancel }
}
