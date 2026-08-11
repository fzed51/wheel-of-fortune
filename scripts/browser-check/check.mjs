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
 * Clé factice, écrite juste avant le contrôle de l'export pour vérifier qu'elle
 * n'y apparaît pas, puis effacée juste après (voir plus bas). Elle n'ouvre plus
 * aucune fonctionnalité de jeu — « Résoudre » se passe de clé depuis que le
 * verdict est rendu localement — mais sa seule présence en stockage met
 * `config.bonusEnabled` à vrai pour toute partie démarrée ensuite, d'où l'effacement.
 */
const CLE_FACTICE = 'controle-navigateur-aucune-requete'

/** Nom de clé recopié de `STORAGE_KEYS.mistral` (`src/storage/keys.ts`) : ce script est du JS brut, sans accès au module TypeScript source. */
const CLE_STOCKAGE_MISTRAL = 'wof:mistral-key:1'

/** Nom de clé recopié de `STORAGE_KEYS.settings` (`src/storage/keys.ts`), même raison que ci-dessus. */
const CLE_STOCKAGE_REGLAGES = 'wof:settings:1'

/**
 * Version recopiée de `SCHEMA_VERSION` (`src/storage/keys.ts`) : l'enveloppe de
 * réglages écrite par le contrôle ci-dessous doit être **acceptée** par
 * l'application, pas seulement bien formée. Si ce nombre décroche de
 * `SCHEMA_VERSION` — ce qui s'est déjà produit deux fois —, `decodeRecord`
 * (`src/storage/codec.ts`) rejette l'enveloppe entière et l'application retombe
 * sur `DEFAULT_SETTINGS` : le contrôle échouerait alors en accusant un bug de
 * thème là où la seule cause est ce nombre resté en retard.
 */
const SCHEMA_VERSION_RECOPIEE = 3

const CONSONNES = ['S', 'R', 'T', 'N', 'L', 'M', 'D', 'P', 'C', 'V', 'B', 'F', 'G']

/*
 * Une charge d'environ 400 ms suffit à sortir du geste « armer » avec une
 * force exploitable — aucun contrôle ci-dessous ne dépend de sa valeur
 * exacte, seulement du fait qu'un lancer a bien eu lieu. Sous
 * `prefers-reduced-motion`, le balayage de la jauge est ralenti ×2,5 (voir
 * `useForceGauge`) : la charge est allongée d'autant pour rester cohérente,
 * même si rien n'impose cette proportion pour la validité du contrôle.
 */
const CHARGE_JAUGE_MS = 450
const CHARGE_JAUGE_RALENTIE_MS = Math.round(CHARGE_JAUGE_MS * 2.5)

/**
 * N'isole que les animations dont la cible est le rotor de la roue : sans ce
 * filtre, `document.getAnimations()` compte aussi le balayage de la jauge de
 * puissance pendant sa charge, et un contrôle qui voudrait vérifier que la
 * roue seule s'anime (ou ne s'anime pas, sous mouvement réduit) passerait
 * pour de mauvaises raisons.
 */
const FILTRE_ANIMATIONS_ROTOR = `
  const cibleRotor = (a) => a.effect && a.effect.target && a.effect.target.classList.contains('wheel-rotor')
  const animationsRotor = document.getAnimations().filter(cibleRotor).length
  const animationsHorsRotor = document.getAnimations().filter((a) => !cibleRotor(a)).length
`

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

/**
 * Tourne jusqu'à obtenir une phase « consonne attendue », ou rend la main.
 *
 * Geste en deux temps (armer, puis figer et lancer) : en mode jauge — le
 * défaut de la configuration servie ici — un seul clic ne ferait que monter
 * la charge, la roue ne tournerait jamais et la boucle attendrait pour rien.
 */
