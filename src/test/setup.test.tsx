// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

function Compteur() {
  const [n, setN] = useState(0)
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      Tours : {n}
    </button>
  )
}

// Ce test ne couvre aucune logique métier : il vérifie que la chaîne
// vitest + jsdom + Testing Library + jest-dom est correctement câblée.
describe('outillage de test', () => {
  it('rend un composant dans jsdom et applique les matchers jest-dom', () => {
    render(<Compteur />)
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('propage une interaction utilisateur jusqu’au rendu', async () => {
    render(<Compteur />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('button')).toHaveTextContent('Tours : 1')
  })
})
