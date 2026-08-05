import type { Consonant, Letter, RoundState, Vowel } from './types'

export const VOWELS: readonly Vowel[] = ['A', 'E', 'I', 'O', 'U']

/** Le Y est une consonne : version française du jeu. */
export const CONSONANTS: readonly Consonant[] = [
  'B', 'C', 'D', 'F', 'G', 'H', 'J', 'K', 'L', 'M',
  'N', 'P', 'Q', 'R', 'S', 'T', 'V', 'W', 'X', 'Y', 'Z',
]

const VOWEL_SET: ReadonlySet<string> = new Set(VOWELS)
const CONSONANT_SET: ReadonlySet<string> = new Set(CONSONANTS)

/**
 * Développements appliqués avant toute autre chose.
 *
 * `normalize('NFD')` décompose les caractères précomposés (`É` → `E` + accent)
 * mais **pas les ligatures** : sans cette table, `CŒUR` ne serait révélé ni par
 * `E` ni par `O`. Les développer ici, dans le texte d'affichage, garde le
 * nombre de cases de la grille aligné sur le nombre de lettres à trouver.
 *
 * Les caractères invisibles sont écrits en échappements pour rester relisibles.
 */
const EXPANSIONS: readonly (readonly [RegExp, string])[] = [
  [/[’‘ʼ]/g, "'"],           // apostrophes typographiques
  [/[    ]/g, ' '],     // espaces insécables et fines
  [/[‐-―−]/g, '-'],          // tirets typographiques et signe moins
  [/Œ/g, 'OE'],                        // Œ
  [/Æ/g, 'AE'],                        // Æ
  [/ß/g, 'SS'],                        // ß
]

/**
 * Forme canonique du texte d'une énigme, telle qu'elle est stockée et affichée :
 * majuscules, ligatures développées, apostrophes et espaces uniformisés.
 * **Les accents sont conservés** — c'est le texte que voit le joueur.
 */
export function normalizeAnswer(text: string): string {
  let out = text.toUpperCase()
  for (const [pattern, replacement] of EXPANSIONS) {
    out = out.replace(pattern, replacement)
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * Lettre de jeu correspondant à un caractère affiché : `É` se devine avec `E`,
 * `Ç` avec `C`. Renvoie `null` pour les espaces, apostrophes et ponctuations,
 * qui sont affichés d'emblée et ne se devinent jamais.
 */
export function letterOf(char: string): Letter | null {
  const folded = char.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase()
  return isLetter(folded) ? folded : null
}

export function isLetter(value: string): value is Letter {
  return VOWEL_SET.has(value) || CONSONANT_SET.has(value)
}

export function isVowel(value: string): value is Vowel {
  return VOWEL_SET.has(value)
}

export function isConsonant(value: string): value is Consonant {
  return CONSONANT_SET.has(value)
}

/** Une case de la grille. `letter === null` pour ce qui est affiché d'emblée. */
export interface Cell {
  readonly char: string
  readonly letter: Letter | null
}

export function cellsOf(answer: string): readonly Cell[] {
  return [...answer].map((char) => ({ char, letter: letterOf(char) }))
}

export function lettersOf(answer: string): ReadonlySet<Letter> {
  const letters = new Set<Letter>()
  for (const char of answer) {
    const letter = letterOf(char)
    if (letter !== null) letters.add(letter)
  }
  return letters
}

/** Nombre d'occurrences d'une lettre : c'est ce qui multiplie le montant du segment. */
export function countOccurrences(answer: string, letter: Letter): number {
  let count = 0
  for (const char of answer) {
    if (letterOf(char) === letter) count += 1
  }
  return count
}

/** Lettres proposées qui figurent effectivement dans l'énigme. */
export function revealedLetters(round: RoundState): ReadonlySet<Letter> {
  const present = lettersOf(round.puzzle.answer)
  return new Set(round.guessed.filter((letter) => present.has(letter)))
}

export function isSolved(round: RoundState): boolean {
  const guessed = new Set(round.guessed)
  for (const letter of lettersOf(round.puzzle.answer)) {
    if (!guessed.has(letter)) return false
  }
  return true
}
