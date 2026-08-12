/**
 * Marque de l'en-tête : une roue dessinée **pour la petite taille**, et non le
 * `public/favicon.svg` réduit.
 *
 * Le favicon est une roue de douze secteurs séparés par des filets de 5 unités
 * sur un `viewBox` de 512. Affiché à 32 px, chaque filet tombe sous le tiers de
 * pixel et chaque secteur sous 9 px de large : le dessin s'écrase en un disque
 * pastel indistinct. Cette marque-ci fait le choix inverse — six secteurs, trois
 * couleurs, aucun filet — pour que la silhouette reste lisible à 32 px.
 *
 * L'aiguille en haut n'est pas décorative au sens graphique : sans elle, un
 * disque à six parts se lit « camembert ». C'est elle qui dit « roue de la
 * fortune » d'un coup d'œil.
 *
 * Les couleurs viennent des tokens `wheel-*`, volontairement identiques en thème
 * clair et sombre (voir `src/index.css`) : la roue garde ses couleurs, c'est son
 * identité. Seuls la couronne et le moyeu suivent le thème, par `fg` et `bg`,
 * ce qui garantit le contraste avec le fond dans les deux palettes.
 *
 * `aria-hidden` + `focusable="false"` comme `WheelPointer` : le nom accessible
 * du lien qui la contient est le titre, et lui seul. Sans ces attributs, Chrome
 * exposerait un nœud `image` sans nom et le lien s'appellerait deux fois.
 */
export default function BrandMark({ className = 'size-8' }: { readonly className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false" className={className}>
      {/*
        Six parts de 60°, centre (16, 18), rayon 13. Le centre est descendu de
        deux unités pour laisser l'aiguille tenir dans le carré sans rogner le
        disque. Trois couleurs répétées deux fois : deux voisines ne sont jamais
        identiques, et les opposées le sont — ce qui donne son rythme au moulinet.
      */}
      <path d="M16 18 L16 5 A13 13 0 0 1 27.26 11.5 Z" className="fill-wheel-1" />
      <path d="M16 18 L27.26 11.5 A13 13 0 0 1 27.26 24.5 Z" className="fill-wheel-3" />
      <path d="M16 18 L27.26 24.5 A13 13 0 0 1 16 31 Z" className="fill-wheel-4" />
      <path d="M16 18 L16 31 A13 13 0 0 1 4.74 24.5 Z" className="fill-wheel-1" />
      <path d="M16 18 L4.74 24.5 A13 13 0 0 1 4.74 11.5 Z" className="fill-wheel-3" />
      <path d="M16 18 L4.74 11.5 A13 13 0 0 1 16 5 Z" className="fill-wheel-4" />

      {/* Couronne : c'est elle qui détache le disque du fond, d'où `fg` et non
          `primary` — en thème sombre, `primary` vaut la même valeur que
          `wheel-4` et la couronne disparaîtrait sur deux des six secteurs. */}
      <circle cx={16} cy={18} r={13} fill="none" className="stroke-fg" strokeWidth={1.5} />

      {/* Moyeu : sans lui, les six pointes convergent en un point sale. */}
      <circle cx={16} cy={18} r={3} className="fill-bg stroke-fg" strokeWidth={1.5} />

      {/* Aiguille, à midi, mordant sur le disque pour qu'elle en fasse partie. */}
      <path d="M11.5 1 L20.5 1 L16 9.5 Z" className="fill-accent stroke-bg" strokeWidth={1.5} />
    </svg>
  )
}
