import { Navigate, Outlet } from 'react-router'
import { useGameState } from '../context/selectors'

/**
 * Garde de `/jeu` et `/resultats`, montée en route pivot sans chemin pour n'écrire
 * la condition qu'une fois.
 *
 * La redirection est rendue en JSX, jamais appelée dans un effet : un
 * `navigate()` en effet serait double-déclenché par StrictMode et laisserait
 * l'URL diverger de l'état. Elle ne peut pas se tromper au premier rendu non
 * plus, `GameProvider` hydratant la sauvegarde de façon synchrone.
 */
export default function RequireGame() {
  const state = useGameState()
  if (state.kind !== 'playing') return <Navigate to="/" replace />
  return <Outlet />
}
