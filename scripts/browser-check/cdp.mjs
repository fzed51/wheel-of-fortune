/*
 * Pilote Chrome minimal, par le Chrome DevTools Protocol, sans aucune dépendance :
 * Node 22+ fournit `fetch` et `WebSocket` en global, et Chrome expose déjà tout ce
 * qu'il faut sur son port de débogage.
 *
 * Pourquoi pas Playwright : ce contrôle tourne à la main avant un déploiement, une
 * fois de temps en temps. Un `node_modules` de plusieurs centaines de mégaoctets et
 * un binaire de navigateur à télécharger coûteraient plus cher que les 200 lignes
 * ci-dessous. Le jour où ce contrôle partirait en intégration continue, c'est
 * l'inverse qui serait vrai : il faudra alors basculer sur Playwright plutôt que
 * d'étoffer ce fichier.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** Chrome stable installé par défaut sur macOS ; surchargeable pour un autre poste. */
const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Lance Chrome sur un profil jetable. Le profil est neuf à chaque exécution :
 * un service worker ou un `localStorage` hérité du contrôle précédent fausserait
 * précisément les vérifications qui suivent.
 */
export async function launchChrome({ port = 9222, headless = true, downloadPath } = {}) {
  const profile = mkdtempSync(join(tmpdir(), 'wof-browser-check-'))
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    // Sans ça, Chrome ralentit les minuteurs d'un onglet qu'il croit caché, et
    // l'animation de la roue n'aboutit jamais en mode sans interface.
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--window-size=1280,1000',
    'about:blank',
  ]
  if (headless) args.unshift('--headless=new')

  const chrome = spawn(CHROME_PATH, args, { stdio: 'ignore' })

  let page = null
  for (let attempt = 0; attempt < 60 && page === null; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`)
      page = (await response.json()).find((target) => target.type === 'page') ?? null
    } catch {
      // Chrome n'écoute pas encore : on repasse.
    }
    if (page === null) await sleep(200)
  }
  if (page === null) {
    chrome.kill()
    throw new Error(`Chrome injoignable sur le port ${port} (binaire : ${CHROME_PATH})`)
  }

  const client = await connect(page.webSocketDebuggerUrl)
  client.chrome = chrome
  if (downloadPath !== undefined) {
    await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath })
  }
  return client
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url)
    const pending = new Map()
    const listeners = []
    let nextId = 1

    socket.addEventListener('error', reject)
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data)
      if (message.id === undefined) {
        for (const listener of listeners) listener(message)
        return
      }
      const entry = pending.get(message.id)
      if (entry === undefined) return
      pending.delete(message.id)
      if (message.error) entry.reject(new Error(`${message.error.message} (${entry.method})`))
      else entry.resolve(message.result)
    })
    socket.addEventListener('open', () => {
      resolve({
        send(method, params = {}) {
          const id = nextId++
          return new Promise((res, rej) => {
            pending.set(id, { resolve: res, reject: rej, method })
            socket.send(JSON.stringify({ id, method, params }))
          })
        },
        on(listener) {
          listeners.push(listener)
        },
        close() {
          socket.close()
        },
      })
    })
  })
}

/**
 * Journal des messages de console, des exceptions et des requêtes en échec.
 * Rempli en continu : les contrôles le lisent à la fin, quand ils savent ce
 * qu'ils cherchent.
 */
export async function watch(client) {
  /** @type {{ console: { source: string, niveau: string, texte: string }[], reseau: string[] }} */
  const journal = { console: [], reseau: [] }
  await client.send('Runtime.enable')
  await client.send('Log.enable')
  await client.send('Network.enable')

  client.on((message) => {
    if (message.method === 'Runtime.consoleAPICalled') {
      const texte = message.params.args
        .map((arg) => (arg.value !== undefined ? String(arg.value) : (arg.description ?? arg.type)))
        .join(' ')
      journal.console.push({ source: 'console', niveau: message.params.type, texte })
    }
    if (message.method === 'Log.entryAdded') {
      const { level, text, source } = message.params.entry
      journal.console.push({ source, niveau: level, texte: text })
    }
    if (message.method === 'Runtime.exceptionThrown') {
      const details = message.params.exceptionDetails
      journal.console.push({
        source: 'exception',
        niveau: 'error',
        texte: details.exception?.description ?? details.text,
      })
    }
    if (message.method === 'Network.responseReceived' && message.params.response.status >= 400) {
      journal.reseau.push(`${message.params.response.status} ${message.params.response.url}`)
    }
  })
  return journal
}

/** Navigation, puis attente de `load` — plafonnée, un `load` peut ne jamais venir. */
export async function goto(client, url, { timeout = 10_000 } = {}) {
  await client.send('Page.enable')
  const charge = new Promise((resolve) => {
    client.on((message) => {
      if (message.method === 'Page.loadEventFired') resolve()
    })
  })
  await client.send('Page.navigate', { url })
  await Promise.race([charge, sleep(timeout)])
  await sleep(400)
}

export async function reload(client, { ignoreCache = false } = {}) {
  await client.send('Page.reload', { ignoreCache })
  await sleep(1200)
}

/**
 * Évalue une expression dans la page et renvoie sa valeur JSON. Le corps est
 * enveloppé dans une fonction **asynchrone** : les contrôles écrivent des
 * `return`, et certains ont besoin d'`await` (`navigator.serviceWorker.ready`,
 * `caches.keys()`, `fetch`).
 */
export async function evaluate(client, body) {
  const result = await client.send('Runtime.evaluate', {
    expression: `(async () => { ${body} })()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  })
  if (result.exceptionDetails) {
    const details = result.exceptionDetails
    throw new Error(details.exception?.description ?? details.text)
  }
  return result.result.value
}

