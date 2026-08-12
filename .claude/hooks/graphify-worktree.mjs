#!/usr/bin/env node
/**
 * Hook `CwdChanged` : construit le graphe de code d'un worktree au moment où la
 * session y entre.
 *
 * Pourquoi pas `WorktreeCreate`, dont le nom semblait pourtant fait pour ça :
 * cet événement n'est pas une notification, c'est un *fournisseur*. Le hook doit
 * créer le worktree lui-même et écrire son chemin sur stdout ; Claude Code lit
 * cette sortie comme un chemin et abandonne la création si elle n'en est pas un
 * (« WorktreeCreate hook failed: hook succeeded but returned no worktree path »).
 * Il existe pour brancher un VCS autre que git. Y mettre `graphify update`
 * casserait la création de worktree. `CwdChanged` reçoit `{old_cwd, new_cwd}` et
 * se déclenche exactement quand `EnterWorktree` bascule la session.
 *
 * Pourquoi c'est nécessaire : les hooks git de graphify sortent en `exit 0` dès
 * que `git rev-parse --git-dir` diffère de `--git-common-dir`, ce qui est la
 * définition d'un worktree lié. Sans ce hook, aucun graphe n'est jamais
 * construit dans un worktree, et `graphify explain` y répond
 * « error: graph file not found ».
 *
 * La reconstruction est détachée : elle prend quelques secondes et ne doit pas
 * retarder l'entrée dans le worktree. Son journal vit dans
 * `~/.cache/graphify-worktree.log`, à côté de celui des hooks git de graphify.
 */
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, openSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

/** Journal partagé par toutes les reconstructions déclenchées par ce hook. */
const LOG = join(homedir(), '.cache', 'graphify-worktree.log')

let payload
try {
  payload = JSON.parse(readFileSync(0, 'utf8'))
} catch {
  // Charge utile illisible : un hook ne doit jamais faire échouer l'événement.
  process.exit(0)
}

const cwd = payload?.new_cwd
if (typeof cwd !== 'string' || !existsSync(cwd)) process.exit(0)

/** Un dossier de sortie déjà là signifie que le graphe existe : rien à faire. */
if (existsSync(join(cwd, 'graphify-out', 'graph.json'))) process.exit(0)

const git = (...args) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()

let isLinkedWorktree
try {
  // Un worktree lié a son `--git-dir` dans `.git/worktrees/<nom>`, distinct du
  // `--git-common-dir` partagé. C'est le test exact qu'emploient les hooks git
  // de graphify pour se taire — on l'emploie ici pour parler. Les deux chemins
  // sont rendus absolus à la main : `--path-format` n'existe qu'à partir de
  // git 2.31, et `--git-dir` peut répondre un chemin relatif au cwd.
  isLinkedWorktree =
    resolve(cwd, git('rev-parse', '--git-dir')) !== resolve(cwd, git('rev-parse', '--git-common-dir'))
} catch {
  // Pas un dépôt git : rien à indexer.
  process.exit(0)
}

if (!isLinkedWorktree) process.exit(0)

let out
try {
  out = openSync(LOG, 'a')
} catch {
  process.exit(0)
}

try {
  spawn('graphify', ['update', '.'], {
    cwd,
    detached: true,
    stdio: ['ignore', out, out],
    // Le clustering de networkx itère des ensembles de chaînes dont l'ordre est
    // randomisé par PYTHONHASHSEED : le figer rend le graphe reproductible.
    // Même valeur que dans les hooks git posés par `graphify hook install`.
    env: { ...process.env, PYTHONHASHSEED: '0' },
  })
    .on('error', () => {})
    .unref()
} catch {
  // `graphify` absent du PATH : le hook reste silencieux.
}

process.stdout.write(
  JSON.stringify({
    systemMessage: `graphify : construction du graphe de code en cours dans ${cwd} (journal : ${LOG})`,
  }),
)
