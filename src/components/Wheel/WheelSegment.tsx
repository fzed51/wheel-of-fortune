import { arcPath, labelAnchor } from './geometry'
import type { Segment } from '../../game/types'

export interface WheelSegmentProps {
  readonly segment: Segment
  /** Secteur sur lequel la roue vient de s'arrêter. */
  readonly highlighted: boolean
}

// Tailwind lit les classes en texte : un gabarit `fill-wheel-${n}` ne générerait
// rien. La couleur dépend de l'index du segment dans la roue (pas d'un rang parmi
// les seuls montants), ce qui garantit que deux voisins ne se ressemblent jamais.
const CASH_FILLS = ['fill-wheel-1', 'fill-wheel-2', 'fill-wheel-3', 'fill-wheel-4'] as const
const DEFAULT_CASH_FILL = 'fill-wheel-1'

function cashFill(index: number): string {
  // `noUncheckedIndexedAccess` rend l'accès indexé possiblement `undefined` :
  // repli explicite plutôt qu'un `!` qui masquerait un futur bug d'index.
  return CASH_FILLS[index % CASH_FILLS.length] ?? DEFAULT_CASH_FILL
}

function fillFor(segment: Segment): string {
  switch (segment.kind) {
    case 'cash':
      return cashFill(segment.index)
    case 'bankrupt':
      return 'fill-wheel-bankrupt'
    case 'pass':
      return 'fill-wheel-pass'
  }
}

function labelFor(segment: Segment): string {
  switch (segment.kind) {
    case 'cash':
      return String(segment.value)
    case 'bankrupt':
      return 'BANQ.'
    case 'pass':
      return 'PASSE'
  }
}

export default function WheelSegment({ segment, highlighted }: WheelSegmentProps) {
  const { x, y, angle } = labelAnchor(segment.index)
  return (
    <g>
      {/* La mise en évidence est entièrement portée par le CSS, sur
          `[data-highlighted='true']` : c'est le sélecteur que le bloc
          `forced-colors` de `src/index.css` cible déjà, et une classe
          utilitaire en plus aurait donné deux endroits à tenir d'accord. */}
      <path
        d={arcPath(segment.index)}
        className={`wheel-arc ${fillFor(segment)}`}
        data-highlighted={highlighted ? 'true' : 'false'}
      />
      <text
        x={x}
        y={y}
        fontSize={5}
        transform={`rotate(${angle} ${x} ${y})`}
        className="wheel-label fill-wheel-ink"
      >
        {labelFor(segment)}
      </text>
    </g>
  )
}
