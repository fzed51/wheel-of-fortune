import type { GameAction } from './actions'
import type { Cell } from './puzzle'
import { cellsOf, countOccurrences, revealedLetters } from './puzzle'
import { activeRound, currentPlayerOf, multiplierFor } from './rules'
import type { Consonant, Game, GameState, Letter, Player, PlayerId, RoundState, Vowel } from './types'

/**
 * Chaînes lues par le lecteur d'écran. Module pur : aucun JSX, aucun DOM,
 * aucun `Date`, aucun aléa — tout ce qui varie arrive déjà décidé par
 * l'appelant (state avant/après, action).
 */
export interface Announcement {
  /** Lu par la live region `role="status"`. Chaîne vide si rien à dire. */
  readonly status: string
  /** Lu par la live region `role="alert"`. Chaîne vide si rien à signaler. */
  readonly alert: string
  /**
   * Ce que l'œil doit lire. **Absent** = identique à `status`, cas de loin le
   * plus fréquent. **Présent et vide** = ne rien afficher, parce que l'écran
   * porte déjà l'information par lui-même.
   */
  readonly visible?: string
}

/** Raison d'échec du juge : `actions.ts` ne l'exporte pas comme type à part, on le dérive. */
type ResolveFailedReason = Extract<GameAction, { readonly type: 'resolve/failed' }>['reason']

/**
 * Groupe les milliers par une espace insécable et accorde « euro » au
 * singulier. `toLocaleString('fr-FR')` n'est pas utilisé : l'ICU embarquée
 * varie selon la version de Node et ne garantit pas U+00A0 (parfois U+202F).
 */
export function formatEuros(amount: number): string {
  const rounded = Math.round(amount)
  const abs = Math.abs(rounded)
  const grouped = String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const sign = rounded < 0 ? '-' : ''
  const unit = abs === 0 || abs === 1 ? 'euro' : 'euros'
  return `${sign}${grouped} ${unit}`
}

/** Un caractère épelé : lettre de jeu si révélée, `blanc` sinon, ponctuation nommée. */
function spellCell(cell: Cell, revealed: ReadonlySet<Letter>): string {
  if (cell.char === "'") return 'apostrophe'
  if (cell.char === '-') return "trait d'union"
  if (cell.letter === null) return cell.char
  return revealed.has(cell.letter) ? cell.letter : 'blanc'
}

/** Un lecteur d'écran prononce `LACLÉ` comme un mot : la réponse doit être épelée, jamais lue telle quelle. */
export function spellPuzzle(answer: string, revealed: ReadonlySet<Letter>): string {
  const words = wordsOf(answer)
  const spelled = words.map((word) => cellsOf(word).map((cell) => spellCell(cell, revealed)).join(' '))
  return `${spelled.join(', ')}.`
}

/** Mots séparés par l'espace unique que garantit `normalizeAnswer`. */
function wordsOf(answer: string): readonly string[] {
  return answer.split(' ').filter((word) => word.length > 0)
}

export function announcePuzzle(round: RoundState): string {
  const count = wordsOf(round.puzzle.answer).length
  const label = count === 1 ? '1 mot.' : `${count} mots.`
  return `${label} ${spellPuzzle(round.puzzle.answer, revealedLetters(round))}`
}

export function announceTurn(game: Game): string {
  const round = activeRound(game)
  if (round === null) return ''
  const player = currentPlayerOf(game)
  return player.kind.type === 'human' ? 'À vous de jouer.' : `Au tour de ${player.name}.`
}

export function announceJudgeFailure(reason: ResolveFailedReason): string {
  switch (reason) {
    case 'network':
      return 'Le juge est injoignable. Vérifiez votre connexion, puis réessayez.'
    case 'timeout':
      return "Le juge n'a pas répondu à temps. Réessayez."
    case 'bad-response':
      return 'Réponse du juge illisible. Réessayez.'
    case 'unauthorized':
      return "Clé d'API refusée. Vérifiez-la dans les Réglages."
  }
}

/** « Vous » pour un humain quel que soit son nom : un seul joueur humain est attendu par partie. */
function subjectName(player: Player): string {
  return player.kind.type === 'human' ? 'Vous' : player.name
}

/**
 * Retrouve l'auteur d'une action par son id et ne le rend que si c'est un
 * bot : l'humain reste implicite (« vous ») comme partout ailleurs dans
 * l'interface, un sujet systématique alourdirait chaque coup pour rien.
 *
 * Deux formes, parce que le sujet ne tombe pas au même endroit de la phrase :
 * celle-ci pour les phrases qui nomment le joueur en cours de texte, `botLabel`
 * pour celles qui le mettent en tête.
 */
