import { copyFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Sous-chemin de déploiement GitHub Pages. Source unique : le `basename` du
 * routeur et le chemin de `theme-init.js` en dérivent via `BASE_URL`, et le
 * manifest le réutilise ci-dessous plutôt que de le réécrire — trois valeurs
 * divergentes rendraient l'application non installable sans le moindre message
 * d'erreur.
 */
const BASE = '/wheel-of-fortune/'

/**
 * Politique de sécurité du contenu, injectée en `<meta http-equiv>` faute de
 * pouvoir poser des en-têtes sur GitHub Pages. Sans backend, aucun nonce n'est
 * possible non plus : la politique repose donc entièrement sur le fait que tout
 * script du projet est un fichier servi depuis l'origine.
 *
 * Le scénario couvert est précis : une injection de script qui exfiltrerait la
 * clé d'API Mistral du stockage local. `connect-src` limite les destinations
 * possibles à l'origine et à l'API elle-même, et `script-src 'self'` interdit
 * l'inline — c'est pour ça que le bootstrap de thème vit dans
 * `public/theme-init.js` au lieu d'être écrit dans `index.html`.
 *
 * `style-src-attr 'unsafe-inline'` est obligatoire, pas une concession de
 * confort : React écrit des attributs `style`, et `commitStyles()` de l'API Web
 * Animations aussi — sans lui, la roue ne garde pas son angle d'arrêt.
 *
 * `frame-ancestors` et `report-to` sont volontairement absents : une balise
 * `<meta>` les ignore, les écrire donnerait l'illusion d'une protection.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "connect-src 'self' https://api.mistral.ai",
  'upgrade-insecure-requests',
].join('; ')

/**
 * `apply: 'build'` plutôt qu'un test sur `command` : en développement, le HMR a
 * besoin de `ws:` et de scripts inline, et une CSP stricte le casserait.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'wof:csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'pre',
      handler() {
        return [
          {
            tag: 'meta',
            // En tête de `<head>` : une CSP ne régit que ce qui la suit.
            injectTo: 'head-prepend',
            attrs: {
              'http-equiv': 'Content-Security-Policy',
              content: CONTENT_SECURITY_POLICY,
            },
          },
        ]
      },
    },
  }
}

/**
 * GitHub Pages ne réécrit pas les URLs vers `index.html` : rechargée avant
 * l'installation du service worker, une URL profonde comme `/jeu` renvoie 404.
 * Un `404.html` identique à `index.html` tient lieu de réécriture — le routeur
 * lit ensuite l'URL demandée et affiche le bon écran.
 *
 * Le fichier est exclu du precache par `globIgnores` : il ne sert que tant que
 * le service worker n'est pas installé, et le précacher stockerait deux fois le
 * même document sous deux révisions différentes.
 */
function githubPagesSpaFallback(): Plugin {
  let outDir = 'dist'
  return {
    name: 'wof:404-html',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir)
    },
    async closeBundle() {
      await copyFile(resolve(outDir, 'index.html'), resolve(outDir, '404.html'))
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: BASE,
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      /*
       * `'prompt'`, jamais `'autoUpdate'`. En mise à jour automatique, le plugin
       * injecte `clientsClaim` + `skipWaiting` et recharge la page tout seul :
       * `needRefresh` ne passerait jamais à `true`, `UpdatePrompt` serait du
       * code mort, et un rechargement silencieux en pleine rotation détruirait
       * la manche en cours. C'est l'utilisateur qui déclenche.
       */
      registerType: 'prompt',
      // Le module virtuel `virtual:pwa-register/react` devient alors le seul
      // chemin d'enregistrement : aucun script concurrent dans `index.html`.
      injectRegister: false,
      strategies: 'generateSW',
      // Le plugin lit `pwa-assets.config.ts` et en déduit lui-même les PNG, le
      // tableau `icons` du manifest et les `<link>` d'`index.html`.
      pwaAssets: {
        config: true,
        /*
         * `injectThemeColor` vaut `true` par défaut et ajoute une troisième
         * balise `theme-color`, sans `media`, en fin de `<head>`. Elle est
         * refusée : `index.html` en déclare déjà deux, portant chacune un
         * `media`, et `applyTheme` écrit dans toutes celles qu'il trouve. Une
         * balise de plus n'ajouterait aucun comportement et ferait mentir le
         * commentaire de `src/theme/theme.ts`, qui raisonne sur exactement deux.
         */
        injectThemeColor: false,
      },
      manifest: {
        id: BASE,
        name: 'La Roue de la Fortune',
        short_name: 'La Roue',
        description:
          'Tournez la roue, achetez des voyelles et devinez l’énigme lettre par lettre, seul ou contre des adversaires.',
        lang: 'fr',
        dir: 'ltr',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        orientation: 'portrait',
        /*
         * Un manifest n'accepte pas d'attribut `media`, contrairement aux
         * balises `theme-color` d'`index.html` : ces deux couleurs sont donc
         * figées sur le thème clair, celui du fond des icônes générées. Seul
         * effet visible, un écran de lancement clair pour un joueur en thème
         * sombre, sur les plateformes qui utilisent ces valeurs.
         */
        theme_color: '#faf7ff',
        background_color: '#faf7ff',
        categories: ['games', 'entertainment'],
        // Pas d'`icons` ici : `pwaAssets` les écrit, et deux sources se
        // contrediraient au premier changement d'icône.
        shortcuts: [
          { name: 'Mes énigmes', short_name: 'Énigmes', url: `${BASE}enigmes` },
          { name: 'Règles du jeu', short_name: 'Règles', url: `${BASE}regles` },
          { name: 'Réglages', short_name: 'Réglages', url: `${BASE}reglages` },
        ],
        // Pas de `screenshots` : la clé n'accepte que de vraies captures, et une
        // image fabriquée mentirait sur ce que l'application affiche.
      },
      workbox: {
        /*
         * Pas de `webmanifest` dans cette liste : le plugin ajoute lui-même
         * `manifest.webmanifest` au precache. L'y remettre le faisait précacher
         * **deux fois, sous deux révisions différentes** — Workbox acceptait
         * l'entrée en double sans un mot.
         */
        globPatterns: ['**/*.{js,css,html,svg,ico,png}'],
        globIgnores: [
          // Copie d'`index.html`, utile seulement avant installation du SW.
          '404.html',
          // Écrans de démarrage iOS : lourds, lus par Safari seul, et seulement
          // au lancement — les précacher gonflerait l'installation de plusieurs
          // mégaoctets pour rien.
          '**/apple-splash-*.png',
        ],
        navigateFallback: `${BASE}index.html`,
        // Une URL qui finit par une extension de fichier n'est pas une
        // navigation : sans ce refus, une image manquante recevrait le HTML de
        // l'application.
        navigateFallbackDenylist: [/\/[^/?]+\.[^/]+$/],
        /*
         * **`api.mistral.ai` ne doit jamais être mis en cache** : la réponse du
         * juge est un verdict daté, et une clé d'API circule dans l'en-tête de
         * la requête. En `generateSW`, Workbox n'intercepte que le precache de
         * même origine et les entrées de `runtimeCaching` : un tableau vide est
         * donc l'exclusion la plus complète qui existe, et non un oubli.
         *
         * Le jour où une règle y sera ajoutée, elle devra être précédée de :
         *
         *   { urlPattern: /^https:\/\/api\.mistral\.ai\//, handler: 'NetworkOnly' }
         */
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        // Redondants avec `registerType: 'prompt'`, écrits quand même : ce sont
        // eux qui garantissent qu'aucune mise à jour ne prend la main sans
        // l'accord du joueur.
        skipWaiting: false,
        clientsClaim: false,
      },
      /*
       * Jamais `true` en dur : un service worker actif en développement
       * intercepte les navigations, gêne le HMR et survit à l'arrêt du serveur.
       * `SW_DEV=true yarn dev` l'active le temps d'un essai.
       */
      devOptions: { enabled: process.env.SW_DEV === 'true', type: 'module' },
    }),
    contentSecurityPolicy(),
    githubPagesSpaFallback(),
  ],
  test: {
    globals: false,
    // Défaut volontaire : le moteur de jeu se teste sans DOM. Les rares fichiers
    // qui en ont besoin déclarent `// @vitest-environment jsdom` en tête.
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    // Sans ça, Vitest renvoie une chaîne vide pour tout import CSS, `?raw` compris.
    // `theme.test.ts` compare les couleurs des tokens à celles du script de
    // bootstrap, et c'est le seul test qui importe une feuille de style.
    css: true,
  },
})