async function tournerJusquAConsonne(client, essais = 6) {
  for (let essai = 0; essai < essais; essai += 1) {
    const vu = await evaluate(client, 'return window.__h.jeu()')
    if (/roue s'arrête sur/.test(vu.evenement ?? '') && vu.jouables.length > 0) return vu
    if (vu.lancer.gele !== 'false') return null
    await evaluate(client, 'return window.__h.clickLancer()')
    await sleep(CHARGE_JAUGE_MS)
    await evaluate(client, 'return window.__h.clickLancer()')
    await sleep(4300)
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
        `localStorage.setItem('${CLE_STOCKAGE_REGLAGES}', JSON.stringify({
           version: ${SCHEMA_VERSION_RECOPIEE},
           value: {
             roundCount: 3,
             opponents: 1,
             botLevel: 'normal',
             theme: '${theme}',
             throwMode: 'gauge',
             mistralModel: 'mistral-small-latest',
           },
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
      // `avantRendu === null` signale un `base` mal résolu (theme-init.js jamais
      // chargé), c'est-à-dire un flash de thème clair garanti. Un `avantRendu`
      // renseigné mais différent du thème qu'on vient d'écrire ne peut avoir
      // qu'une cause : `SCHEMA_VERSION_RECOPIEE`, ci-dessus, a décroché de
      // `SCHEMA_VERSION` et l'application rejette l'enveloppe qu'on vient de poser.
      exiger(
        vu.avantRendu === theme,
        `thème ${theme} non appliqué avant le rendu (SCHEMA_VERSION_RECOPIEE a-t-il décroché de SCHEMA_VERSION ?)`,
        vu,
      )
      exiger(
        vu.apresRendu === theme,
        `thème ${theme} non appliqué après le rendu (SCHEMA_VERSION_RECOPIEE a-t-il décroché de SCHEMA_VERSION ?)`,
        vu,
      )
    }

    /*
     * Cas révélé le 2026-08-10 : un enregistrement de version périmée doit être
     * ignoré par `theme-init.js`, exactement comme `decodeRecord` le fait pour
     * l'application (`src/storage/codec.ts`) — sinon le fond s'affiche selon le
     * thème stocké avant de basculer au montage de React, exactement le flash
     * que ce fichier existe pour supprimer.
     *
     * Version 0, et non une valeur proche de la version courante : `SCHEMA_VERSION`
     * n'a fait que monter depuis sa création (2 → 3, voir `src/storage/keys.ts`) et
     * aucune version valide n'a jamais été inférieure à 1 — 0 reste donc périmée
     * quel que soit le prochain bump.
     *
     * Le thème stocké est choisi à l'opposé du thème système du Chrome de
     * contrôle : si `theme-init.js` appliquait malgré tout cet enregistrement
     * périmé, `avantRendu` porterait ce thème stocké et s'écarterait du thème
     * réellement rendu par l'application (celui du système, l'enveloppe étant
     * rejetée) — l'égalité testée plus bas ne peut alors pas passer par accident,
     * y compris sur un poste dont le système est déjà en sombre.
     */
    const systemeSombre = await evaluate(
      client,
      `return window.matchMedia('(prefers-color-scheme: dark)').matches`,
    )
    const themeStockeAbusif = systemeSombre ? 'light' : 'dark'
    await evaluate(
      client,
      `localStorage.setItem('${CLE_STOCKAGE_REGLAGES}', JSON.stringify({
         version: 0,
         value: {
           roundCount: 3,
           opponents: 1,
           botLevel: 'normal',
           theme: '${themeStockeAbusif}',
           throwMode: 'gauge',
           mistralModel: 'mistral-small-latest',
         },
       }))
       return true`,
    )
    await goto(client, APP)
    const perime = await evaluate(
      client,
      `return {
         avantRendu: window.__themeAvantRendu,
         apresRendu: document.documentElement.getAttribute('data-theme'),
       }`,
    )
    exiger(
      perime.avantRendu === perime.apresRendu,
      'un enregistrement de réglages de version périmée est quand même appliqué avant le rendu : `theme-init.js` ne vérifie plus la version de l’enveloppe (ou l’a de nouveau perdue)',
      perime,
    )
    return { ...releve, versionPerimee: perime }
  })

  await controle('roue : animation réelle et angle conservé', async () => {
    await demarrerPartie(client)
    // Geste en deux temps : le premier clic n'arme que la jauge (mode par
    // défaut), le second fige la force et lance la rotation réelle.
    await evaluate(client, 'return window.__h.clickLancer()')
    await sleep(CHARGE_JAUGE_MS)
    await evaluate(client, 'return window.__h.clickLancer()')
    await sleep(500)
    const pendant = await evaluate(
      client,
      `${FILTRE_ANIMATIONS_ROTOR}
       return { animationsRotor, lancer: window.__h.jeu().lancer }`,
    )
    // Ne compter que les animations dont la cible est le rotor : un compte
    // global inclurait aussi le balayage de la jauge, et ce contrôle passerait
    // même si la roue elle-même ne bougeait jamais.
    exiger(pendant.animationsRotor > 0, 'la roue ne s’anime pas', pendant)
    exiger(pendant.lancer.gele === 'true', 'commandes non gelées pendant la rotation', pendant)

    await sleep(4200)
    const apres = await evaluate(
      client,
      `const rotor = document.querySelector('.wheel-rotor')
       ${FILTRE_ANIMATIONS_ROTOR}
       return {
         transformInline: rotor ? rotor.style.transform : null,
         animationsRotor,
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

  await controle('jauge de puissance : armée puis relâchée', async () => {
    await demarrerPartie(client)
    const repos = await evaluate(client, 'return window.__h.jeu().lancer')
    exiger(repos.nom === 'Lancer', 'le bouton de lancer ne s’appelle pas « Lancer » au repos', repos)

    await evaluate(client, 'return window.__h.clickLancer()')
    await sleep(300)
    const charge = await evaluate(
      client,
      `${FILTRE_ANIMATIONS_ROTOR}
       return { lancer: window.__h.jeu().lancer, animationsHorsRotor }`,
    )
    exiger(charge.lancer.nom === 'Stop', 'le bouton ne devient pas « Stop » pendant la charge', charge)
    // Le lancer n'a pu démarrer que sur une action légale : l'arrêter doit
    // toujours être possible, la charge ne gèle donc jamais ce bouton.
    exiger(charge.lancer.gele === 'false', 'le bouton « Stop » est gelé pendant sa propre charge', charge)
    // C'est le seul instant de ce contrôle où l'on *veut* voir une animation
    // hors rotor : c'est la jauge, rien d'autre ne peut l'expliquer ici.
    exiger(charge.animationsHorsRotor > 0, 'aucune animation de jauge pendant la charge', charge)

    await evaluate(client, 'return window.__h.clickLancer()')
    await sleep(500)
    const rotation = await evaluate(
      client,
      `${FILTRE_ANIMATIONS_ROTOR}
       return { animationsRotor, animationsHorsRotor }`,
    )
    exiger(rotation.animationsRotor > 0, 'la roue ne tourne pas après le second clic', rotation)
    exiger(rotation.animationsHorsRotor === 0, 'la jauge est encore présente pendant la rotation', rotation)

    await sleep(4200)
    const evenement = await evaluate(client, 'return window.__h.jeu().evenement')
    exiger(evenement !== null, 'aucune annonce après une rotation lancée à la jauge', evenement)
    return { repos, charge, rotation, evenement }
  })

  await controle('lancer simple : un seul clic suffit, sans jauge', async () => {
    await goto(client, `${APP}reglages`)
    const coche = await evaluate(
      client,
      `return window.__h.setChecked('Lancer simple (sans jauge de puissance)', true)`,
    )
    exiger(coche === true, 'la case « lancer simple » ne se coche pas')

    await demarrerPartie(client)
    const repos = await evaluate(client, 'return window.__h.jeu().lancer')
    exiger(repos.nom === 'Tourner', 'le bouton ne s’appelle pas « Tourner » en mode lancer simple', repos)

    await evaluate(client, 'return window.__h.clickLancer()')
    await sleep(500)
    const pendant = await evaluate(
      client,
      `${FILTRE_ANIMATIONS_ROTOR}
       return { animationsRotor, animationsHorsRotor }`,
    )
    exiger(pendant.animationsRotor > 0, 'un seul clic ne fait pas tourner la roue en mode lancer simple', pendant)
    exiger(pendant.animationsHorsRotor === 0, 'une jauge est apparue en mode lancer simple', pendant)

    await sleep(4200)
    const apres = await evaluate(
      client,
      `${FILTRE_ANIMATIONS_ROTOR}
       return { evenement: window.__h.jeu().evenement, animationsHorsRotor }`,
    )
    exiger(apres.evenement !== null, 'aucune annonce après le lancer simple', apres)
    exiger(apres.animationsHorsRotor === 0, 'une jauge est apparue après coup en mode lancer simple', apres)
    return { repos, pendant, apres }
  })

  /*
   * Remise à « gauge » hors du `controle()` ci-dessus, sur le même principe
   * que l'effacement de la clé factice après l'export un peu plus bas : le
   * réglage est persisté en localStorage, et un échec en cours de contrôle ne
   * doit pas laisser tous les contrôles suivants (jauge ralentie, clavier
   * physique, hors ligne…) tourner dans un mode qu'ils n'attendent pas.
   *
   * Le rechargement qui suit n'est pas une précaution : `SettingsProvider` lit
   * les réglages **une seule fois au montage** (`useState(() => loadSettings())`).
   * Réécrire localStorage laisse donc l'application en cours toujours en mode
   * simple, et les contrôles suivants cliqueraient un bouton « Tourner » en
   * croyant jouer la jauge — certains passeraient même, pour la mauvaise raison.
   */
  await evaluate(
    client,
    `const brut = localStorage.getItem('${CLE_STOCKAGE_REGLAGES}')
     if (brut === null) return false
     const enveloppe = JSON.parse(brut)
     enveloppe.value.throwMode = 'gauge'
     localStorage.setItem('${CLE_STOCKAGE_REGLAGES}', JSON.stringify(enveloppe))
     return true`,
  )
  await reload(client)

  await controle('prefers-reduced-motion : pas d’animation, tour identique', async () => {
    await setReducedMotion(client, true)
    await demarrerPartie(client)
    await evaluate(client, 'return window.__h.clickLancer()')
    // Balayage ralenti ×2,5 sous mouvement réduit : charge allongée d'autant.
    await sleep(CHARGE_JAUGE_RALENTIE_MS)
    await evaluate(client, 'return window.__h.clickLancer()')
    await sleep(200)
    const animations = await evaluate(
      client,
      `${FILTRE_ANIMATIONS_ROTOR}
       return animationsRotor`,
    )

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
    await demarrerPartie(client)

    await evaluate(client, 'document.activeElement.blur(); return true')
    // Deux `Espace`, comme deux clics : en mode jauge, le premier n'arme que
    // la charge. La touche déclenche exactement la même action que le
    // bouton, il faut donc le même geste en deux temps pour lancer la roue.
    await pressKey(client, ' ')
    await sleep(CHARGE_JAUGE_MS)
    await pressKey(client, ' ')
    await sleep(600)
    const pendant = await evaluate(client, 'return window.__h.jeu()')
    exiger(pendant.lancer.gele === 'true', 'Espace ne fait pas tourner la roue', pendant.lancer)
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
    await evaluate(client, `localStorage.setItem('${CLE_STOCKAGE_MISTRAL}', '${CLE_FACTICE}'); return true`)
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

  /*
   * Effacement hors du `controle()` ci-dessus, pour qu'il ait lieu même si ce
   * contrôle échoue : la clé a fini de servir dès que le fichier exporté a été
   * lu, et la laisser en stockage ne serait pas un oubli inoffensif. Les
   * contrôles suivants qui rechargent la page (« service worker », « hors
   * ligne ») remonteraient alors `SettingsProvider`, qui relit le stockage au
   * montage : `hasMistralKey` — donc `config.bonusEnabled` — passerait à vrai
   * pour toute partie démarrée après. Le jour où un contrôle jouerait une
   * partie jusqu'à la manche finale, l'étape bonus tenterait un vrai appel
   * réseau vers Mistral avec cette clé invalide — exactement ce qu'un script
   * de recette ne doit jamais faire par inadvertance.
   */
  await evaluate(client, `localStorage.removeItem('${CLE_STOCKAGE_MISTRAL}'); return true`)

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
         lancer: window.__h.jeu().lancer,
       }`,
    )
    await setOffline(client, false)
    exiger(horsLigne.entete === 'La Roue de la Fortune', 'l’application ne se charge pas hors ligne', horsLigne)
    exiger(horsLigne.lancer.nom !== null, 'l’écran de jeu n’est pas rendu hors ligne', horsLigne)
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
