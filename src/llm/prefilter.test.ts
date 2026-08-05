import { describe, expect, it } from 'vitest'
import { foldForCompare, levenshtein, prefilter } from './prefilter'

describe('foldForCompare', () => {
  it('ignore les accents et la ponctuation', () => {
    expect(foldForCompare("l'été, à Nîmes")).toBe(foldForCompare('LETE A NIMES'))
  })

  it('développe la ligature Œ comme le fait la grille de jeu', () => {
    // `normalize('NFD')` seul ne décompose pas Œ : sans le remplacement
    // explicite, CŒUR et COEUR seraient jugés différents.
    expect(foldForCompare('CŒUR')).toBe(foldForCompare('COEUR'))
  })
})

describe('levenshtein', () => {
  it('vaut zéro entre deux chaînes identiques', () => {
    expect(levenshtein('BONJOUR', 'BONJOUR')).toBe(0)
  })

  it('est symétrique', () => {
    expect(levenshtein('CHATON', 'CARTON')).toBe(levenshtein('CARTON', 'CHATON'))
  })

  it('vaut la longueur de l’autre chaîne quand l’une est vide', () => {
    expect(levenshtein('', 'BONJOUR')).toBe('BONJOUR'.length)
    expect(levenshtein('BONJOUR', '')).toBe('BONJOUR'.length)
  })
})

describe('prefilter', () => {
  it('tranche correct sans appeler le LLM quand les pliages sont égaux', () => {
    expect(prefilter("l'été à Nîmes", 'LETE A NIMES')).toEqual({
      kind: 'decided',
      correct: true,
      reason: 'exact',
    })
  })

  it('tranche incorrect sans appeler le LLM quand la tentative est vide', () => {
    expect(prefilter('   ', 'PARIS')).toEqual({
      kind: 'decided',
      correct: false,
      reason: 'empty',
    })
  })

  it("renvoie 'ask-llm' pour une faute de frappe d'une lettre sur une réponse longue", () => {
    expect(prefilter('LE PETIT PRUNCE', 'LE PETIT PRINCE')).toEqual({ kind: 'ask-llm' })
  })

  it('tranche incorrect sans appeler le LLM pour une réponse sans rapport', () => {
    expect(prefilter('GIRAFE', 'PARAPLUIE')).toEqual({
      kind: 'decided',
      correct: false,
      reason: 'too-far',
    })
  })

  it('tranche déjà trop loin une tentative courte à une lettre près : le ratio mord vite sur des mots courts', () => {
    // CHAT -> RAT : une substitution (C/R) et une suppression (H), soit une
    // distance de 2 pour une longueur de 4 : ratio 0,5, au-dessus du seuil.
    // Sur des mots courts, une seule lettre d'écart franchit déjà 0,4.
    //
    // Sans conséquence pour le jeu : `ANSWER_MIN_LENGTH` impose au moins dix
    // caractères à une énigme, donc une comparaison aussi courte ne peut venir
    // que d'une tentative tronquée — cas où « trop loin » est le bon verdict.
    // C'est sur les tentatives longues que le seuil doit être juste, et c'est
    // là qu'il l'est.
    expect(prefilter('CHAT', 'RAT')).toEqual({
      kind: 'decided',
      correct: false,
      reason: 'too-far',
    })
  })
})