function botSpeaker(game: Game, by: PlayerId): Player | null {
  const player = game.players.find((candidate) => candidate.id === by)
  return player !== undefined && player.kind.type === 'bot' ? player : null
}

/** Préfixe de sujet des phrases de lettre : `« Bot 1 : »` pour un bot, rien pour l'humain. */
function botLabel(player: Player | undefined): string {
  return player !== undefined && player.kind.type === 'bot' ? `${player.name} : ` : ''
}

/** Liste à la française : « A », « A et B », « A, B et C ». */
function joinFr(names: readonly string[]): string {
  return names.reduce((acc, name, index) => {
    if (index === 0) return name
    return index === names.length - 1 ? `${acc} et ${name}` : `${acc}, ${name}`
  }, '')
}

/**
 * Vrai si le siège courant a changé entre deux états « en manche ». C'est ce
 * qui décide d'ajouter `announceTurn`, plutôt qu'une liste figée de cas :
 * ça couvre aussi bien la rotation après banqueroute que celle, symétrique,
 * après une voyelle absente — que la consigne omettait de lister.
 */
function turnChanged(prevGame: Game, nextGame: Game): boolean {
  if (prevGame.progress.kind !== 'round' || nextGame.progress.kind !== 'round') return false
  return prevGame.progress.currentPlayer !== nextGame.progress.currentPlayer
}

function withTurnAnnounce(phrase: string, prevGame: Game, nextGame: Game): string {
  if (!turnChanged(prevGame, nextGame)) return phrase
  const turn = announceTurn(nextGame)
  return turn === '' ? phrase : `${phrase} ${turn}`
}

/**
 * Phrase de fin de manche. `round-over` ne connaît que l'issue « solved » :
 * l'issue « void » n'existe qu'au moment de `round/next`, fusionnée avec
 * l'avance à la manche suivante (voir `roundNextAnnouncement`).
 */
function roundOverPhrase(game: Game): string {
  if (game.progress.kind !== 'round-over') return ''
  const outcome = game.progress.summary.outcome
  if (outcome.kind !== 'solved') return ''
  const winner = game.players.find((player) => player.id === outcome.by)
  const name = winner === undefined ? '' : subjectName(winner)
  return `Manche gagnée par ${name} : ${formatEuros(outcome.amount)}. Réponse : ${game.progress.summary.puzzle.answer}.`
}

function roundIntroPhrase(game: Game): string {
  const round = activeRound(game)
  if (round === null) return ''
  const multiplier = multiplierFor(round.index)
  const header = `Manche ${round.index + 1} sur ${game.config.roundCount}, gains ×${multiplier}.`
  const category = `Catégorie : ${round.puzzle.category}.`
  return `${header} ${category} ${announcePuzzle(round)} ${announceTurn(game)}`
}

function gameOverPhrase(game: Game): string {
  if (game.progress.kind !== 'game-over') return ''
  const winnerPlayers = game.progress.winners
    .map((id) => game.players.find((player) => player.id === id))
    .filter((player): player is Player => player !== undefined)
  const first = winnerPlayers[0]
  if (first === undefined) return 'Partie terminée.'
  const amount = formatEuros(first.total)
  if (winnerPlayers.length === 1) {
    const verb = first.kind.type === 'human' ? 'gagnez' : 'gagne'
    return `Partie terminée. ${subjectName(first)} ${verb} avec ${amount}.`
  }
  return `Partie terminée. Égalité entre ${joinFr(winnerPlayers.map(subjectName))} avec ${amount}.`
}

/**
 * `round/next` fusionne, en une seule action, la fin de la manche précédente
 * (résolue ou bloquée) et le départ de la suivante (ou la fin de partie). Le
 * dernier élément de l'historique porte donc l'issue qui vient de se conclure.
 *
 * Priorité assumée : si cette même action met aussi fin à la partie, la
 * phrase de fin de partie remplace celle de manche annulée — l'énoncé ne
 * donne pas d'exemple combiné, gagner/perdre la partie est l'information la
 * plus utile dans ce cas rarissime (dernière manche bloquée).
 */
function roundNextAnnouncement(nextGame: Game): string {
  if (nextGame.progress.kind === 'game-over') return gameOverPhrase(nextGame)
  const last = nextGame.history[nextGame.history.length - 1]
  if (last !== undefined && last.outcome.kind === 'void') {
    return `Manche annulée, plus aucune lettre jouable. Réponse : ${last.puzzle.answer}.`
  }
  return roundIntroPhrase(nextGame)
}

