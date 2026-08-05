import { Navigate } from 'react-router'
import Controls from '../components/Controls'
import Keyboard from '../components/Keyboard'
import PuzzleBoard from '../components/PuzzleBoard'
import Scoreboard from '../components/Scoreboard'
import { BUTTON_PRIMARY, CARD } from '../components/classes'
import { useCurrentPlayer, useGame, useGameCommands, useRound } from '../context/selectors'
import { announcePuzzle, formatEuros } from '../game/announce'
import { canResolve, canSpin, isStuck, keyState, multiplierFor, revealedLetters } from '../game/rules'
import type { Game } from '../game/types'
import { usePhysicalKeyboard } from '../hooks/usePhysicalKeyboard'

/**
 * Phrase de fin de manche : victoire (gagnant, gain, réponse) ou manche annulée
 * faute de lettre jouable. Simple mise en forme des données de `progress`, pas
 * une règle de jeu — les prédicats de `rules.ts` n'y interviennent pas.
 */
function roundOverMessage(game: Game): string {
  if (game.progress.kind !== 'round-over') return ''
  const { summary } = game.progress
  if (summary.outcome.kind === 'void') {
    return `Manche annulée, plus aucune lettre jouable. Réponse : ${summary.puzzle.answer}.`
  }
  // Copié dans une constante à part : une closure ne conserve pas le
  // rétrécissement de type fait juste au-dessus sur `summary.outcome`.
  const outcome = summary.outcome
  const winner = game.players.find((player) => player.id === outcome.by)
  const name = winner?.name ?? ''
  return `Manche gagnée par ${name} : ${formatEuros(outcome.amount)}. Réponse : ${summary.puzzle.answer}.`
}

/**
 * Écran de jeu : assemble le plateau, le clavier, les scores et les commandes.
 * Aucune règle n'y est réécrite — tous les prédicats viennent de `game/rules.ts`.
 * La redirection de fin de partie est rendue en JSX, jamais appelée dans un effet.
 */
export default function GameRoute() {
  const game = useGame()
  const round = useRound()
  const player = useCurrentPlayer()
  const { playLetter, spin, pass, nextRound } = useGameCommands()

  // Clavier physique et clavier virtuel appellent la même commande `playLetter` :
  // c'est ce qui garantit qu'une touche allumée à l'écran reflète exactement ce
  // que le joueur vient de taper, quel que soit le chemin emprunté.
  const pressed = usePhysicalKeyboard({
    onLetter: playLetter,
    onSpin: spin,
    // La boîte de dialogue et le juge arrivent à l'étape 16 : `SettingsRoute`
    // est encore une coquille, aucune clé d'API n'est saisissable aujourd'hui,
    // donc aucun juge n'est joignable. Pas de repli local.
    onResolve: () => {},
  })

  if (game === null) return null
  if (game.progress.kind === 'game-over') return <Navigate to="/resultats" replace />

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="font-semibold text-fg">
          {/* `round.index` plutôt que `history.length` : à la fin d'une manche
              l'historique contient déjà celle qui vient de finir, et l'en-tête
              annoncerait la manche suivante avant qu'elle ne commence. */}
          Manche {round !== null ? round.index + 1 : game.history.length} sur{' '}
          {game.config.roundCount}
          {round !== null && ` — gains ×${multiplierFor(round.index)}`}
        </h2>
        {player !== null && (
          <p className="mt-1 text-sm text-fg-muted">
            Au tour de {player.name} — cagnotte {formatEuros(player.pot)}
          </p>
        )}
      </section>

      {round !== null && (
        <PuzzleBoard
          answer={round.puzzle.answer}
          revealed={revealedLetters(round)}
          category={round.puzzle.category}
          description={announcePuzzle(round)}
        />
      )}

      <Scoreboard players={game.players} currentPlayerId={player?.id ?? null} />

      {round !== null && (
        <Controls
          canSpin={canSpin(game)}
          canResolve={canResolve(game)}
          canPass={isStuck(game)}
          // Forcé à `false` (voir `onResolve` ci-dessus) : le bouton reste visible
          // mais inactif tant qu'aucun juge n'est joignable.
          resolveEnabled={false}
          vowelCost={game.config.vowelCost}
          spinning={round.phase.kind === 'spinning'}
          onSpin={spin}
          onResolve={() => {}}
          onPass={pass}
        />
      )}

      {game.progress.kind === 'round-over' && (
        <section className={CARD}>
          <h3 className="font-semibold text-fg">Manche terminée</h3>
          <p className="mt-1 text-fg-muted">{roundOverMessage(game)}</p>
          <button
            type="button"
            className={`${BUTTON_PRIMARY} mt-3 min-h-11`}
            onClick={() => {
              nextRound()
            }}
          >
            Manche suivante
          </button>
        </section>
      )}

      {round !== null && (
        <Keyboard
          stateOf={(letter) => keyState(game, letter)}
          onLetter={playLetter}
          pressed={pressed}
        />
      )}
    </div>
  )
}
