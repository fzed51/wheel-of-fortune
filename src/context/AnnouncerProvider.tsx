import { useCallback, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AnnouncementsContext, AnnouncerContext } from '../hooks/useAnnouncer'
import type { Announcements, Announcer, Message } from '../hooks/useAnnouncer'

const EMPTY: Message = { text: '', id: 0 }

export function AnnouncerProvider({ children }: { readonly children: ReactNode }) {
  const [status, setStatus] = useState<Message>(EMPTY)
  const [alert, setAlert] = useState<Message>(EMPTY)

  const say = useCallback((text: string) => {
    setStatus((current) => ({ text, id: current.id + 1 }))
  }, [])

  const warn = useCallback((text: string) => {
    setAlert((current) => ({ text, id: current.id + 1 }))
  }, [])

  const clearAlert = useCallback(() => {
    setAlert((current) => ({ text: '', id: current.id + 1 }))
  }, [])

  const announcements = useMemo<Announcements>(() => ({ status, alert }), [status, alert])
  const announcer = useMemo<Announcer>(() => ({ say, warn, clearAlert }), [say, warn, clearAlert])

  // L'état est **imbriqué dans** les commandes : les consommateurs de commandes ne
  // sont pas rerendus quand un message change.
  return (
    <AnnouncerContext value={announcer}>
      <AnnouncementsContext value={announcements}>{children}</AnnouncementsContext>
    </AnnouncerContext>
  )
}
