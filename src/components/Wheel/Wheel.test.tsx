// @vitest-environment jsdom
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Wheel from './Wheel'
import type { WheelProps } from './Wheel'
import { ROTOR_INSET_PERCENT } from './geometry'

/**
 * `AimArc` est `aria-hidden`, sans rôle ni nom : rien n'y désigne un point
 * d'ancrage pour une requête accessible. On le remplace donc ici par un
 * repère test-only muni d'un rôle, pour vérifier une seule chose — où ce
 * composant est monté dans l'arbre, pas ce qu'il dessine (couvert par
 * `AimArc.test.tsx`).
 */
vi.mock('../AimArc', () => ({
  default: () => <div role="region" aria-label="Arc simulé" />,
}))

function props(overrides: Partial<WheelProps> = {}): WheelProps {
  return {
    angle: 0,
    spin: null,
    highlighted: null,
    onSettled: vi.fn(),
    aiming: false,
    aimRef: createRef<HTMLDivElement | null>(),
    spinLabel: 'Lancer',
    spinDisabled: false,
    onSpin: vi.fn(),
    ...overrides,
  }
}

describe('Wheel', () => {
  it('monte l’arc de visée en frère du rotor, jamais en enfant', () => {
    const { container } = render(<Wheel {...props({ aiming: true })} />)

    const arc = screen.getByRole('region', { name: 'Arc simulé' })
    // Seule dérogation de ce dépôt à « jamais de sélecteur de classe » dans un
    // test, et elle est bornée : `wheel-rotor` n'est pas une classe de style
    // mais l'identifiant désigné du rotor, déjà load-bearing hors d'ici —
    // `scripts/browser-check/check.mjs` filtre `document.getAnimations()`
    // dessus pour séparer l'animation de la roue de celle de la visée, et
    // `AimArc.tsx` documente qu'il ne doit jamais la porter. Le rotor n'ayant
    // ni rôle ni nom accessible (son SVG est `aria-hidden`), aucune requête
    // accessible ne peut l'atteindre : sans cet ancrage, la position de l'arc
    // dans l'arbre ne serait pas testable du tout.
    const rotor = container.querySelector('.wheel-rotor')
    expect(rotor).not.toBeNull()
    // Un arc placé à l'intérieur du rotor tournerait avec la roue et ne
    // désignerait plus rien : cette assertion rougirait si quelqu'un
    // déplaçait `<AimArc>` à l'intérieur de `<div ref={rotorRef}>`.
    expect(rotor?.contains(arc)).toBe(false)
    expect(container.contains(arc)).toBe(true)
  })

  it('ne monte pas l’arc de visée hors visée', () => {
    render(<Wheel {...props({ aiming: false })} />)

    expect(screen.queryByRole('region', { name: 'Arc simulé' })).not.toBeInTheDocument()
  })

  it('rentre le rotor pour libérer la couronne où se pose l’arc de visée', () => {
    const { container } = render(<Wheel {...props()} />)

    // Même ancrage `.wheel-rotor` que le test ci-dessus, pour la même raison :
    // aucun rôle ni nom accessible ne désigne le rotor. Cette assertion
    // rougirait si le retrait `inset` était retiré ou décorrélé de
    // `ROTOR_INSET_PERCENT` (ex. valeur recopiée en dur dans le style).
    const rotor = container.querySelector('.wheel-rotor')
    expect(rotor).toBeInstanceOf(HTMLElement)
    expect(rotor instanceof HTMLElement ? rotor.style.inset : null).toBe(`${ROTOR_INSET_PERCENT}%`)
  })

  it('porte un bouton central dont le nom accessible contient le libellé visible', () => {
    render(<Wheel {...props({ spinLabel: 'Stop' })} />)

    // Le texte visible seul (« Stop ») ne doit désigner que le bouton de la
    // barre d'actions ailleurs dans l'appli, jamais celui-ci : le nom
    // accessible complet lève l'ambiguïté que deux boutons « Stop » créeraient.
    expect(screen.getByRole('button', { name: 'Stop au centre de la roue' })).toHaveTextContent('Stop')
  })

  it('un clic sur le bouton central appelle onSpin', async () => {
    const onSpin = vi.fn()
    const user = userEvent.setup()
    render(<Wheel {...props({ onSpin })} />)

    await user.click(screen.getByRole('button', { name: 'Lancer au centre de la roue' }))

    expect(onSpin).toHaveBeenCalledTimes(1)
  })

  it('garde le bouton central hors de l’ordre de tabulation', async () => {
    const user = userEvent.setup()
    render(<Wheel {...props()} />)

    await user.tab()

    // `GameRoute` monte la roue avant la grille, les scores et la barre
    // d'actions : sans `tabIndex={-1}`, ce raccourci pointeur serait le premier
    // des deux boutons de lancer atteint au clavier, et le focus retomberait
    // sur `<body>` à chaque lancer puisqu'il se démonte. Ce test rougit dès
    // qu'on retire l'attribut — le bouton devient alors le seul élément
    // focalisable de l'arbre rendu ici, donc la cible de ce `tab()`.
    expect(screen.getByRole('button', { name: 'Lancer au centre de la roue' })).not.toHaveFocus()
    expect(document.body).toHaveFocus()
  })

  it('retire le bouton central du DOM quand le lancer est illégal', () => {
    render(<Wheel {...props({ spinDisabled: true, spinLabel: 'Lancer' })} />)

    // Absent par son nom accessible complet : ce test rougirait si le bouton
    // redevenait monté avec `aria-disabled` ou `opacity-0` au lieu d'être
    // retiré du DOM.
    expect(screen.queryByRole('button', { name: 'Lancer au centre de la roue' })).not.toBeInTheDocument()
    // Et aucun bouton du tout, quel que soit son nom : la roue doit être nue.
    // Interroger le nom accessible complet ne suffirait pas — il reste vrai
    // même sur un bouton monté dont l'`aria-label` aurait disparu, puisque le
    // nom recherché ne correspondrait plus. Compter les boutons rougit dans
    // ce cas-là aussi. Le disque, l'aiguille et l'arc sont des `<svg>`
    // `aria-hidden`, sans rôle : ce compte ne peut désigner que le bouton
    // central.
    expect(screen.queryAllByRole('button')).toHaveLength(0)
  })
})
