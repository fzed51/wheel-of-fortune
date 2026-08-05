import { createContext, useContext } from 'react'

/**
 * Messages destinés aux lecteurs d'écran.
 *
 * `id` est indispensable : une live region ne rediffuse **pas** un texte identique
 * au précédent. « K : absent. Au tour de Bot 1. » deux fois de suite ne serait
 * annoncé qu'une fois, et le joueur aveugle croirait sa touche ignorée. Les
 * composants de live region se remontent sur l'`id`.
 */
export interface Message {
  readonly text: string
  readonly id: number
}

export interface Announcements {
  /** `aria-live="polite"` : déroulement du jeu. */
  readonly status: Message
  /** `role="alert"` : uniquement les échecs techniques. */
  readonly alert: Message
}

/** Commandes stables à vie : séparées de l'état pour ne pas rerendre leurs appelants. */
export interface Announcer {
  readonly say: (text: string) => void
  readonly warn: (text: string) => void
  readonly clearAlert: () => void
}

export const AnnouncementsContext = createContext<Announcements | null>(null)
export const AnnouncerContext = createContext<Announcer | null>(null)

/** Commandes d'annonce. Stables : les prendre ne rerend jamais l'appelant. */
export function useAnnouncer(): Announcer {
  const announcer = useContext(AnnouncerContext)
  if (announcer === null) throw new Error('useAnnouncer hors de AnnouncerProvider')
  return announcer
}

/** Réservé aux live regions : ce hook rerend à chaque annonce. */
export function useAnnouncements(): Announcements {
  const announcements = useContext(AnnouncementsContext)
  if (announcements === null) throw new Error('useAnnouncements hors de AnnouncerProvider')
  return announcements
}
