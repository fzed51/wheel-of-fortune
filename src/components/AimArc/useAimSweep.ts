import { useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { AIM_SPAN_DEGREES, normalizeDegrees } from '../../game/wheel'
import type { AimSpeed } from '../../storage/settings'

/**
 * Durée d'un aller (ou d'un retour) du balayage de l'arc de visée, en
 * millisecondes, par vitesse persistée (`Settings.aimSpeed`). L'ancien réglage
 * unique valait 1800 ms ; il devient `slow`, élargi vers le haut plutôt que
 * repris tel quel, et le défaut (`fast`) tombe à 900 ms : à 1800 ms, une case
 * de 15° passe sous l'arc en 75 ms, ce qui laisse largement le temps de
 * l'anticiper — la trajectoire est si prévisible que figer l'arc sur la case
 * voulue ne demande aucune adresse. À 900 ms, la même case ne passe qu'en
 * 37 ms. `slow` reste destinée à qui ne peut pas suivre un mouvement rapide,
 * et demeure plus lente que l'ancien défaut.
 */
export const AIM_SWEEP_MS: Record<AimSpeed, number> = {
  slow: 2400,
  normal: 1500,
  fast: 900,
  extreme: 550,
}

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
 *
 * `speed` vient du réglage persisté : en pratique il ne change jamais en
 * cours de visée (on ne peut pas être aux Réglages et viser à la fois), mais
 * il entre quand même dans les dépendances de l'effet ci-dessous — un effet
 * qui mentirait sur ses dépendances est un piège pour la suite.
 */
export function useAimSweep(speed: AimSpeed): AimSweep {
  const [aiming, setAiming] = useState(false)
  const arcRef = useRef<HTMLDivElement | null>(null)
  const animationRef = useRef<Animation | null>(null)
  // Mémorisée pour que `fire()` divise `currentTime` par la même durée que
  // celle réellement utilisée par l'effet (mouvement réduit ou non).
  const sweepMsRef = useRef(AIM_SWEEP_MS[speed])

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

    const base = AIM_SWEEP_MS[speed]
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sweepMs = prefersReducedMotion ? base * REDUCED_MOTION_SWEEP_FACTOR : base
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
  }, [aiming, speed])

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
