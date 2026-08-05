// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { formatEuros } from '../game/announce'
import { VOWEL_COST } from '../game/setup'
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

  it('structure l’écran en sections nommées par des titres de niveau 2', () => {
    monterApp('/regles')

    const titles = screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent)
    expect(titles).toContain('En bref')
    expect(titles).toContain('Les cases spéciales')
    expect(titles).toContain('Résoudre')
  })
})
