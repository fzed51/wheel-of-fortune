/*
 * Contrôle au navigateur, sur le **build de production**.
 *
 * Ne vérifie que ce qu'un test Vitest ne peut pas atteindre : la CSP réelle, le
 * service worker, le hors-ligne, le manifest, l'animation de la roue par la Web
 * Animations API, l'arbre d'accessibilité de Chrome, le `<dialog>` natif et
 * l'écouteur clavier posé sur `document`. Tout le reste — règles du jeu,
 * validation de l'éditeur, navigation, bornes des réglages — est déjà couvert en
 * jsdom, plus vite et plus solidement : le rejouer ici ne coûterait que du temps.
 *
 * Usage : `yarn build && yarn check:browser`. Voir le README du dossier.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  clickElement,
  evaluate,
  goto,
  launchChrome,
  pressKey,
  reload,
  setOffline,
  setReducedMotion,
  sleep,
  watch,
} from './cdp.mjs'
import { PAGE_HELPERS } from './page.mjs'

/** Doit rester le `BASE` de `vite.config.ts` : c'est aussi ce que le contrôle vérifie. */
const BASE_PATH = '/wheel-of-fortune/'
/*
 * Port dédié, différent de celui de `yarn preview` (4173) : un serveur d'aperçu
 * laissé ouvert dans un autre terminal servirait un `dist/` d'avant le dernier
 * build, et le contrôle validerait sans le dire une version qui n'existe plus.
 */
const ORIGIN = process.env.WOF_URL ?? 'http://localhost:4174'
const APP = `${ORIGIN}${BASE_PATH}`
const RACINE = resolve(import.meta.dirname, '..', '..')

/**
 * Clé factice, écrite pour rendre « Résoudre » disponible et pouvoir ouvrir le
 * `<dialog>`. Aucun contrôle ne soumet de réponse : rien ne part vers Mistral,
 * et le profil Chrome est jeté à la fin.
 */
const CLE_FACTICE = 'controle-navigateur-aucune-requete'

const CONSONNES = ['S', 'R', 'T', 'N', 'L', 'M', 'D', 'P', 'C', 'V', 'B', 'F', 'G']

const resultats = []

async function controle(nom, fn) {
  try {
    const detail = await fn()
    resultats.push({ nom, ok: true, detail })
    console.log(`  ok      ${nom}${detail === undefined ? '' : ` — ${resume(detail)}`}`)
  } catch (error) {
    resultats.push({ nom, ok: false, detail: String(error.message ?? error) })
    console.log(`  ÉCHEC   ${nom} — ${error.message ?? error}`)
  }
}

function resume(valeur) {
  const texte = typeof valeur === 'string' ? valeur : JSON.stringify(valeur)
  return texte.length > 160 ? `${texte.slice(0, 157)}…` : texte
}

function exiger(condition, message, vu) {
  if (!condition) throw new Error(`${message}${vu === undefined ? '' : ` — vu : ${resume(vu)}`}`)
  return vu ?? true
}

/** Le document servi, ou `null` si rien ne répond encore. */
async function documentServi() {
  try {
    const response = await fetch(APP, { redirect: 'manual' })
    return response.status < 400 ? await response.text() : null
  } catch {
    return null
  }
}

/**
 * Démarre `vite preview` sur un port dédié, dans son propre groupe de processus.
 *
 * `detached: true` puis `process.kill(-pid)` : `yarn preview` n'est qu'une
 * enveloppe autour de Vite, et tuer l'enveloppe laisserait le serveur orphelin
 * derrière lui — il garderait le port et l'exécution suivante contrôlerait un
 * build périmé sans un mot. Vite est donc appelé directement, et le groupe entier
 * est terminé à la fin.
 *
 * Le build n'est **pas** lancé ici : il dure, et l'avoir oublié doit se voir tout
 * de suite plutôt que d'allonger le contrôle en silence.
 */
