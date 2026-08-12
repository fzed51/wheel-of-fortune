// @vitest-environment jsdom
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import AimArc from './AimArc'
import { AIM_ARC_DEGREES } from '../../game/wheel'
import { DISC_RADIUS_ON_BOARD } from '../Wheel/geometry'

/** Reproduit la conversion polaire de `AimArc.tsx`, indépendamment de son import. */
function point(angleDeg: number, radius: number): { readonly x: number; readonly y: number } {
  const rad = (angleDeg * Math.PI) / 180
  const round3 = (value: number) => Math.round(value * 1000) / 1000
  return { x: round3(50 + radius * Math.sin(rad)), y: round3(50 - radius * Math.cos(rad)) }
}

describe('AimArc', () => {
  it('masque l’arc au lecteur d’écran', () => {
    const { container } = render(<AimArc arcRef={createRef<HTMLDivElement | null>()} />)

    // `aria-hidden` sur la racine : le joueur reste dans le doute jusqu'à
    // l'arrêt de la roue, aucune information ne doit fuiter par ce dessin.
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('n’expose aucun rôle de valeur', () => {
    render(<AimArc arcRef={createRef<HTMLDivElement | null>()} />)

    // L'angle change une soixantaine de fois par seconde pendant la visée :
    // un rôle `progressbar`, `meter` ou `slider` noierait un lecteur d'écran
    // sous des annonces inutilisables.
    expect(document.querySelector('[role="progressbar"]')).toBeNull()
    expect(document.querySelector('[role="meter"]')).toBeNull()
    expect(document.querySelector('[role="slider"]')).toBeNull()
  })

  it('dessine un arc dont la largeur vaut exactement AIM_ARC_DEGREES', () => {
    const { container } = render(<AimArc arcRef={createRef<HTMLDivElement | null>()} />)

    const path = container.querySelector('path')
    expect(path).not.toBeNull()
    const d = path?.getAttribute('d') ?? ''

    // Le rayon n'est pas exporté par le composant : on l'extrait du `d` rendu
    // (`M x0 y0 A r r …`) pour ne dépendre que de la formule, pas d'une valeur
    // recopiée à la main qui pourrait diverger sans faire rougir ce test.
    const radiusMatch = /A ([\d.]+) [\d.]+/.exec(d)
    expect(radiusMatch).not.toBeNull()
    const radius = Number(radiusMatch?.[1])

    const start = point(-AIM_ARC_DEGREES / 2, radius)
    const end = point(AIM_ARC_DEGREES / 2, radius)
    const expected = `M ${start.x} ${start.y} A ${radius} ${radius} 0 0 1 ${end.x} ${end.y}`

    expect(d).toBe(expected)
  })

  it('reste entièrement dans la couronne libre autour du disque, sans être rogné par le bord du carré', () => {
    const { container } = render(<AimArc arcRef={createRef<HTMLDivElement | null>()} />)

    const path = container.querySelector('path')
    expect(path).not.toBeNull()
    const d = path?.getAttribute('d') ?? ''

    const radiusMatch = /A ([\d.]+) [\d.]+/.exec(d)
    expect(radiusMatch).not.toBeNull()
    const radius = Number(radiusMatch?.[1])

    // Épaisseur lue sur l'attribut du même `<path>`, pas recopiée à la main :
    // une constante qui dérive de `STROKE_WIDTH` dans `AimArc.tsx` doit faire
    // rougir ce test, pas seulement le premier.
    const strokeWidth = Number(path?.getAttribute('stroke-width'))

    // Borne « dehors » : le bord intérieur de l'arc ne doit plus toucher le
    // disque rendu (`DISC_RADIUS_ON_BOARD`).
    expect(radius - strokeWidth / 2).toBeGreaterThan(DISC_RADIUS_ON_BOARD)
    // Borne « pas rogné » : le bord extérieur de l'arc ne doit pas dépasser
    // le carré de la roue (50 dans le repère `viewBox="0 0 100 100"`).
    expect(radius + strokeWidth / 2).toBeLessThanOrEqual(50)
  })
})
