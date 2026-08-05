import { useEffect, useRef, useState } from 'react'
import type { Letter } from '../game/types'
import { letterOf } from '../game/puzzle'

/** Durée d'allumage de la lettre sur le clavier virtuel après une frappe physique. */
const PRESSED_DURATION_MS = 200

/**
 * Commandes déclenchées par le clavier physique. Ce sont exactement celles des
 * boutons à l'écran : le hook ne juge aucune légalité, c'est la commande appelée
 * qui refuse.
 */
export interface PhysicalKeyboardActions {
  readonly onLetter: (letter: Letter) => void
  readonly onSpin: () => void
  readonly onResolve: () => void
}

/**
 * Écouteur `keydown` global, posé une seule fois sur `document`. Les actions
 * sont lues par ref au dernier rendu : un `addEventListener` réenregistré à
 * chaque rendu perdrait des frappes pendant la réinscription, et dépendrait
 * d'une égalité de callbacks que l'appelant ne garantit pas.
 *
 * Renvoie la lettre à allumer sur le clavier virtuel, ou `null`.
 */
export function usePhysicalKeyboard(actions: PhysicalKeyboardActions): Letter | null {
  const actionsRef = useRef(actions)
  actionsRef.current = actions

  const [pressed, setPressed] = useState<Letter | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      // Raccourcis système, IME en cours de composition, touche maintenue :
      // aucun de ces cas n'est une frappe de jeu.
      if (event.metaKey || event.ctrlKey || event.altKey || event.isComposing || event.repeat) {
        return
      }

      const target = event.target
      // On écrit dans ce champ, on ne joue pas — même règle pour les lettres,
      // l'espace et l'entrée.
      if (target instanceof Element && target.closest('input, textarea, [contenteditable]')) {
        return
      }
      // La boîte « Résoudre » est prioritaire sur tout raccourci clavier.
      if (document.querySelector('dialog[open]')) return

      // `event.key`, jamais `event.code` : sur AZERTY, `code` donne `KeyQ` pour
      // la touche A. `letterOf` replie déjà les accents.
      const letter = letterOf(event.key)
      if (letter !== null) {
        actionsRef.current.onLetter(letter)

        if (timerRef.current !== null) clearTimeout(timerRef.current)
        setPressed(letter)
        timerRef.current = setTimeout(() => {
          setPressed(null)
          timerRef.current = null
        }, PRESSED_DURATION_MS)
        return
      }

      // Espace et Entrée n'agissent que quand rien n'a le focus : sinon on
      // double-active le bouton qui l'a déjà.
      if (target !== document.body) return

      if (event.key === ' ') {
        event.preventDefault()
        actionsRef.current.onSpin()
      } else if (event.key === 'Enter') {
        actionsRef.current.onResolve()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  return pressed
}
