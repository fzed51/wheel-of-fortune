// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PuzzleList from './PuzzleList'
import { asPuzzleId } from '../../game/types'
import type { Puzzle } from '../../game/types'

function puzzle(id: string, answer: string): Puzzle {
  return { id: asPuzzleId(id), answer, category: 'Animaux', source: 'custom' }
}

describe('PuzzleList', () => {
  it('affiche un état vide qui explique quoi faire quand il n’y a aucune énigme', () => {
    render(<PuzzleList puzzles={[]} onEdit={() => {}} onRemove={() => {}} />)

    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText(/Aucune énigme/)).toBeInTheDocument()
  })

  it('demande la modification de l’énigme de la ligne cliquée', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const chat = puzzle('perso-1', 'LE CHAT NOIR')
    render(
      <PuzzleList puzzles={[chat, puzzle('perso-2', 'LE CHIEN BLANC')]} onEdit={onEdit} onRemove={() => {}} />,
    )

    await user.click(screen.getByRole('button', { name: 'Modifier LE CHAT NOIR' }))

    expect(onEdit).toHaveBeenCalledWith(chat)
  })

  it('n’appelle pas onRemove avant confirmation', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(
      <PuzzleList puzzles={[puzzle('perso-1', 'LE CHAT NOIR')]} onEdit={() => {}} onRemove={onRemove} />,
    )

    await user.click(screen.getByRole('button', { name: 'Supprimer LE CHAT NOIR' }))

    expect(onRemove).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: /Confirmer la suppression/ })).toBeInTheDocument()
  })

  it('appelle onRemove avec le bon identifiant après confirmation', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()
    render(
      <PuzzleList puzzles={[puzzle('perso-1', 'LE CHAT NOIR')]} onEdit={() => {}} onRemove={onRemove} />,
    )

    await user.click(screen.getByRole('button', { name: 'Supprimer LE CHAT NOIR' }))
    await user.click(screen.getByRole('button', { name: /Confirmer la suppression/ }))

    expect(onRemove).toHaveBeenCalledWith(asPuzzleId('perso-1'))
  })

  it('referme la confirmation en cours quand on ouvre celle d’une autre ligne', async () => {
    const user = userEvent.setup()
    render(
      <PuzzleList
        puzzles={[puzzle('perso-1', 'LE CHAT NOIR'), puzzle('perso-2', 'LE CHIEN BLANC')]}
        onEdit={() => {}}
        onRemove={() => {}}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Supprimer LE CHAT NOIR' }))
    expect(screen.getByRole('button', { name: /Confirmer la suppression de LE CHAT NOIR/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Supprimer LE CHIEN BLANC' }))

    expect(
      screen.queryByRole('button', { name: /Confirmer la suppression de LE CHAT NOIR/ }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /Confirmer la suppression de LE CHIEN BLANC/ }),
    ).toBeInTheDocument()
  })
})
