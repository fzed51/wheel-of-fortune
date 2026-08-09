import { describe, expect, it } from 'vitest'
import { foldForCompare, matchesAnswer } from './compare'

describe('foldForCompare', () => {
  it('ignore les accents et la ponctuation', () => {
    expect(foldForCompare("l'été, à Nîmes")).toBe(foldForCompare('LETE A NIMES'))
  })

  it('développe la ligature Œ comme le fait la grille de jeu', () => {
    // `normalize('NFD')` seul ne décompose pas Œ : sans le remplacement
    // explicite, CŒUR et COEUR seraient jugés différents.
    expect(foldForCompare('CŒUR')).toBe(foldForCompare('COEUR'))
  })

  it('développe aussi la ligature Æ', () => {
    expect(foldForCompare('Lætitia')).toBe(foldForCompare('LAETITIA'))
  })

  it('efface les apostrophes, quelle que soit leur forme', () => {
    expect(foldForCompare("l'art")).toBe(foldForCompare('l’art'))
    expect(foldForCompare("l'art")).toBe('LART')
  })

  it('efface toute ponctuation et met en majuscules', () => {
    expect(foldForCompare('la clé, sous le paillasson !')).toBe('LACLESOUSLEPAILLASSON')
  })

  it('efface les espaces, y compris multiples', () => {
    expect(foldForCompare('le   vent')).toBe('LEVENT')
  })
})

describe('matchesAnswer', () => {
  it('accepte une réponse identique à la casse et aux accents près', () => {
    expect(matchesAnswer('le vent', 'LE VENT')).toBe(true)
  })

  it('accepte une réponse sans espaces', () => {
    expect(matchesAnswer('levent', 'LE VENT')).toBe(true)
  })

  it('refuse une réponse plus longue que la solution : aucune tolérance', () => {
    expect(matchesAnswer('LES VENTS', 'LE VENT')).toBe(false)
  })

  it('refuse une faute de frappe d’une seule lettre', () => {
    expect(matchesAnswer('LE PETIT PRUNCE', 'LE PETIT PRINCE')).toBe(false)
  })

  it('refuse une chaîne vide', () => {
    expect(matchesAnswer('', 'PARIS')).toBe(false)
  })

  it('refuse une chaîne de simples espaces', () => {
    expect(matchesAnswer('   ', 'PARIS')).toBe(false)
  })

  it('refuse une tentative vide même contre une réponse vide : aucune tentative ne peut valoir vide', () => {
    expect(matchesAnswer('', '')).toBe(false)
    expect(matchesAnswer('   ', '')).toBe(false)
  })
})