function settledAnnouncement(prevGame: Game, nextGame: Game): string {
  const prevRound = activeRound(prevGame)
  if (prevRound === null || prevRound.phase.kind !== 'spinning') return ''
  const segment = prevRound.phase.segment
  const spinner = currentPlayerOf(prevGame)
  switch (segment.kind) {
    case 'cash':
      // Segment à 0 : ni Banqueroute ni Passe, la main reste au joueur qui doit
      // quand même proposer une consonne — sans cette phrase, il croirait sa
      // main soufflée comme sur les deux autres segments spéciaux.
      if (segment.value === 0) {
        return "La roue s'arrête sur 0 euro : la lettre compte, mais ne rapporte rien."
      }
      return `La roue s'arrête sur ${formatEuros(segment.value)}.`
    case 'bankrupt': {
      const phrase =
        spinner.kind.type === 'human'
          ? 'Banqueroute. Vous perdez votre cagnotte.'
          : `Banqueroute. ${spinner.name} perd sa cagnotte.`
      return withTurnAnnounce(phrase, prevGame, nextGame)
    }
    case 'pass': {
      const phrase =
        spinner.kind.type === 'human'
          ? 'Passe. Vous passez la main.'
          : `Passe. ${spinner.name} passe la main.`
      return withTurnAnnounce(phrase, prevGame, nextGame)
    }
  }
}

function consonantAnnouncement(
  prevGame: Game,
  nextGame: Game,
  letter: Consonant,
  by: PlayerId,
): string {
  if (nextGame.progress.kind === 'round-over') return roundOverPhrase(nextGame)
  const prevRound = activeRound(prevGame)
  if (prevRound === null || prevRound.phase.kind !== 'awaiting-consonant') return ''

  // Sans ce préfixe, un joueur humain entendrait le gain d'un bot comme si c'était le sien.
  const author = nextGame.players.find((candidate) => candidate.id === by)
  const label = botLabel(author)

  const hits = countOccurrences(prevRound.puzzle.answer, letter)
  if (hits === 0) return withTurnAnnounce(`${label}Pas de ${letter}.`, prevGame, nextGame)

  const times = hits === 1 ? 'une fois' : `${hits} fois`
  return `${label}${letter}, ${times}. Cagnotte : ${formatEuros(author?.pot ?? 0)}.`
}

function buyVowelAnnouncement(prevGame: Game, nextGame: Game, letter: Vowel, by: PlayerId): string {
  if (nextGame.progress.kind === 'round-over') return roundOverPhrase(nextGame)
  const prevRound = activeRound(prevGame)
  if (prevRound === null) return ''

  const author = nextGame.players.find((candidate) => candidate.id === by)
  const label = botLabel(author)

  const hits = countOccurrences(prevRound.puzzle.answer, letter)
  const cost = `Voyelle payée ${formatEuros(prevGame.config.vowelCost)}.`
  if (hits === 0) return withTurnAnnounce(`${label}Pas de ${letter}. ${cost}`, prevGame, nextGame)

  const times = hits === 1 ? 'une fois' : `${hits} fois`
  return `${label}${letter}, ${times}. ${cost} Cagnotte : ${formatEuros(author?.pot ?? 0)}.`
}

/**
 * `resolve/verdict` ne porte pas `by` : contrairement aux autres actions à
 * un seul auteur, l'auteur se retrouve via le joueur courant de `prevGame`,
 * inchangé depuis `resolve/start` puisque la phase « resolving » ne fait
 * tourner la main qu'au verdict lui-même.
 */
function verdictAnnouncement(prevGame: Game, nextGame: Game, correct: boolean): string {
  if (!correct) {
    const author = currentPlayerOf(prevGame)
    const phrase =
      author.kind.type === 'human'
        ? 'Mauvaise réponse.'
        : `Mauvaise réponse de ${author.name}.`
    return withTurnAnnounce(phrase, prevGame, nextGame)
  }
  // Un verdict correct termine toujours la manche (`finishRound`) : jamais de phrase à part.
  return roundOverPhrase(nextGame)
}

/**
 * Un bot ne consulte jamais le juge : `BOT_ATTEMPT` (voir `game/bot.ts`) est
 * un texte de remplacement interne, jamais une vraie réponse, et son verdict
 * est tiré par le driver sans appel réseau. « Envoyé au juge » serait donc
 * un mensonge pour un bot.
 */
function resolveStartAnnouncement(game: Game, by: PlayerId): string {
  const speaker = botSpeaker(game, by)
  return speaker === null ? 'Proposition envoyée au juge.' : `${speaker.name} propose une réponse.`
}

function passAnnouncement(prevGame: Game, nextGame: Game, by: PlayerId): string {
  const speaker = botSpeaker(nextGame, by)
  const name = speaker === null ? 'vous' : speaker.name
  return withTurnAnnounce(`Plus aucune action possible pour ${name}.`, prevGame, nextGame)
}

