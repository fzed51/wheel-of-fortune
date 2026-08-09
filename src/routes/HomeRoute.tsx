import { Link, useNavigate } from 'react-router'
import { BUTTON_GHOST, BUTTON_PRIMARY, CARD, FIELD, INPUT } from '../components/classes'
import { useGame, useGameCommands } from '../context/selectors'
import { MAX_OPPONENTS, MAX_ROUNDS, MIN_ROUNDS } from '../game/setup'
import { useSettings } from '../hooks/useSettings'
import { BOT_LEVELS } from '../storage/settings'

const LEVELS: Record<(typeof BOT_LEVELS)[number], string> = {
  easy: 'Facile',
  normal: 'Normal',
}

/**
 * Accueil. Il ne redirige **pas** vers `/jeu` quand une partie est en cours :
 * rediriger interdirait d'en lancer une autre. Il propose les deux, et la reprise
 * est un simple lien.
 */
export default function HomeRoute() {
  const game = useGame()
  const { startGame } = useGameCommands()
  const { settings, update } = useSettings()
  const navigate = useNavigate()

  function onNewGame() {
    startGame()
    // Navigation dans le gestionnaire, pas dans un effet : ici l'utilisateur a
    // cliqué, l'intention est explicite et StrictMode ne la rejoue pas.
    void navigate('/jeu')
  }

  return (
    <div className="flex flex-col gap-6">
      <p className="text-fg-muted">
        Devinez l’énigme lettre par lettre. Tournez la roue, proposez une consonne,
        achetez une voyelle — et tentez de résoudre.
      </p>

      {game !== null && (
        <section className={CARD}>
          <h2 className="font-semibold text-fg">Partie en cours</h2>
          <p className="mt-1 text-sm text-fg-muted">
            Manche {game.history.length + 1} sur {game.config.roundCount}.
          </p>
          <Link to="/jeu" className={`${BUTTON_PRIMARY} mt-3 inline-block`}>
            Reprendre
          </Link>
        </section>
      )}

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Nouvelle partie</h2>

        <div className={FIELD}>
          <label htmlFor="roundCount" className="text-fg">
            Nombre de manches
          </label>
          <input
            id="roundCount"
            type="number"
            inputMode="numeric"
            min={MIN_ROUNDS}
            max={MAX_ROUNDS}
            value={settings.roundCount}
            onChange={(event) => {
              // Champ vidé : `valueAsNumber` vaut NaN, qui repartirait dans
              // `value` et ferait râler React. On ignore la frappe.
              const asked = event.target.valueAsNumber
              if (Number.isFinite(asked)) update({ roundCount: asked })
            }}
            className={`${INPUT} w-20`}
          />
        </div>

        <div className={FIELD}>
          <label htmlFor="opponents" className="text-fg">
            Adversaires
          </label>
          <input
            id="opponents"
            type="number"
            inputMode="numeric"
            min={0}
            max={MAX_OPPONENTS}
            value={settings.opponents}
            onChange={(event) => {
              const asked = event.target.valueAsNumber
              if (Number.isFinite(asked)) update({ opponents: asked })
            }}
            className={`${INPUT} w-20`}
          />
        </div>

        <div className={FIELD}>
          <label htmlFor="botLevel" className="text-fg">
            Niveau des bots
          </label>
          <select
            id="botLevel"
            value={settings.botLevel}
            onChange={(event) => {
              const level = BOT_LEVELS.find((candidate) => candidate === event.target.value)
              if (level !== undefined) update({ botLevel: level })
            }}
            className={INPUT}
          >
            {BOT_LEVELS.map((level) => (
              <option key={level} value={level}>
                {LEVELS[level]}
              </option>
            ))}
          </select>
        </div>

        <button type="button" onClick={onNewGame} className={`${BUTTON_PRIMARY} mt-3`}>
          {game === null ? 'Jouer' : 'Repartir de zéro'}
        </button>
        {game !== null && (
          <p className="mt-2 text-sm text-fg-muted">La partie en cours sera abandonnée.</p>
        )}
      </section>

      <nav aria-label="Autres écrans" className="flex flex-wrap gap-2">
        <Link to="/regles" className={BUTTON_GHOST}>
          Règles
        </Link>
        <Link to="/enigmes" className={BUTTON_GHOST}>
          Mes énigmes
        </Link>
        <Link to="/reglages" className={BUTTON_GHOST}>
          Réglages
        </Link>
      </nav>
    </div>
  )
}
