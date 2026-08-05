import { CONSONANTS, VOWELS, isLetter } from '../../game/puzzle'
import type { keyState } from '../../game/rules'
import type { Letter } from '../../game/types'

/**
 * Dérivé du retour de `keyState` plutôt que redéclaré : `rules.ts` ne nomme pas
 * cette union, seul `ReturnType` en fait une source unique sans dupliquer les
 * trois littéraux ici.
 */
export type KeyState = ReturnType<typeof keyState>

function chunk<T>(items: readonly T[], size: number): readonly (readonly T[])[] {
  const rows: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    rows.push(items.slice(index, index + size))
  }
  return rows
}

/**
 * Une lettre par caractère, validée à la construction : une coquille dans une des
 * chaînes ci-dessous casse au chargement du module plutôt qu'au clic sur une touche.
 */
function row(letters: string): readonly Letter[] {
  return [...letters].map((char) => {
    if (!isLetter(char)) throw new Error(`Lettre invalide dans une disposition de clavier : ${char}`)
    return char
  })
}

/**
 * Grille 6 colonnes pour petit écran : à 360 px, 10 touches sur une rangée
 * donnent ~34 px, sous la cible tactile de 44 px. Consonnes d'abord (4 rangées
 * de 6, la dernière incomplète), puis les 5 voyelles sur leur propre rangée.
 */
export const GROUPED_ROWS: readonly (readonly Letter[])[] = [...chunk(CONSONANTS, 6), VOWELS]

/** Disposition AZERTY mobile, 10 / 9 / 7, pour les écrans larges. */
export const AZERTY_ROWS: readonly (readonly Letter[])[] = [
  row('AZERTYUIOP'),
  row('QSDFGHJKL'),
  row('WXCVBNM'),
]

/**
 * Géométrie du roving tabindex : où va le focus depuis `current` selon `key`.
 * `null` pour toute touche non gérée — le composant n'appelle alors pas
 * `preventDefault`, ce qui laisse par exemple `Tab` sortir du clavier.
 *
 * `ArrowDown`/`ArrowUp` en bord de disposition renvoient `current` (pas `null`) :
 * la touche est gérée — on empêche le défilement de la page — mais le focus ne
 * bouge pas.
 */
export function nextFocus(
  rows: readonly (readonly Letter[])[],
  current: Letter,
  key: string,
): Letter | null {
  const flat = rows.flat()
  const flatIndex = flat.indexOf(current)
  if (flatIndex === -1) return null

  let rowIndex = -1
  let colIndex = -1
  for (let candidate = 0; candidate < rows.length; candidate += 1) {
    const candidateRow = rows[candidate]
    const found = candidateRow?.indexOf(current) ?? -1
    if (found !== -1) {
      rowIndex = candidate
      colIndex = found
      break
    }
  }
  if (rowIndex === -1) return null

  switch (key) {
    case 'ArrowRight':
      return flat[(flatIndex + 1) % flat.length] ?? null
    case 'ArrowLeft':
      return flat[(flatIndex - 1 + flat.length) % flat.length] ?? null
    case 'ArrowDown': {
      if (rowIndex === rows.length - 1) return current
      const nextRow = rows[rowIndex + 1]
      if (nextRow === undefined) return current
      return nextRow[colIndex] ?? nextRow[nextRow.length - 1] ?? current
    }
    case 'ArrowUp': {
      if (rowIndex === 0) return current
      const previousRow = rows[rowIndex - 1]
      if (previousRow === undefined) return current
      return previousRow[colIndex] ?? previousRow[previousRow.length - 1] ?? current
    }
    case 'Home':
      return flat[0] ?? null
    case 'End':
      return flat[flat.length - 1] ?? null
    default:
      return null
  }
}
