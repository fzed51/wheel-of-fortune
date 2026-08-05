import { BUTTON_GHOST, BUTTON_PRIMARY, CARD } from '../classes'

/**
 * Phrase unique de l'évènement : affichée ici, et annoncée par `UpdatePrompt`
 * dans la live region du layout. Deux formulations pour la même mise à jour
 * finiraient par se contredire, l'une promettant la partie conservée et l'autre
 * non.
 */
export const UPDATE_MESSAGE =
  'Une nouvelle version est disponible. La partie en cours est conservée.'

interface UpdateBannerProps {
  readonly needRefresh: boolean
  readonly onUpdate: () => void
  readonly onDismiss: () => void
}

/**
 * Composant d'affichage pur : props uniquement, aucun hook d'infrastructure.
 *
 * Ce n'est **pas** une live region, contrairement au réflexe qu'inspire un
 * message qui apparaît tout seul. L'application n'en possède que deux, montées
 * une fois pour toutes par `LiveRegions` ; une troisième dans le layout
 * dédoublerait le mécanisme d'annonce et rendrait `role="status"` ambigu, alors
 * que trois fichiers de tests s'en servent pour désigner « la » région de
 * statut. L'annonce passe donc par `useAnnouncer`, côté `UpdatePrompt` : cette
 * région-là existe depuis le premier rendu, donc elle est déjà observée quand le
 * message y arrive.
 *
 * Un `<section>` nommé reste utile : la bannière devient un repère que la
 * navigation par régions atteint directement.
 */
export default function UpdateBanner({ needRefresh, onUpdate, onDismiss }: UpdateBannerProps) {
  if (!needRefresh) return null

  return (
    <section
      aria-label="Mise à jour disponible"
      className={`${CARD} mx-auto my-4 flex max-w-3xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}
    >
      <p className="text-fg">{UPDATE_MESSAGE}</p>
      <div className="flex shrink-0 gap-2">
        <button type="button" onClick={onUpdate} className={`${BUTTON_PRIMARY} min-h-11`}>
          Mettre à jour
        </button>
        <button type="button" onClick={onDismiss} className={`${BUTTON_GHOST} min-h-11`}>
          Plus tard
        </button>
      </div>
    </section>
  )
}
