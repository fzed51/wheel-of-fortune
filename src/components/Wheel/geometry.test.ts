import { describe, expect, it } from 'vitest'
import { SEGMENT_COUNT } from '../../game/wheel'
import { arcPath, labelAnchor } from './geometry'

describe('arcPath', () => {
  it('fait démarrer le segment 0 exactement à (50, 2)', () => {
    expect(arcPath(0)).toContain('M 50 50 L 50 2 ')
  })

  it('produit 24 chemins deux à deux distincts', () => {
    const paths = Array.from({ length: SEGMENT_COUNT }, (_, index) => arcPath(index))
    expect(new Set(paths).size).toBe(SEGMENT_COUNT)
  })
})

describe('labelAnchor', () => {
  it('place les 24 libellés à des points deux à deux distincts', () => {
    const points = Array.from({ length: SEGMENT_COUNT }, (_, index) => labelAnchor(index))
    const keys = new Set(points.map((point) => `${point.x}:${point.y}`))
    expect(keys.size).toBe(SEGMENT_COUNT)
  })

  it('place chaque libellé à une distance de 36 du centre', () => {
    for (let index = 0; index < SEGMENT_COUNT; index += 1) {
      const { x, y } = labelAnchor(index)
      const distance = Math.hypot(x - 50, y - 50)
      expect(distance).toBeCloseTo(36, 1)
    }
  })

  it('oriente chaque libellé le long du rayon, du bord vers le centre', () => {
    // `rotate(angle)` en SVG fait tourner le vecteur d'écriture (1, 0) dans le
    // sens horaire, ce qui donne la direction (cos angle, sin angle). Elle doit
    // coïncider avec le rayon rentrant : sans le quart de tour de `labelAnchor`,
    // le texte serait tangentiel et « 1000 » ne tiendrait pas dans un secteur.
    for (let index = 0; index < SEGMENT_COUNT; index += 1) {
      const { x, y, angle } = labelAnchor(index)
      const rad = (angle * Math.PI) / 180
      const inward = Math.hypot(50 - x, 50 - y)
      expect(Math.cos(rad)).toBeCloseTo((50 - x) / inward, 3)
      expect(Math.sin(rad)).toBeCloseTo((50 - y) / inward, 3)
    }
  })
})
