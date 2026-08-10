// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { clearAllData } from '../storage/persist'
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
  it('laisse lancer une partie même sans clé enregistrée, sans le moindre avertissement à ce sujet', () => {
    monterApp('/')

    expect(screen.getByRole('button', { name: 'Jouer' })).toBeInTheDocument()
    // Le jeu se joue entièrement sans clé : aucun bandeau ne doit plus en
    // parler, ni comme avertissement ni comme mention quelconque.
    expect(screen.queryByText(/clé/i)).not.toBeInTheDocument()
  })
})