/**
 * Ce que le lecteur d'écran doit entendre, sans considération pour ce que
 * l'écran montre déjà. Corps historique de `announceTransition`, extrait tel
 * quel pour que la fonction exportée n'ait plus qu'un seul point de sortie —
 * seul endroit où le champ `visible` peut alors se décider.
 */
function heardAnnouncement(prev: GameState, next: GameState, action: GameAction): Announcement {
  if (next === prev) return { status: '', alert: '' }
  if (action.type === 'config/set-resolve-enabled') return { status: '', alert: '' }
  if (action.type === 'resolve/failed') {
    return { status: '', alert: announceJudgeFailure(action.reason) }
  }
  if (next.kind !== 'playing') return { status: '', alert: '' }
  const nextGame = next.game

  if (action.type === 'game/start') return { status: roundIntroPhrase(nextGame), alert: '' }
  if (prev.kind !== 'playing') return { status: '', alert: '' }
  const prevGame = prev.game

  switch (action.type) {
    case 'wheel/spin':
      return { status: 'La roue tourne…', alert: '' }
    case 'wheel/settled':
      return { status: settledAnnouncement(prevGame, nextGame), alert: '' }
    case 'letter/consonant':
      return { status: consonantAnnouncement(prevGame, nextGame, action.letter, action.by), alert: '' }
    case 'letter/buy-vowel':
      return { status: buyVowelAnnouncement(prevGame, nextGame, action.letter, action.by), alert: '' }
    case 'resolve/start':
      return { status: resolveStartAnnouncement(nextGame, action.by), alert: '' }
    case 'resolve/verdict':
      return { status: verdictAnnouncement(prevGame, nextGame, action.correct), alert: '' }
    case 'turn/pass':
      return { status: passAnnouncement(prevGame, nextGame, action.by), alert: '' }
    case 'round/next':
      return { status: roundNextAnnouncement(nextGame), alert: '' }
  }
}

/**
 * Vrai quand l'écran porte déjà l'information : la phrase part alors au lecteur
 * d'écran seul, et la ligne d'évènement se vide.
 *
 * C'est le seul endroit du module qui dépende de ce que l'interface affiche.
 * Si la mise en page change, c'est ici qu'il faut revenir : l'en-tête de
 * `routes/GameRoute.tsx` et `components/PuzzleBoard/` justifient le cas du
 * départ de manche, la carte « Manche terminée » de `routes/GameRoute.tsx`
 * celui de la fin de manche.
 */
function alreadyOnScreen(next: GameState, action: GameAction): boolean {
  if (next.kind !== 'playing') return false
  // Fin de manche : la carte « Manche terminée » porte déjà la même phrase,
  // quelle que soit l'action qui vient de la produire (dernière lettre,
  // voyelle achetée, verdict du juge).
  if (next.game.progress.kind === 'round-over') return true
  // Départ de partie : l'énigme toute fraîche est épelée dans `status`, l'œil
  // la lit déjà déroulée en blancs sur le plateau.
  if (action.type === 'game/start') return true
  if (action.type !== 'round/next' || next.game.progress.kind !== 'round') return false
  // `round/next` peut aussi enchaîner sur une nouvelle manche après un blocage
  // (plus aucune lettre jouable) : dans ce cas précis, la phrase ne parle pas
  // de la nouvelle énigme mais de la réponse de la manche annulée — une
  // information qui n'apparaît nulle part ailleurs à l'écran, donc à garder
  // visible.
  const last = next.game.history[next.game.history.length - 1]
  return last !== undefined && last.outcome.kind !== 'void'
}

/**
 * Diff de deux états, dépendant de l'action : `resolve/failed` (échec
 * technique, la main ne bouge pas) et un verdict négatif en solo produisent
 * des couples `(prev, next)` identiques mais des annonces opposées, d'où le
 * troisième paramètre obligatoire.
 *
 * Seul endroit où se décide le partage entre les deux publics : la phrase
 * entendue est calculée d'abord, sans rien savoir de l'écran, puis `visible`
 * la retire de l'affichage quand l'interface la porte déjà autrement.
 */
export function announceTransition(prev: GameState, next: GameState, action: GameAction): Announcement {
  const heard = heardAnnouncement(prev, next, action)
  // Une action que le reducer a ignorée ne change rien, pas même la ligne
  // d'évènement : sans cette garde, `visible: ''` viendrait l'effacer.
  if (next === prev) return heard
  return alreadyOnScreen(next, action) ? { ...heard, visible: '' } : heard
}
