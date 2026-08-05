// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { clearAllData, saveMistralKey } from '../storage/persist'
import { monterApp } from '../test/app'

/**
 * `persist.ts` garde un repli en mémoire au niveau du module, que
 * `localStorage.clear()` seul n'atteint pas : sans les deux, une clé écrite
 * par un test précédent réapparaît dans celui-ci.
 */
beforeEach(() => {
  clearAllData()
  localStorage.clear()
})

describe('HomeRoute', () => {
  it('sans clé enregistrée, affiche le bandeau et son lien vers les réglages', () => {
    monterApp('/')

    expect(
      screen.getByRole('heading', { level: 2, name: 'Aucune clé d’API enregistrée' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('link', { name: 'Enregistrer une clé dans les réglages' }),
    ).toHaveAttribute('href', '/reglages')
  })

  it('avec une clé enregistrée, le bandeau est absent', () => {
    saveMistralKey('sk-une-cle-1234')

    monterApp('/')

    expect(
      screen.queryByRole('heading', { name: 'Aucune clé d’API enregistrée' }),
    ).not.toBeInTheDocument()
  })

  it('laisse lancer une partie même sans clé enregistrée', () => {
    monterApp('/')

    expect(screen.getByRole('button', { name: 'Jouer' })).toBeInTheDocument()
  })
})
