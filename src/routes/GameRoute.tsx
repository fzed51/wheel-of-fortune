import { useState } from 'react'
import { Navigate } from 'react-router'
import Controls from '../components/Controls'
import Keyboard from '../components/Keyboard'
import PuzzleBoard from '../components/PuzzleBoard'
import ResolveDialog from '../components/ResolveDialog'
import Scoreboard from '../components/Scoreboard'
import Wheel from '../components/Wheel'
import { BUTTON_PRIMARY, CARD } from '../components/classes'
import {
  useCurrentPlayer,
  useGame,
  useGameCommands,
  useJudgeFailure,
  useRound,
} from '../context/selectors'
import { announcePuzzle, formatEuros } from '../game/announce'
import {
  canResolve,
  canSpin,
  isBotTurn,
  isStuck,
  keyState,
  multiplierFor,
  revealedLetters,
} from '../game/rules'
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
  const { playLetter, spin, pass, nextRound, settleSpin, resolve } = useGameCommands()
  const judgeFailure = useJudgeFailure()

  // La boîte est un élément d'interface, pas un état de partie : le reducer
  // n'a aucune raison de savoir qu'un dialogue est affiché.
  const [resolveOpen, setResolveOpen] = useState(false)

  // Lu directement sur `round.phase`, jamais via une variable intermédiaire :
  // TypeScript ne transporte pas le rétrécissement de `phase.kind` à travers
  // un alias (déjà commenté ainsi plus bas dans ce fichier).
  const pending = round !== null && round.phase.kind === 'resolving'

  // Repli sur la valeur précédente comparée pendant le rendu — même motif que
  // `PuzzleForm`/`ResolveDialog` — plutôt qu'un effet, qui coûterait un rendu
  // de plus pendant lequel la boîte afficherait encore l'attente alors que la
  // manche est déjà finie. On ne ferme qu'à la transition attente -> repos,
  // et seulement si aucun échec technique n'a été posé : `GameProvider` pose
  // `judgeFailure` et dispatche `resolve/failed` dans le même lot, les deux
  // arrivent donc ensemble. Si le joueur ferme la boîte après un échec puis
  // la rouvre, l'ancien message reste affiché jusqu'au prochain envoi — c'est
  // assumé, le message reste vrai : le dernier essai a bien échoué.
  const [prevPending, setPrevPending] = useState(pending)
  if (pending !== prevPending) {
    setPrevPending(pending)
    if (prevPending && judgeFailure === null) setResolveOpen(false)
  }

  // Refusée en silence si l'action est illégale : partie non nulle,
  // `canResolve(game)`, et pas le tour d'un bot. Nécessaire ici et pas
  // seulement dans `Controls`, parce que le clavier physique appelle cette
  // fonction sans connaître la légalité — un `aria-disabled` n'empêche rien
  // côté clavier physique.
  function openResolve(): void {
    if (game === null || isBotTurn(game) || !canResolve(game)) return
    setResolveOpen(true)
  }

  // Clavier physique et clavier virtuel appellent les mêmes commandes : c'est
  // ce qui garantit qu'une touche allumée à l'écran reflète exactement ce que
  // le joueur vient de taper, quel que soit le chemin emprunté.
  const pressed = usePhysicalKeyboard({
    onLetter: playLetter,
    onSpin: spin,
    onResolve: openResolve,
  })

  if (game === null) return null
  if (game.progress.kind === 'game-over') return <Navigate to="/resultats" replace />

  /*
   * Pendant le tour d'un bot, les trois commandes sont inertes. Ce n'est
   * qu'une mise en forme : la garde qui compte est dans les commandes du
   * provider, parce que le clavier physique n'a pas d'attribut à griser. Le
   * clavier virtuel se tait de lui-même, `keyState` connaissant déjà le tour
   * de bot.
   */
  const botTurn = isBotTurn(game)

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
        <Wheel
          // Lu directement sur `round.phase`, jamais via une variable
          // intermédiaire : TypeScript ne transporte pas le rétrécissement de
          // `phase.kind` à travers un alias.
          spin={round.phase.kind === 'spinning' ? round.phase.spin : null}
          highlighted={round.phase.kind === 'awaiting-consonant' ? round.phase.segment.index : null}
          onSettled={settleSpin}
        />
      )}

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
          canSpin={canSpin(game) && !botTurn}
          canResolve={canResolve(game) && !botTurn}
          canPass={isStuck(game) && !botTurn}
          resolveEnabled={game.config.resolveEnabled}
          vowelCost={game.config.vowelCost}
          spinning={round.phase.kind === 'spinning'}
          onSpin={spin}
          onResolve={openResolve}
          onPass={pass}
        />
      )}

      {round !== null && (
        <ResolveDialog
          open={resolveOpen}
          pending={pending}
          failure={judgeFailure}
          // Le dialogue modal masque le plateau : la catégorie est le seul
          // indice qui reste au joueur.
          category={round.puzzle.category}
          onSubmit={resolve}
          onClose={() => setResolveOpen(false)}
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
