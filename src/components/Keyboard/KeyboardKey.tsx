import type { KeyboardEvent, Ref } from 'react'
import type { Letter } from '../../game/types'
import type { KeyState } from './layout'

interface KeyboardKeyProps {
  readonly letter: Letter
  readonly state: KeyState
  /** Allumée par la frappe au clavier physique : retour visuel, pas une bascule. */
  readonly pressed: boolean
  /** Seule touche du groupe à porter `tabIndex={0}` (roving tabindex). */
  readonly roving: boolean
  readonly onSelect: () => void
  readonly onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  readonly buttonRef: Ref<HTMLButtonElement>
}

const BASE_CLASSES =
  'flex min-h-11 min-w-11 items-center justify-center rounded-md border text-base font-semibold uppercase'

/**
 * `aria-label` porte l'état : un lecteur d'écran n'a pas d'autre moyen de savoir
 * qu'une lettre a déjà été proposée ou reste indisponible, la case grise seule
 * ne parle qu'aux yeux.
 */
function labelFor(letter: Letter, state: KeyState): string {
  if (state === 'used') return `Lettre ${letter}, déjà proposée`
  if (state === 'locked') return `Lettre ${letter}, indisponible`
  return `Lettre ${letter}`
}

function classesFor(state: KeyState, pressed: boolean): string {
  if (pressed) return `${BASE_CLASSES} border-primary bg-primary text-on-primary`
  if (state === 'available') return `${BASE_CLASSES} border-border bg-surface text-fg`
  // `used` et `locked` partagent l'apparence estompée : la nuance vit dans le
  // libellé accessible, pas dans une troisième teinte à retenir visuellement.
  return `${BASE_CLASSES} border-border bg-bg-soft text-fg-muted`
}

/**
 * Une touche, une responsabilité : rendu et libellé accessible. `aria-disabled`
 * et jamais `disabled`, sinon la touche du roving tabindex perdrait le focus au
 * profit de `<body>` dès qu'elle devient indisponible — et le lecteur d'écran se
 * tait au lieu d'annoncer la case suivante.
 */
export default function KeyboardKey({
  letter,
  state,
  pressed,
  roving,
  onSelect,
  onKeyDown,
  buttonRef,
}: KeyboardKeyProps) {
  const disponible = state === 'available'

  return (
    <button
      ref={buttonRef}
      type="button"
      tabIndex={roving ? 0 : -1}
      aria-disabled={!disponible}
      aria-label={labelFor(letter, state)}
      className={classesFor(state, pressed)}
      onClick={() => {
        if (disponible) onSelect()
      }}
      onKeyDown={onKeyDown}
    >
      {letter}
    </button>
  )
}
