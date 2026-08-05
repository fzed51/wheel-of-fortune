// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Keyboard from './Keyboard'
import type { KeyState } from './layout'
import type { Letter } from '../../game/types'

/**
 * Rendu sans `Providers` : `Keyboard` ne lit aucun contexte, c'est tout son
 * intérêt en tant que composant présentationnel. L'envelopper dans les
 * providers de `src/test/app.tsx` ajouterait une dépendance à des modules que
 * ce composant n'utilise pas.
 */
function stateDe(overrides: Partial<Record<Letter, KeyState>> = {}) {
  return (letter: Letter): KeyState => overrides[letter] ?? 'available'
}

function bouton(nom: string): HTMLElement {
  return screen.getByRole('button', { name: nom })
}

function tousLesBoutons(): HTMLElement[] {
  return screen.getAllByRole('button')
}

describe('Keyboard', () => {
  it('porte le groupe accessible « Clavier des lettres »', () => {
    render(<Keyboard stateOf={stateDe()} onLetter={() => {}} />)

    expect(screen.getByRole('group', { name: 'Clavier des lettres' })).toBeInTheDocument()
  })

  it('une seule touche porte tabIndex=0 au montage', () => {
    render(<Keyboard stateOf={stateDe()} onLetter={() => {}} />)

    const aTabIndexZero = tousLesBoutons().filter((element) => element.tabIndex === 0)
    expect(aTabIndexZero).toHaveLength(1)
  })

  it('les flèches déplacent le focus vers la touche voisine', async () => {
    const user = userEvent.setup()
    render(<Keyboard stateOf={stateDe()} onLetter={() => {}} />)

    // Disposition groupée (écran étroit par défaut en test) : première rangée
    // « B C D F G H ».
    await user.click(bouton('Lettre B'))
    await user.keyboard('{ArrowRight}')

    expect(bouton('Lettre C')).toHaveFocus()
    expect(bouton('Lettre C')).toHaveAttribute('tabindex', '0')
    expect(bouton('Lettre B')).toHaveAttribute('tabindex', '-1')
  })

  it('Home et End déplacent le focus vers les extrémités de la disposition', async () => {
    const user = userEvent.setup()
    render(<Keyboard stateOf={stateDe()} onLetter={() => {}} />)

    await user.click(bouton('Lettre D'))
    await user.keyboard('{End}')
    expect(bouton('Lettre U')).toHaveFocus()

    await user.keyboard('{Home}')
    expect(bouton('Lettre B')).toHaveFocus()
  })

  it('une touche « used » porte aria-disabled sans disabled, et n’appelle pas onLetter', async () => {
    const user = userEvent.setup()
    const onLetter = vi.fn()
    render(<Keyboard stateOf={stateDe({ B: 'used' })} onLetter={onLetter} />)

    const touche = bouton('Lettre B, déjà proposée')
    expect(touche).toHaveAttribute('aria-disabled', 'true')
    expect(touche).not.toHaveAttribute('disabled')

    await user.click(touche)

    expect(onLetter).not.toHaveBeenCalled()
  })

  it('appelle onLetter avec la lettre cliquée quand la touche est disponible', async () => {
    const user = userEvent.setup()
    const onLetter = vi.fn()
    render(<Keyboard stateOf={stateDe()} onLetter={onLetter} />)

    await user.click(bouton('Lettre R'))

    expect(onLetter).toHaveBeenCalledTimes(1)
    expect(onLetter).toHaveBeenCalledWith('R')
  })
})
