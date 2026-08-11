import type { Segment, SpinLanding, WheelThrow } from './types'

/**
 * Disposition de la roue, du haut dans le sens horaire.
 * `'B'` = banqueroute, `'P'` = passe, un nombre = un montant.
 *
 * Plusieurs montants reviennent (50, 100, 150, 200 et 250 apparaissent chacun
 * plusieurs fois) : c'est ce qui rend l'`index` du segment indispensable, sans lui
 * l'animation ne saurait pas quel arc viser.
 */
const LAYOUT = [
  100, 250, 50, 500, 'B', 150, 400, 200, 'P', 250, 100, 600,
   50, 350,  0, 200, 450, 150, 'B', 300, 100, 800, 'P', 250,
] as const

export const SEGMENT_COUNT = LAYOUT.length
export const SEGMENT_ANGLE = 360 / SEGMENT_COUNT

/** L'index de chaque segment est dérivé de sa position : il ne peut pas se désynchroniser. */
export const WHEEL: readonly Segment[] = LAYOUT.map((slot, index) => {
  if (slot === 'B') return { kind: 'bankrupt', index }
  if (slot === 'P') return { kind: 'pass', index }
  return { kind: 'cash', index, value: slot }
})

/**
 * Compteurs dérivés de `WHEEL`, jamais écrits en dur : l'écran de règles
 * (`src/routes/HowToPlayRoute.tsx`) les lit pour annoncer « dont deux Banqueroute
 * et deux Passe » sans figer ces nombres dans sa propre prose, qui mentirait au
 * prochain rééquilibrage du barème.
 */
export const BANKRUPT_COUNT = WHEEL.filter((segment) => segment.kind === 'bankrupt').length
export const PASS_COUNT = WHEEL.filter((segment) => segment.kind === 'pass').length
export const ZERO_COUNT = WHEEL.filter((segment) => segment.kind === 'cash' && segment.value === 0).length

/** Marge laissée aux bords du segment pour que l'aiguille reste sans ambiguïté. */
const OFFSET_BOUND = SEGMENT_ANGLE / 2 - 2

export function segmentAt(index: number): Segment {
  const segment = WHEEL[index]
  if (segment === undefined) {
    throw new Error(`Index de segment hors bornes : ${index}`)
  }
  return segment
}

/** En dessous, un lancer serait trop mou pour paraître réel : deux tours pleins sont le plancher. */
export const MIN_TRAVEL_DEGREES = 720

/** Imprécision humaine du lancer : au plus une case en trop ou en moins autour de la cible. */
export const JITTER_DEGREES = SEGMENT_ANGLE

/**
 * Course balayée par l'arc de visée, un tour complet : ça rend les 24 cases
 * atteignables depuis n'importe quel angle de repos. L'interface la lit
 * plutôt que d'écrire 360 en dur, pour que l'animation de l'arc et le calcul
 * de l'angle visé restent d'accord sur la même amplitude.
 */
export const AIM_SPAN_DEGREES = 360

/**
 * Largeur angulaire de l'arc dessiné autour de la roue, soit deux cases :
 * l'erreur du lancer vaut au plus `JITTER_DEGREES` de part et d'autre de la
 * visée (voir `throwFromAim`), donc `2 * JITTER_DEGREES` couvre exactement
 * l'ensemble des atterrissages possibles. Dérivée plutôt qu'écrite en dur :
 * l'arc doit dire la vérité sur ce que le joueur peut espérer, et deux copies
 * dériveraient au prochain réglage de `JITTER_DEGREES` — l'arc mentirait
 * alors au joueur sans qu'aucun test ne rougisse. Lue par `src/components/`.
 */
export const AIM_ARC_DEGREES = 2 * JITTER_DEGREES

/**
 * Bornes de durée de l'animation de rotation, lues à deux endroits qui ne se
 * connaissent pas : l'animation WAAPI de `components/Wheel/useWheelSpin.ts` et
 * le chien de garde de `hooks/useGameEffects.ts`, qui dispatche `wheel/settled`
 * si l'animation ne se termine jamais (onglet en arrière-plan, composant
 * démonté). Deux copies dériveraient, et un chien de garde plus court que
 * l'animation la plus longue couperait une rotation avant la fin. `game/wheel.ts`
 * est le seul module que les deux peuvent importer sans qu'un `hooks/` dépende
 * d'un `components/`.
 */