async function demarrerServeur() {
  const index = join(RACINE, 'dist', 'index.html')
  if (!existsSync(index)) {
    console.error('Aucun build dans `dist/`. Lancez `yarn build` avant ce contrôle.')
    process.exit(1)
  }
  if ((await documentServi()) !== null) {
    console.error(`Quelque chose écoute déjà sur ${ORIGIN} : arrêtez-le, ce contrôle sert lui-même le build.`)
    process.exit(1)
  }

  const port = new URL(ORIGIN).port
  const serveur = spawn(
    join(RACINE, 'node_modules', '.bin', 'vite'),
    ['preview', '--port', port, '--strictPort'],
    { cwd: RACINE, stdio: 'ignore', detached: true },
  )

  for (let attente = 0; attente < 50; attente += 1) {
    await sleep(200)
    const servi = await documentServi()
    if (servi === null) continue
    /*
     * Le document servi doit être **exactement** celui du dernier build. Sans
     * cette comparaison, un serveur d'un autre build validerait des contrôles
     * qui ne portent sur rien — le pire résultat possible pour une porte de
     * déploiement.
     */
    if (servi !== readFileSync(index, 'utf8')) {
      arreterServeur(serveur)
      console.error(`Le serveur sur ${ORIGIN} ne sert pas le contenu de \`dist/index.html\`.`)
      process.exit(1)
    }
    return serveur
  }

  arreterServeur(serveur)
  console.error(`Le serveur d'aperçu n'a pas démarré sur ${ORIGIN}.`)
  process.exit(1)
}

function arreterServeur(serveur) {
  if (serveur === null) return
  try {
    process.kill(-serveur.pid, 'SIGTERM')
  } catch {
    serveur.kill('SIGTERM')
  }
}

/** Lance une partie neuve depuis l'accueil et retourne sur l'écran de jeu. */
async function demarrerPartie(client, { manches = 3, adversaires = 0 } = {}) {
  await goto(client, APP)
  await evaluate(
    client,
    `window.__h.setValue('Nombre de manches', ${manches})
     window.__h.setValue('Adversaires', ${adversaires})
     return window.__h.click(window.__h.byName('Repartir de zéro') ? 'Repartir de zéro' : 'Jouer')`,
  )
  await sleep(600)
}

