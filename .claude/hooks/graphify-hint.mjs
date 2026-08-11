#!/usr/bin/env node
/**
 * Hook `PreToolUse` : rappelle qu'un graphe de code existe, au moment précis où
 * une exploration à l'aveugle démarre — un `grep` lancé depuis Bash, ou la
 * lecture d'un fichier source.
 *
 * Ce message est injecté dans le contexte à *chaque* appel d'outil concerné :
 * sa longueur est donc un coût, pas un détail. Il est volontairement court et
 * ne cite que les trois commandes dont le coût a été mesuré sur ce dépôt.
 * `graphify query` en est absent exprès : il fabrique ses nœuds de départ à
 * partir des mots de la question et rend six mille caractères sans rapport.
 *
 * Usage : node .claude/hooks/graphify-hint.mjs bash|read
 */
import { existsSync, readFileSync } from 'node:fs'

const GRAPH = 'graphify-out/graph.json'

/** Commandes de recherche que le graphe peut souvent remplacer. */
const SEARCH = /\b(grep|rg|ripgrep|find|fd|ack|ag)\b/

/** Extensions dont la lecture mérite le rappel. Les données brutes non. */
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs)$/

const HINT =
  'Un graphe de code existe (graphify-out/graph.json). Pour une question de structure, ' +
  'préférer `graphify explain "nom()"`, `graphify path "A" "B" --undirected` ou ' +
  '`graphify affected "nom()"` : ' +
  'quelques centaines de caractères au lieu de plusieurs milliers. ' +
  'Éviter `graphify query`, bruyant et souvent hors sujet. ' +
  'Lire le fichier reste la bonne réponse pour modifier ou déboguer des lignes précises.'

/** Rien à dire s'il n'y a pas de graphe : le hook doit rester silencieux. */
if (!existsSync(GRAPH)) process.exit(0)

const mode = process.argv[2]

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  // Charge utile illisible : un hook ne doit jamais bloquer l'appel d'outil.
  process.exit(0)
}

const input = payload.tool_input ?? payload

const concerned =
  mode === 'bash'
    ? SEARCH.test(String(input.command ?? ''))
    : [input.file_path, input.pattern, input.path]
        .filter(Boolean)
        .map(String)
        .some((value) => CODE.test(value) && !value.includes('graphify-out'))

if (!concerned) process.exit(0)

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext: HINT,
    },
  }),
)
