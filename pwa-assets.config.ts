import {
  createAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config'
import type { AppleDeviceName } from '@vite-pwa/assets-generator/config'

/*
 * Déclinaison des icônes de la PWA à partir de `public/favicon.svg`.
 *
 * Ce fichier n'est pas exécuté par un script : `vite.config.ts` déclare
 * `pwaAssets: { config: true }`, et le plugin le charge lui-même à chaque build.
 * Il produit les PNG **et** le tableau `icons` du manifest **et** les `<link>`
 * d'`index.html` depuis cette source unique — rien ne peut plus se
 * désynchroniser entre les trois. Aucun PNG n'est donc écrit dans `public/`,
 * ni versionné.
 *
 * Le script `yarn generate-pwa-assets` existe quand même, pour inspecter les
 * fichiers produits à l'œil. Il écrit, lui, dans `public/` : ne pas commiter
 * ce qu'il y laisse.
 */

/**
 * Fond des icônes opaques et des écrans de démarrage. Copies de
 * `THEME_COLORS` (`src/theme/theme.ts`), lui-même déjà une copie de `wof-bg` :
 * un fichier de configuration ne peut pas importer du code applicatif sans
 * entraîner le bundle entier dans le type-check de `tsconfig.node.json`.
 */
const BACKGROUND = '#faf7ff'
const DARK_BACKGROUND = '#1b1033'

/*
 * Écrans de démarrage iOS : une liste **bornée**, pas `AllAppleDeviceNames`.
 * Les 53 appareils connus donneraient plus de deux cents PNG (deux
 * orientations, deux thèmes), tous lourds, tous ignorés par le precache et par
 * tous les navigateurs sauf Safari. Les résolutions identiques étant déjà
 * dédupliquées par le générateur, ces six appareils couvrent les tailles
 * courantes ; un modèle absent n'affiche simplement pas de splash, ce qui est
 * le comportement d'origine du web sur iOS.
 */
const APPLE_DEVICES: AppleDeviceName[] = [
  'iPhone 16 Pro Max',
  'iPhone 16 Pro',
  'iPhone 16',
  'iPhone SE 4.7"',
  'iPad Pro 12.9"',
  'iPad Air 11"',
]

export default defineConfig({
  images: ['public/favicon.svg'],
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    /*
     * `padding: 0.3` sur la variante maskable et sur l'icône Apple : Android
     * applique un masque dont la zone sûre est le disque central à 80 % du
     * côté, et iOS arrondit les angles. C'est la valeur par défaut du
     * générateur, réécrite ici parce qu'elle porte une décision — et parce que
     * le fond, lui, doit changer.
     *
     * Le fond opaque est obligatoire : une icône transparente devient noire
     * sur un lanceur sombre.
     */
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0.3,
      resizeOptions: { fit: 'contain', background: BACKGROUND },
    },
    apple: {
      ...minimal2023Preset.apple,
      padding: 0.3,
      resizeOptions: { fit: 'contain', background: BACKGROUND },
    },
    /*
     * Le preset `minimal-2023` ne produit **pas** d'écran de démarrage iOS ;
     * sans cette entrée, une PWA installée sur iPhone affiche une page blanche
     * pendant son lancement.
     */
    appleSplashScreens: createAppleSplashScreens(
      {
        padding: 0.3,
        resizeOptions: { fit: 'contain', background: BACKGROUND },
        // Déclarer un fond sombre suffit à doubler chaque écran d'une variante
        // sombre, liée par un media query : sans ça, une app en thème sombre
        // se lance sur un fond clair.
        darkResizeOptions: { fit: 'contain', background: DARK_BACKGROUND },
        linkMediaOptions: { addMediaScreen: true, xhtml: false },
      },
      APPLE_DEVICES,
    ),
  },
})
