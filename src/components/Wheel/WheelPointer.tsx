/**
 * Aiguille fixe, à midi. Un `<svg>` autonome et non un triangle en bordures CSS :
 * les règles de contraste forcé (`src/index.css`) posent un `fill`/`stroke` sur
 * `.wheel-pointer`, qui ne s'appliquent qu'à une forme SVG.
 *
 * Pas de props : `Wheel.tsx` la positionne en absolu par-dessus le disque.
 *
 * `viewBox` plus haut que large (10 × 15), et non carré : l'aiguille doit
 * traverser la couronne où balaie l'arc de visée pour rejoindre le bord du
 * disque, rentré de `ROTOR_INSET_PERCENT`. Le rapport de ce `viewBox` doit
 * suivre celui de la boîte posée par `Wheel.tsx` (`h-9 w-6`) : avec le
 * `preserveAspectRatio` par défaut, un `viewBox` carré dans une boîte allongée
 * centrerait le triangle sans l'allonger, et l'aiguille resterait courte.
 *
 * `aria-hidden` + `focusable="false"` comme le disque qu'elle surmonte : sans eux,
 * Chrome expose un nœud `image` sans nom dans l'arbre d'accessibilité. La valeur
 * pointée passe par les live regions, jamais par la forme.
 */
export default function WheelPointer() {
  return (
    <svg viewBox="0 0 10 15" aria-hidden="true" focusable="false" className="h-full w-full">
      <path d="M 1 0 L 9 0 L 5 13 Z" className="wheel-pointer fill-wheel-ink stroke-wheel-edge" strokeWidth={0.5} />
    </svg>
  )
}
