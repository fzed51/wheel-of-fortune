// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { formatEuros } from '../game/announce'
import { VOWEL_COST } from '../game/setup'
import { BANKRUPT_COUNT, PASS_COUNT, SEGMENT_COUNT, ZERO_COUNT } from '../game/wheel'
import { monterApp } from '../test/app'

describe('HowToPlayRoute', () => {
  it('affiche le prix réel d’une voyelle, tiré de la constante du moteur', () => {
    monterApp('/regles')

    // Le prix vient de la constante, jamais réécrit ici : c'est ce qui fait
    // échouer ce test le jour où `VOWEL_COST` change sans que l'écran suive.
    //
    // Les espaces sont détendues avant la comparaison : `formatEuros` groupe les
    // milliers par une espace **insécable** (U+00A0), que le normaliseur de
    // Testing Library remplace par une espace ordinaire avant de chercher.
    const prix = formatEuros(VOWEL_COST).replace(/\s/g, '\\s')
    expect(
      screen.getByText(new RegExp(`Une voyelle coûte ${prix} et ne rapporte rien`)),
    ).toBeInTheDocument()
  })

  it('explique que Résoudre compare localement, sans réseau ni clé d’API', () => {
    monterApp('/regles')

    expect(
      screen.getByText(/aucun réseau, aucune clé d’API n’intervient/),
    ).toBeInTheDocument()
  })

  it('donne des exemples de réponses acceptées malgré casse, accents et espaces', () => {
    monterApp('/regles')

    // La règle de comparaison vient de `foldForCompare` (src/game/compare.ts) :
    // ce test tombe si l'écran cesse de citer les exemples qui la rendent concrète.
    const item = screen.getByText(/ignore la casse, les accents/).closest('p')
    if (item === null) {
      throw new Error('Le paragraphe décrivant la tolérance de casse est introuvable.')
    }
    expect(item.textContent).toContain('LA CLÉ')
    expect(item.textContent).toContain('la cle')
    expect(item.textContent).toContain('LACLE')
    expect(item.textContent).toContain('CŒUR')
    expect(item.textContent).toContain('coeur')
  })

  it('précise que l’égalité reste stricte : une expression trop longue est refusée', () => {
    monterApp('/regles')

    const item = screen.getByText(/l’égalité doit être stricte/).closest('p')
    if (item === null) {
      throw new Error('Le paragraphe décrivant la rigueur de l’égalité est introuvable.')
    }
    expect(item.textContent).toContain('LES CLÉS')
    expect(item.textContent).toContain('est refusé')
  })

  it('précise qu’une réponse fausse fait passer la main sans vider la cagnotte', () => {
    monterApp('/regles')

    expect(
      screen.getByText(/Une réponse fausse fait passer la main au joueur suivant, mais la cagnotte de la manche\s+est conservée/),
    ).toBeInTheDocument()
  })

  it('explique comment installer l’application depuis Safari sur iOS', () => {
    monterApp('/regles')

    expect(screen.getByText(/Sur l’écran d’accueil/)).toBeInTheDocument()
  })

  it('avertit que le stockage d’une PWA installée diffère de celui de Safari', () => {
    monterApp('/regles')

    expect(
      screen.getByText(/une clé d’API saisie dans l’un n’existe pas dans l’autre/),
    ).toBeInTheDocument()
  })

  it('décrit le nombre exact de cases spéciales, tiré de la disposition de la roue', () => {
    monterApp('/regles')

    // Comme pour `formatEuros`, ces comptes viennent de la constante du moteur :
    // un rééquilibrage de la roue doit faire échouer ce test si le texte ne suit pas.
    expect(
      screen.getByText(
        new RegExp(
          `La roue compte ${SEGMENT_COUNT} cases, dont ${BANKRUPT_COUNT} Banqueroute, ${PASS_COUNT} Passe et ${ZERO_COUNT} case à 0`,
        ),
      ),
    ).toBeInTheDocument()
  })

  it('précise que la case à 0 € laisse la main au joueur, contrairement à Passe', () => {
    monterApp('/regles')

    // Le texte est coupé par un `<strong>` autour de « ne change pas » : `getByText`
    // ne recolle pas des nœuds texte séparés par un élément, on vérifie donc le
    // contenu complet du <li> plutôt qu'une seule regex traversant la balise.
    const item = screen.getByText(/Contrairement à Passe/).closest('li')
    if (item === null) {
      throw new Error('Le <li> de la case à 0 € est introuvable.')
    }
    expect(item.textContent).toContain('aucun gain n’est crédité')
    expect(item.textContent).toContain('ne change pas')
    expect(item.textContent).toContain('le même joueur rejoue aussitôt')
  })

  it('précise que la manche finale porte une question de catégorie « Question »', () => {
    monterApp('/regles')

    const item = screen.getByText(/manche finale porte une énigme/).closest('p')
    if (item === null) {
      throw new Error('Le paragraphe décrivant la manche finale est introuvable.')
    }
    expect(item.textContent).toContain('Question')
  })

  /**
   * Ce test tombera le jour où l'étape bonus (gain associé à la question)
   * sera livrée et que ce paragraphe sera réécrit pour l'annoncer — c'est le
   * signal voulu : il rappelle qu'il reste un texte à compléter ici, pas
   * seulement dans le moteur.
   */
  it('ne promet aucun gain associé à la question de la manche finale', () => {
    monterApp('/regles')

    const item = screen.getByText(/manche finale porte une énigme/).closest('p')
    if (item === null) {
      throw new Error('Le paragraphe décrivant la manche finale est introuvable.')
    }
    expect(item.textContent).not.toMatch(/gagn|rapporte|rapport|€|prime|récompense/i)
  })

  it('structure l’écran en sections nommées par des titres de niveau 2', () => {
    monterApp('/regles')

    const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(titles).toContain('En bref')
    expect(titles).toContain('Les cases spéciales')
    expect(titles).toContain('Résoudre')
  })
})