/**
 * Frappe clavier réelle, dispatchée par le navigateur : c'est le seul moyen de
 * vérifier l'écouteur `keydown` posé sur `document` par `usePhysicalKeyboard`,
 * qu'un `dispatchEvent` depuis la page ne prouverait pas.
 */
export async function pressKey(client, key) {
  const connues = {
    Enter: { windowsVirtualKeyCode: 13, code: 'Enter', text: '\r' },
    Escape: { windowsVirtualKeyCode: 27, code: 'Escape' },
    Tab: { windowsVirtualKeyCode: 9, code: 'Tab' },
    ' ': { windowsVirtualKeyCode: 32, code: 'Space', text: ' ' },
    ArrowRight: { windowsVirtualKeyCode: 39, code: 'ArrowRight' },
    ArrowLeft: { windowsVirtualKeyCode: 37, code: 'ArrowLeft' },
  }
  const base = connues[key] ?? {
    windowsVirtualKeyCode: key.toUpperCase().charCodeAt(0),
    code: `Key${key.toUpperCase()}`,
    text: key,
  }
  await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key, ...base })
  if (base.text !== undefined) {
    await client.send('Input.dispatchKeyEvent', { type: 'char', key, text: base.text })
  }
  await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key, ...base })
  await sleep(60)
}

/**
 * Clic de souris réel, dispatché par le navigateur, et non `el.click()`.
 *
 * La différence compte pour une seule chose, mais elle est décisive : un clic
 * réel donne le focus au bouton, un `click()` programmatique ne le déplace pas.
 * Or le retour du focus au déclencheur à la fermeture d'un `<dialog>` dépend
 * exactement de ça — testé au `click()`, il paraîtrait cassé alors qu'il marche.
 */
export async function clickElement(client, name) {
  const point = await evaluate(
    client,
    `const el = window.__h.byName(${JSON.stringify(name)})
     if (!el) throw new Error('Élément introuvable : ' + ${JSON.stringify(name)})
     el.scrollIntoView({ block: 'center' })
     const rect = el.getBoundingClientRect()
     return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }`,
  )
  const base = { x: Math.round(point.x), y: Math.round(point.y), button: 'left', clickCount: 1 }
  await client.send('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', button: 'none', clickCount: 0 })
  await client.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' })
  await client.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' })
  await sleep(80)
  return point
}

export async function setReducedMotion(client, reduce) {
  await client.send('Emulation.setEmulatedMedia', {
    features: reduce ? [{ name: 'prefers-reduced-motion', value: 'reduce' }] : [],
  })
}

export async function setOffline(client, offline) {
  await client.send('Network.emulateNetworkConditions', {
    offline,
    latency: 0,
    downloadThroughput: offline ? 0 : -1,
    uploadThroughput: offline ? 0 : -1,
  })
}
