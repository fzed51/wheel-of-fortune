import { describe, expect, it } from 'vitest'
import { AZERTY_ROWS, GROUPED_ROWS, nextFocus } from './layout'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function ensembleDe(rows: readonly (readonly string[])[]): string[] {
  return [...rows.flat()].toSorted()
}

describe('GROUPED_ROWS', () => {
  it('regroupe 21 consonnes en rangées de 6, puis les 5 voyelles sur leur propre rangée', () => {
    const [c1, c2, c3, c4, voyelles] = GROUPED_ROWS
    expect([c1?.length, c2?.length, c3?.length, c4?.length]).toEqual([6, 6, 6, 3])
    expect(voyelles).toEqual(['A', 'E', 'I', 'O', 'U'])
  })

  it("couvre l'alphabet exact, sans doublon", () => {
    expect(ensembleDe(GROUPED_ROWS)).toEqual(ALPHABET)
  })
})

describe('AZERTY_ROWS', () => {
  it('reprend la disposition 10 / 9 / 7 des claviers AZERTY mobiles', () => {
    expect(GROUPED_ROWS.length).not.toBe(0) // garde-fou, la vraie assertion suit
    expect(AZERTY_ROWS.map((row) => row.length)).toEqual([10, 9, 7])
  })

  it("couvre l'alphabet exact, sans doublon", () => {
    expect(ensembleDe(AZERTY_ROWS)).toEqual(ALPHABET)
  })
})

it('les deux dispositions portent le même ensemble de lettres', () => {
  expect(ensembleDe(AZERTY_ROWS)).toEqual(ensembleDe(GROUPED_ROWS))
})

describe('nextFocus', () => {
  it('ArrowRight avance dans l’ordre aplati et boucle après la dernière touche', () => {
    expect(nextFocus(GROUPED_ROWS, 'B', 'ArrowRight')).toBe('C')
    expect(nextFocus(GROUPED_ROWS, 'U', 'ArrowRight')).toBe('B') // dernière touche -> retour au début
  })

  it('ArrowLeft recule et boucle avant la première touche', () => {
    expect(nextFocus(GROUPED_ROWS, 'C', 'ArrowLeft')).toBe('B')
    expect(nextFocus(GROUPED_ROWS, 'B', 'ArrowLeft')).toBe('U') // première touche -> retour à la fin
  })

  it('ArrowDown vise la même colonne sur la rangée suivante', () => {
    // Rangée « QRSTVW » (index 2), colonne 0 -> rangée « XYZ » (index 3), colonne 0.
    expect(nextFocus(GROUPED_ROWS, 'Q', 'ArrowDown')).toBe('X')
  })

  it('ArrowDown vise la dernière touche quand la rangée suivante est plus courte', () => {
    // « W » est en colonne 5 de sa rangée ; « XYZ » n’a que 3 colonnes.
    expect(nextFocus(GROUPED_ROWS, 'W', 'ArrowDown')).toBe('Z')
  })

  it('ArrowDown ne bouge pas depuis la dernière rangée', () => {
    expect(nextFocus(GROUPED_ROWS, 'O', 'ArrowDown')).toBe('O')
    expect(nextFocus(AZERTY_ROWS, 'X', 'ArrowDown')).toBe('X')
  })

  it('ArrowUp vise la même colonne sur la rangée précédente', () => {
    expect(nextFocus(GROUPED_ROWS, 'X', 'ArrowUp')).toBe('Q')
  })

  it('ArrowUp vise la dernière touche quand la rangée précédente est plus courte', () => {
    // « U » est en colonne 4 des voyelles ; « XYZ » n’a que 3 colonnes.
    expect(nextFocus(GROUPED_ROWS, 'U', 'ArrowUp')).toBe('Z')
  })

  it('ArrowUp ne bouge pas depuis la première rangée', () => {
    expect(nextFocus(GROUPED_ROWS, 'D', 'ArrowUp')).toBe('D')
  })

  it('Home vise la première touche, End la dernière', () => {
    expect(nextFocus(GROUPED_ROWS, 'Q', 'Home')).toBe('B')
    expect(nextFocus(GROUPED_ROWS, 'Q', 'End')).toBe('U')
  })

  it('renvoie null pour une touche non gérée', () => {
    expect(nextFocus(GROUPED_ROWS, 'Q', 'Escape')).toBeNull()
  })
})
