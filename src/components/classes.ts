/**
 * Classes partagées par les écrans, le temps que les vrais composants arrivent.
 * Les regrouper ici évite six variantes de bouton légèrement différentes ; aucune
 * couleur n'est écrite en dur, tout passe par les tokens de thème.
 */
export const BUTTON_PRIMARY =
  'rounded-lg bg-primary px-4 py-2 font-medium text-on-primary disabled:opacity-50'

export const BUTTON_GHOST =
  'rounded-lg border border-border px-4 py-2 font-medium text-fg hover:bg-bg-soft'

export const CARD = 'rounded-xl border border-border bg-surface p-4'

export const FIELD = 'flex items-center justify-between gap-4 py-2'

export const INPUT = 'rounded-md border border-border bg-bg px-2 py-1 text-fg'