/** Durée minimale de l'animation, pour un lancer au ralenti. */
export const SPIN_MIN_MS = 2600

/** Durée maximale de l'animation, pour un lancer à pleine puissance. */
export const SPIN_MAX_MS = 4200

export function normalizeDegrees(degrees: number): number {
  return ((degrees % 360) + 360) % 360
}

/** Angle de rotation qui amène (index, offset) sous l'aiguille. Inverse de la dérivation d'index. */
export function angleForLanding(index: number, offset: number): number {
  return normalizeDegrees(-(index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2 + offset))
}

/** Angle visé quand personne ne vise : un bot, ou le mode « lancer simple ». */
export function randomAim(rng: () => number): number {
  return rng() * AIM_SPAN_DEGREES
}

/**
 * Distance à parcourir pour amener le point visé (dans le repère de l'écran,
 * voir le docblock de `AIM_ARC_DEGREES`) sous l'aiguille, à l'imprécision
 * humaine près.
 *
 * Démonstration reprise du calcul de `resolveThrow`
 * (`under = normalizeDegrees(-normalizeDegrees(fromAngle + travel))`) :
 * pour que le point de coordonnée roue `w = normalizeDegrees(aim - fromAngle)`
 * arrive sous l'aiguille, il faut `-(fromAngle + travel) ≡ aim - fromAngle`
 * (mod 360), donc `travel ≡ -aim` (mod 360). L'angle de repos s'annule des
 * deux côtés : c'est ce qui permet à cette fonction de ne prendre que l'angle
 * visé, sans jamais recevoir `fromAngle`.
 */
export function throwFromAim(aim: number, rng: () => number, spinId: number): WheelThrow {
  const target = normalizeDegrees(aim)
  // Un seul tirage, au même moment qu'avant le lancer à la force : décaler ce
  // point décalerait toutes les suites à graine fixée du dépôt.
  const jitter = (rng() * 2 - 1) * JITTER_DEGREES
  const reach = normalizeDegrees(-target)
  const travel = MIN_TRAVEL_DEGREES + reach + jitter

  const span = AIM_SPAN_DEGREES + 2 * JITTER_DEGREES
  const beyond = travel - (MIN_TRAVEL_DEGREES - JITTER_DEGREES) // ∈ [0, span]
  // Le clamp n'est pas décoratif : il protège le contrat de durée
  // (`SPIN_MIN_MS`–`SPIN_MAX_MS`, lu par le chien de garde de
  // `hooks/useGameEffects.ts`) si `JITTER_DEGREES` était un jour relevé
  // au-delà d'une demi-case.
  const durationMs = Math.round(
    SPIN_MIN_MS + Math.min(1, Math.max(0, beyond / span)) * (SPIN_MAX_MS - SPIN_MIN_MS),
  )

  return { spinId, travel, durationMs }
}

/**
 * Déduit l'atterrissage à partir de l'angle de repos précédent et d'un lancer.
 * Une roue arrêtée pile sur une séparation entre deux segments ne peut pas être
 * tranchée à l'œil : `offset` est rabattu dans `[-OFFSET_BOUND, OFFSET_BOUND]`, et
 * `travel` est corrigé du même montant que `offset` pour que l'image animée et le
 * modèle disent la même chose. La correction vaut au plus 2°, la marge laissée par
 * `OFFSET_BOUND` aux bords du segment.
 */
export function resolveThrow(fromAngle: number, thrown: WheelThrow): SpinLanding {
  const under = normalizeDegrees(-normalizeDegrees(fromAngle + thrown.travel))
  const index = Math.min(SEGMENT_COUNT - 1, Math.floor(under / SEGMENT_ANGLE))
  const raw = under - (index * SEGMENT_ANGLE + SEGMENT_ANGLE / 2)
  const offset = Math.max(-OFFSET_BOUND, Math.min(OFFSET_BOUND, raw))
  const travel = thrown.travel + (raw - offset)
  return {
    spinId: thrown.spinId,
    durationMs: thrown.durationMs,
    travel,
    index,
    offset,
    angle: normalizeDegrees(fromAngle + travel),
  }
}
