/**
 * Aiguille fixe, à midi. Un `<svg>` autonome et non un triangle en bordures CSS :
 * les règles de contraste forcé (`src/index.css`) posent un `fill`/`stroke` sur
 * `.wheel-pointer`, qui ne s'appliquent qu'à une forme SVG.
 *
 * Pas de props : `Wheel.tsx` la positionne en absolu par-dessus le disque.
 */
export default function WheelPointer() {
  return (
    <svg viewBox="0 0 10 10" className="h-full w-full">
      <path d="M 1 0 L 9 0 L 5 8 Z" className="wheel-pointer fill-wheel-ink stroke-wheel-edge" strokeWidth={0.5} />
    </svg>
  )
}
