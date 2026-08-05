import { useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import type { Letter } from '../../game/types'
import KeyboardKey from './KeyboardKey'
import { AZERTY_ROWS, GROUPED_ROWS, nextFocus } from './layout'
import type { KeyState } from './layout'
import { useWideLayout } from './useWideLayout'

export interface KeyboardProps {
  readonly stateOf: (letter: Letter) => KeyState
  readonly onLetter: (letter: Letter) => void
  /** Lettre allumée par la frappe au clavier physique, ou `null`. */
  readonly pressed?: Letter | null
}

/**
 * Clavier virtuel des 26 lettres. Purement présentationnel : aucune règle de jeu,
 * tout arrive par props — c'est `GameRoute` qui le câble au moteur.
 *
 * Roving tabindex : une seule touche à `tabIndex={0}` à la fois. 26 arrêts de
 * tabulation entre le plateau et les contrôles seraient inacceptables au clavier.
 */
export default function Keyboard({ stateOf, onLetter, pressed = null }: KeyboardProps) {
  const rows = useWideLayout() ? AZERTY_ROWS : GROUPED_ROWS
  const firstRow = rows[0]
  const defaultRoving: Letter = firstRow?.[0] ?? 'A'

  // `null` tant que l'utilisateur n'a pas navigué au clavier : la touche par
  // défaut suit alors la disposition active plutôt que de figer un choix fait
  // avant que la largeur d'écran ne soit connue.
  const [rovingLetter, setRovingLetter] = useState<Letter | null>(null)
  const roving = rovingLetter ?? defaultRoving

  // Ne sert qu'à déplacer le focus impérativement depuis un gestionnaire de
  // touche : jamais lu pendant le rendu, jamais visé par un effet.
  const buttons = useRef(new Map<Letter, HTMLButtonElement>())

  function registerButton(letter: Letter) {
    return (element: HTMLButtonElement | null) => {
      if (element === null) buttons.current.delete(letter)
      else buttons.current.set(letter, element)
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, letter: Letter) {
    const target = nextFocus(rows, letter, event.key)
    if (target === null) return
    // Touche gérée : empêche par exemple les flèches de faire défiler la page.
    event.preventDefault()
    setRovingLetter(target)
    buttons.current.get(target)?.focus()
  }

  return (
    <div role="group" aria-label="Clavier des lettres" className="flex flex-col items-center gap-1">
      {rows.map((letters, rowIndex) => (
        <div key={rowIndex} className="flex gap-1">
          {letters.map((letter) => (
            <KeyboardKey
              key={letter}
              letter={letter}
              state={stateOf(letter)}
              pressed={pressed === letter}
              roving={letter === roving}
              buttonRef={registerButton(letter)}
              onSelect={() => {
                onLetter(letter)
              }}
              onKeyDown={(event) => {
                handleKeyDown(event, letter)
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
