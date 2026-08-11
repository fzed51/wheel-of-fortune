import type { RefObject } from 'react'

export interface PowerGaugeProps {
  readonly markerRef: RefObject<HTMLDivElement | null>
}

/**
 * Barre de puissance, purement présentationnelle : `useForceGauge` porte
 * toute la logique, ce composant ne fait que la dessiner. `aria-hidden` sur
 * la racine, comme le SVG de la roue (`src/components/Wheel/Wheel.tsx`) :
 * l'information passe par le libellé du bouton (« Lancer » / « Stop ») et par
 * les live regions déjà montées ailleurs, pas par ce dessin. Volontairement
 * aucun rôle `progressbar`, `meter` ni `slider`, et aucun `aria-valuenow` :
 * la valeur change une soixantaine de fois par seconde pendant la charge, et
 * l'exposer noierait un lecteur d'écran sous des annonces inutilisables.
 */
export default function PowerGauge({ markerRef }: PowerGaugeProps) {
  return (
    <div aria-hidden="true" className="flex flex-col gap-1">
      <div className="flex justify-between text-xs text-fg-muted">
        <span>faible</span>
        <span>fort</span>
      </div>
      {/* Conteneur dont `clientWidth` est la largeur utile lue par `useForceGauge`
          pour calculer la course du curseur en pixels. */}
      <div className="relative h-3 overflow-hidden rounded-full border border-border bg-bg-soft">
        <div ref={markerRef} className="absolute top-0 left-0 h-full w-3 rounded-full bg-primary" />
      </div>
    </div>
  )
}
