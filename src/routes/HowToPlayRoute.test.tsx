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

  it('explique que Résoudre est indisponible sans clé d’API, sans repli local', () => {
    monterApp('/regles')

    expect(
      screen.getByText(/aucun repli local qui compare le texte tapé à la réponse attendue/),
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

  it('structure l’écran en sections nommées par des titres de niveau 2', () => {
    monterApp('/regles')

    const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(titles).toContain('En bref')
    expect(titles).toContain('Les cases spéciales')
    expect(titles).toContain('Résoudre')
  })
})
