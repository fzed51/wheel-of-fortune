// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { clearAllData, loadMistralKey } from '../storage/persist'
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

// `restoreMocks` remet les espions en place mais ne défait pas `stubGlobal` :
// sans ça, le `fetch` d'un test fuiterait dans le suivant.
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SettingsRoute', () => {
  it('la case « Lancer simple » est décochée par défaut', () => {
    monterApp('/reglages')

    expect(
      screen.getByRole('checkbox', { name: 'Lancer simple (sans jauge de puissance)' }),
    ).not.toBeChecked()
  })

  it('cocher « Lancer simple » persiste le réglage', async () => {
    const user = userEvent.setup()
    const premier = monterApp('/reglages')

    await user.click(
      screen.getByRole('checkbox', { name: 'Lancer simple (sans jauge de puissance)' }),
    )
    // Démonté avant de remonter : sans ça, les deux instances coexisteraient
    // dans le même `document.body` et fausseraient les requêtes suivantes.
    premier.unmount()

    // Vérifié par le comportement observable, pas en lisant `localStorage` :
    // remonter l'application doit relire le réglage persisté.
    monterApp('/reglages')
    expect(
      screen.getByRole('checkbox', { name: 'Lancer simple (sans jauge de puissance)' }),
    ).toBeChecked()
  })

  it('sans clé enregistrée, rassure : le jeu se joue entièrement sans', () => {
    monterApp('/reglages')

    expect(
      screen.getByText(
        'Aucune clé enregistrée. Le jeu se joue entièrement sans : cette clé ne fait qu’ouvrir la question bonus de la manche finale (500 euros fixes), et sert à « Tester la clé » ci-dessous.',
      ),
    ).toBeInTheDocument()
  })

  it('n’affirme plus que « Résoudre » a besoin d’une clé d’API', () => {
    monterApp('/reglages')

    // « Résoudre » compare désormais localement, sans juge (`src/game/compare.ts`) :
    // une régression qui referait dépendre cette action de la clé doit faire
    // tomber ce test, pas seulement le vieux texte qu'il remplace.
    expect(screen.queryByText(/Résoudre/)).not.toBeInTheDocument()
  })

  it('annonce que la clé sert à la question bonus de la manche finale, pour un montant fixe', () => {
    monterApp('/reglages')

    expect(
      screen.getByText(/question bonus de la manche finale \(500 euros fixes\)/),
    ).toBeInTheDocument()
  })

  it('enregistre une clé : le champ se vide, l’indice apparaît, la clé complète ne fuite nulle part', async () => {
    const user = userEvent.setup()
    monterApp('/reglages')

    const fullKey = 'sk-secret-abcd1234'
    const input = screen.getByLabelText('Clé d’API Mistral')
    await user.type(input, fullKey)
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))

    // Le champ est vidé après enregistrement.
    expect(input).toHaveValue('')
    // L'indice des 4 derniers caractères apparaît quelque part dans l'écran.
    expect(screen.getByText(/1234/)).toBeInTheDocument()
    // Test de régression de sécurité : la clé complète ne doit jamais
    // apparaître dans le document, même si un indice de sa fin y figure.
    expect(document.body.textContent).not.toContain(fullKey)
  })

  it('efface la clé et revient à l’état sans clé', async () => {
    const user = userEvent.setup()
    monterApp('/reglages')

    const input = screen.getByLabelText('Clé d’API Mistral')
    await user.type(input, 'sk-une-cle-1234')
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(
      screen.queryByText(
        'Aucune clé enregistrée. Le jeu se joue entièrement sans : cette clé ne fait qu’ouvrir la question bonus de la manche finale (500 euros fixes), et sert à « Tester la clé » ci-dessous.',
      ),
    ).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Effacer la clé' }))

    expect(
      screen.getByText(
        'Aucune clé enregistrée. Le jeu se joue entièrement sans : cette clé ne fait qu’ouvrir la question bonus de la manche finale (500 euros fixes), et sert à « Tester la clé » ci-dessous.',
      ),
    ).toBeInTheDocument()
  })

  it('teste une clé refusée par Mistral et affiche le message adapté', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    )
    const user = userEvent.setup()
    monterApp('/reglages')

    await user.type(screen.getByLabelText('Clé d’API Mistral'), 'sk-mauvaise-cle')
    await user.click(screen.getByRole('button', { name: 'Tester la clé' }))

    await screen.findByText(/Clé refusée par Mistral/)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('teste une clé quand le service est injoignable et affiche le message adapté', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    const user = userEvent.setup()
    monterApp('/reglages')

    await user.type(screen.getByLabelText('Clé d’API Mistral'), 'sk-une-cle-quelconque')
    await user.click(screen.getByRole('button', { name: 'Tester la clé' }))

    await screen.findByText(/injoignable/)
  })

  it('met le bouton « Tester la clé » en cooldown après un essai', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(null, { status: 401 })),
    )
    const user = userEvent.setup()
    monterApp('/reglages')

    await user.type(screen.getByLabelText('Clé d’API Mistral'), 'sk-une-cle')
    const testButton = screen.getByRole('button', { name: 'Tester la clé' })
    await user.click(testButton)

    await screen.findByText(/Clé refusée par Mistral/)
    expect(testButton).toHaveAttribute('aria-disabled', 'true')
  })

  it('n’efface rien avant confirmation, et efface la clé du stockage après confirmation', async () => {
    /*
     * jsdom n'implémente pas la navigation : sans ce remplacement, le
     * rechargement écrirait « Not implemented: navigation » dans la sortie du
     * test — un avertissement qui n'annonce aucun problème mais qui use la
     * vigilance. `location.reload` n'étant pas redéfinissable dans jsdom, c'est
     * l'objet entier qui est remplacé, et seule la méthode utilisée par
     * l'écran y figure : le routeur des tests est un `createMemoryRouter`, il
     * ne lit jamais `window.location`.
     */
    const reload = vi.fn()
    vi.stubGlobal('location', { reload })

    const user = userEvent.setup()
    monterApp('/reglages')

    await user.type(screen.getByLabelText('Clé d’API Mistral'), 'sk-une-cle-a-garder')
    await user.click(screen.getByRole('button', { name: 'Enregistrer la clé' }))
    expect(loadMistralKey()).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Effacer toutes les données' }))
    // Avant confirmation, rien n'est effacé.
    expect(loadMistralKey()).not.toBeNull()

    await user.click(screen.getByRole('button', { name: 'Confirmer l’effacement' }))

    await waitFor(() => {
      expect(loadMistralKey()).toBeNull()
    })
    expect(
      screen.getByText(
        'Aucune clé enregistrée. Le jeu se joue entièrement sans : cette clé ne fait qu’ouvrir la question bonus de la manche finale (500 euros fixes), et sert à « Tester la clé » ci-dessous.',
      ),
    ).toBeInTheDocument()
    /*
     * Le rechargement fait partie du contrat, ce n'est pas un détail
     * d'implémentation : les providers gardent réglages, énigmes perso et
     * partie en cours dans leur état React, que `clearAllData` n'atteint pas.
     * Sans repartir de zéro, le premier `update` réécrirait tout et
     * l'effacement serait annulé en silence.
     */
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