/** Tourne jusqu'à obtenir une phase « consonne attendue », ou rend la main. */
async function tournerJusquAConsonne(client, essais = 6) {
  for (let essai = 0; essai < essais; essai += 1) {
    const vu = await evaluate(client, 'return window.__h.jeu()')
    if (/roue s'arrête sur/.test(vu.evenement ?? '') && vu.jouables.length > 0) return vu
    if (vu.controls['Tourner'] !== 'false') return null
    await evaluate(client, `return window.__h.click('Tourner')`)
    await sleep(4600)
  }
  return null
}

async function main() {
  const serveur = await demarrerServeur()
  const telechargements = mkdtempSync(join(tmpdir(), 'wof-telechargements-'))
  const client = await launchChrome({ headless: process.env.WOF_HEADED !== '1', downloadPath: telechargements })
  const journal = await watch(client)

  await client.send('Page.enable')
  await client.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_HELPERS })

  console.log(`\nContrôle au navigateur — ${APP}\n`)

  await goto(client, APP)

  await controle('chargement sans erreur', async () => {
    const titre = await evaluate(client, `return window.__h.txt(document.querySelector('header a'))`)
    exiger(titre === 'La Roue de la Fortune', 'en-tête inattendu', titre)
    exiger(journal.reseau.length === 0, 'requêtes en échec au chargement', journal.reseau)
    const erreurs = journal.console.filter((e) => e.niveau === 'error')
    exiger(erreurs.length === 0, 'erreurs de console au chargement', erreurs)
    return titre
  })

  await controle('CSP injectée et complète', async () => {
    const politique = await evaluate(
      client,
      `const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]')
       return meta ? meta.getAttribute('content') : null`,
    )
    exiger(politique !== null, 'aucune balise CSP dans le build')
    for (const directive of [
      "script-src 'self'",
      "default-src 'self'",
      "style-src-attr 'unsafe-inline'",
      'connect-src ',
    ]) {
      exiger(politique.includes(directive), `directive absente : ${directive}`, politique)
    }
    exiger(politique.includes('api.mistral.ai'), 'connect-src n’autorise pas l’API du juge', politique)
    return politique
  })

  await controle('thème posé avant le premier rendu', async () => {
    const releve = {}
    for (const theme of ['dark', 'light']) {
      await evaluate(
        client,
        `localStorage.setItem('wof:settings:1', JSON.stringify({
           version: 1,
           value: { roundCount: 3, opponents: 1, botLevel: 'normal', theme: '${theme}', mistralModel: 'mistral-small-latest' },
         }))
         return true`,
      )
      await goto(client, APP)
      releve[theme] = await evaluate(
        client,
        `return {
           avantRendu: window.__themeAvantRendu,
           apresRendu: document.documentElement.getAttribute('data-theme'),
         }`,
      )
    }
    for (const [theme, vu] of Object.entries(releve)) {
      // `avantRendu` est null quand `theme-init.js` n'a pas été chargé : c'est
      // exactement le symptôme d'un `base` mal résolu, et un flash de thème clair.
      exiger(vu.avantRendu === theme, `thème ${theme} non appliqué avant le rendu`, vu)
      exiger(vu.apresRendu === theme, `thème ${theme} non appliqué après le rendu`, vu)
    }
    return releve
  })

  await controle('roue : animation réelle et angle conservé', async () => {
    await demarrerPartie(client)
    await evaluate(client, `return window.__h.click('Tourner')`)
    await sleep(500)
    const pendant = await evaluate(
      client,
      `return {
         animations: document.getAnimations().length,
         controls: window.__h.jeu().controls,
       }`,
    )
    exiger(pendant.animations > 0, 'la roue ne s’anime pas', pendant)
    exiger(pendant.controls['Tourner'] === 'true', 'commandes non gelées pendant la rotation', pendant)

    await sleep(4200)
    const apres = await evaluate(
      client,
      `const rotor = document.querySelector('.wheel-rotor')
       return {
         transformInline: rotor ? rotor.style.transform : null,
         animations: document.getAnimations().length,
         evenement: window.__h.jeu().evenement,
       }`,
    )
    // `commitStyles()` écrit un attribut `style` : sans `style-src-attr
    // 'unsafe-inline'` dans la CSP, la roue reviendrait à zéro à la fin de
    // l'animation. C'est le canari de cette directive.
    exiger(
      apres.transformInline !== null && apres.transformInline !== '',
      'la roue ne garde pas son angle d’arrêt (style-src-attr bloqué ?)',
      apres,
    )
    exiger(apres.evenement !== null, 'aucune annonce après la rotation', apres)
    return apres
  })

  await controle('prefers-reduced-motion : pas d’animation, tour identique', async () => {
    await setReducedMotion(client, true)
    await demarrerPartie(client)
    await evaluate(client, `return window.__h.click('Tourner')`)
    await sleep(200)
    const animations = await evaluate(client, 'return document.getAnimations().length')

    let ecoule = null
    for (let attente = 0; attente < 20 && ecoule === null; attente += 1) {
      await sleep(100)
      const vu = await evaluate(client, 'return window.__h.jeu()')
      if (vu.evenement !== null) ecoule = (attente + 1) * 100
    }
    await setReducedMotion(client, false)
    exiger(animations === 0, 'la roue s’anime malgré prefers-reduced-motion', animations)
    exiger(ecoule !== null && ecoule < 1500, 'le tour n’aboutit pas sans animation', ecoule)
    return { animations, msJusquAuResultat: ecoule }
  })

  await controle('arbre d’accessibilité : aucun graphique sans nom', async () => {
    await client.send('Accessibility.enable')
    const { nodes } = await client.send('Accessibility.getFullAXTree')
    const graphiques = nodes
      .filter((node) => /graphic|image/i.test(node.role?.value ?? ''))
      .filter((node) => node.ignored !== true)
      .map((node) => ({ role: node.role?.value, nom: node.name?.value ?? '' }))
    const anonymes = graphiques.filter((node) => node.nom === '')
    exiger(anonymes.length === 0, 'graphique exposé sans nom accessible', anonymes)
    return graphiques
  })

  await controle('deux live regions, et deux seulement', async () => {
    const regions = await evaluate(
      client,
      `const polite = window.__h.all('[role="status"], [aria-live="polite"]')
       return {
         polite: polite.length,
         politeHorsMain: polite.filter((el) => el.closest('main') === null).length,
         alertes: window.__h.all('[role="alert"], [aria-live="assertive"]').length,
       }`,
    )
    exiger(regions.polite === 1 && regions.politeHorsMain === 1, 'région polite en double sur l’écran de jeu', regions)
    exiger(regions.alertes === 1, 'nombre de régions d’alerte inattendu', regions)
    return regions
  })

  await controle('clavier physique : Espace, lettre, Entrée', async () => {
    // La clé factice rend « Résoudre » disponible ; aucune réponse n'est soumise,
    // donc aucune requête ne part.
    await evaluate(client, `localStorage.setItem('wof:mistral-key:1', '${CLE_FACTICE}'); return true`)
    await demarrerPartie(client)

    await evaluate(client, 'document.activeElement.blur(); return true')
    await pressKey(client, ' ')
    await sleep(600)
    const pendant = await evaluate(client, 'return window.__h.jeu()')
    exiger(pendant.controls['Tourner'] === 'true', 'Espace ne fait pas tourner la roue', pendant.controls)
    await sleep(4200)

    const attente = await tournerJusquAConsonne(client)
    exiger(attente !== null, 'impossible d’atteindre la phase « consonne attendue »')
    const lettre = CONSONNES.find((candidate) => attente.jouables.includes(candidate))
    await pressKey(client, lettre.toLowerCase())
    await sleep(500)
    const apres = await evaluate(client, 'return window.__h.jeu()')
    exiger(!apres.jouables.includes(lettre), `la lettre ${lettre} tapée n’a pas été jouée`, apres.jouables)
    return { lettre, evenement: apres.evenement }
  })

  await controle('dialogue natif : Entrée, piège de focus, Échap', async () => {
    await evaluate(client, 'document.activeElement.blur(); return true')
    await pressKey(client, 'Enter')
    await sleep(400)
    const ouvert = await evaluate(
      client,
      `const dialogue = document.querySelector('dialog[open]')
       return {
         ouvert: dialogue !== null,
         titre: dialogue ? window.__h.txt(dialogue.querySelector('h2')) : null,
         focusDedans: document.activeElement.closest('dialog') !== null,
       }`,
    )
    exiger(ouvert.ouvert, 'Entrée n’ouvre pas la boîte « Résoudre »', ouvert)
    exiger(ouvert.titre === 'Proposer une réponse', 'titre de boîte inattendu', ouvert)
    exiger(ouvert.focusDedans, 'le focus n’entre pas dans la boîte', ouvert)

    /*
     * Piège de focus : huit tabulations ne doivent jamais atteindre une commande
     * de la page. `document.body` compte comme un arrêt légitime — Chrome
     * traverse la racine du document une fois par cycle dans une boîte modale,
     * ce qui n'est pas une fuite : le contenu sous la boîte reste inatteignable.
     */
    const arrets = []
    for (let tabulation = 0; tabulation < 8; tabulation += 1) {
      await pressKey(client, 'Tab')
      arrets.push(
        await evaluate(
          client,
          `const actif = document.activeElement
           return {
             nom: window.__h.txt(actif).slice(0, 24),
             dansLaBoite: actif.closest('dialog') !== null,
             racine: actif === document.body || actif === document.documentElement,
           }`,
        ),
      )
    }
    const fuites = arrets.filter((arret) => !arret.dansLaBoite && !arret.racine)
    exiger(fuites.length === 0, 'le focus atteint une commande hors de la boîte modale', fuites)

    await pressKey(client, 'Escape')
    await sleep(300)
    exiger(
      !(await evaluate(client, `return document.querySelector('dialog[open]') !== null`)),
      'Échap ne ferme pas la boîte',
    )

    /*
     * Retour du focus au déclencheur : vérifié sur une ouverture **au clic**.
     * Ouverte à la touche Entrée, la boîte rend le focus à ce qui l'avait —
     * `document.body` — ce qui est le comportement natif correct, mais ne dit
     * rien du retour au bouton. Et le clic doit être un vrai clic de souris :
     * `el.click()` n'aurait pas donné le focus au bouton (voir `clickElement`).
     */
    await clickElement(client, 'Résoudre')
    await sleep(400)
    await pressKey(client, 'Escape')
    await sleep(300)
    const ferme = await evaluate(
      client,
      `return {
         ouvert: document.querySelector('dialog[open]') !== null,
         focus: window.__h.txt(document.activeElement),
       }`,
    )
    exiger(!ferme.ouvert, 'Échap ne ferme pas la boîte ouverte au clic', ferme)
    exiger(ferme.focus === 'Résoudre', 'le focus ne revient pas sur le déclencheur', ferme)
    return { arrets: arrets.length, ...ferme }
  })

  await controle('export : téléchargement d’un blob sous CSP', async () => {
    await goto(client, `${APP}enigmes`)
    await evaluate(
      client,
      `window.__h.setValue('Énoncé', 'MON VOISIN REPEINT SA BARRIÈRE')
       return window.__h.click("Ajouter l'énigme")`,
    )
    await sleep(400)
    await evaluate(client, `return window.__h.click('Exporter mes énigmes')`)
    await sleep(1500)
    const fichiers = readdirSync(telechargements).filter((nom) => nom.endsWith('.json'))
    exiger(fichiers.length > 0, 'aucun fichier exporté', readdirSync(telechargements))
    const contenu = readFileSync(join(telechargements, fichiers[0]), 'utf8')
    // L'export ne doit jamais contenir autre chose que des énigmes : ni réglages,
    // ni partie en cours, et surtout pas la clé d'API.
    exiger(!contenu.includes(CLE_FACTICE), 'la clé d’API se retrouve dans l’export !', fichiers[0])
    exiger(!/mistral|settings|save/i.test(contenu), 'l’export contient autre chose que des énigmes', contenu.slice(0, 200))
    return { fichier: fichiers[0], entrees: JSON.parse(contenu).value.length }
  })

  await controle('manifest et icônes', async () => {
    const manifest = await evaluate(
      client,
      `const lien = document.querySelector('link[rel="manifest"]')
       if (!lien) return null
       const manifeste = await (await fetch(lien.href)).json()
       const icones = await Promise.all(
         (manifeste.icons ?? []).map(async (icone) => {
           const url = new URL(icone.src, lien.href).href
           return { src: icone.src, statut: (await fetch(url)).status }
         }),
       )
       return { id: manifeste.id, scope: manifeste.scope, start_url: manifeste.start_url, icones }`,
    )
    exiger(manifest !== null, 'aucun lien vers le manifest')
    for (const champ of ['id', 'scope', 'start_url']) {
      exiger(manifest[champ] === BASE_PATH, `manifest.${champ} ne vaut pas ${BASE_PATH}`, manifest)
    }
    exiger(manifest.icones.length > 0, 'aucune icône déclarée', manifest)
    const manquantes = manifest.icones.filter((icone) => icone.statut !== 200)
    exiger(manquantes.length === 0, 'icônes du manifest introuvables', manquantes)
    return { ...manifest, icones: manifest.icones.length }
  })

  await controle('service worker actif, et rien de Mistral en cache', async () => {
    await goto(client, APP)
    const worker = await evaluate(
      client,
      `const enregistrement = await Promise.race([
         navigator.serviceWorker.ready,
         new Promise((resolve) => setTimeout(() => resolve(null), 10000)),
       ])
       if (enregistrement === null) return { actif: false }
       const noms = await caches.keys()
       const urls = []
       for (const nom of noms) {
         const cache = await caches.open(nom)
         for (const requete of await cache.keys()) urls.push(requete.url)
       }
       return {
         actif: enregistrement.active !== null,
         controle: navigator.serviceWorker.controller !== null,
         caches: noms,
         entrees: urls.length,
         mistral: urls.filter((url) => url.includes('mistral')),
       }`,
    )
    exiger(worker.actif, 'aucun service worker actif après 10 s', worker)
    exiger(worker.entrees > 0, 'le precache est vide', worker)
    exiger(worker.mistral.length === 0, 'une réponse de Mistral est en cache !', worker.mistral)
    return { caches: worker.caches, entrees: worker.entrees }
  })

  await controle('hors ligne : l’application se recharge et reste jouable', async () => {
    await demarrerPartie(client)
    await setOffline(client, true)
    await reload(client)
    const horsLigne = await evaluate(
      client,
      `return {
         entete: window.__h.txt(document.querySelector('header a')),
         url: window.__h.url(),
         jouables: window.__h.lettresJouables().length,
         controls: window.__h.jeu().controls,
       }`,
    )
    await setOffline(client, false)
    exiger(horsLigne.entete === 'La Roue de la Fortune', 'l’application ne se charge pas hors ligne', horsLigne)
    exiger(horsLigne.controls['Tourner'] !== 'absent', 'l’écran de jeu n’est pas rendu hors ligne', horsLigne)
    return horsLigne
  })

  await controle('aucune violation de CSP sur tout le parcours', async () => {
    const violations = await evaluate(client, 'return window.__cspViolations')
    exiger(violations.length === 0, 'violations de CSP relevées', violations)
    return 'aucune'
  })

  // Bilan.
  const erreurs = journal.console.filter((entree) => entree.niveau === 'error')
  const echecs = resultats.filter((entree) => !entree.ok)

  console.log(`\nConsole : ${journal.console.length} messages, ${erreurs.length} erreurs.`)
  for (const entree of erreurs) console.log(`  [${entree.source}] ${entree.texte}`)
  if (journal.reseau.length > 0) {
    console.log(`Requêtes en échec : ${journal.reseau.length}`)
    for (const ligne of journal.reseau) console.log(`  ${ligne}`)
  }
  console.log(`\n${resultats.length - echecs.length}/${resultats.length} contrôles conformes.\n`)

  client.chrome.kill()
  arreterServeur(serveur)
  process.exit(echecs.length === 0 ? 0 : 1)
}

await main()
