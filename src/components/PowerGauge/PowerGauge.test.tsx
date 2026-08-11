// @vitest-environment jsdom
import { createRef } from 'react'
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import PowerGauge from './PowerGauge'

describe('PowerGauge', () => {
  it('masque la jauge au lecteur d’écran', () => {
    const { container } = render(<PowerGauge markerRef={createRef<HTMLDivElement | null>()} />)

    // `aria-hidden` sur la racine : l'information passe par le libellé du
    // bouton et par la live region, jamais par ce dessin.
    expect(container.firstChild).toHaveAttribute('aria-hidden', 'true')
  })

  it('n’expose aucun rôle de valeur', () => {
    render(<PowerGauge markerRef={createRef<HTMLDivElement | null>()} />)

    // La force change une soixantaine de fois par seconde : un rôle
    // `progressbar`, `meter` ou `slider` noierait un lecteur d'écran sous des
    // annonces inutilisables.
    expect(document.querySelector('[role="progressbar"]')).toBeNull()
    expect(document.querySelector('[role="meter"]')).toBeNull()
    expect(document.querySelector('[role="slider"]')).toBeNull()
  })
})
