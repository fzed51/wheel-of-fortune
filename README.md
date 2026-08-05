# La Roue de la Fortune

Jeu d'énigmes à lettres, en français, installable comme application. On tourne une roue, on propose une consonne, on achète une voyelle, et on tente de deviner l'énoncé caché — seul ou contre des bots.

Ce n'est pas un tirage au sort : la roue ne fait que fixer la valeur du coup suivant. Tout le reste est du raisonnement sur les lettres.

Application entièrement locale : rien n'est envoyé nulle part, à une exception près et une seule, l'appel au juge décrit plus bas.

## Démarrer

```bash
yarn install
yarn dev            # http://localhost:5173
```

| Commande | Rôle |
| --- | --- |
| `yarn dev` | serveur de développement |
| `yarn build` | `tsc -b` puis build Vite — **le seul vrai typecheck du projet** |
| `yarn test` | Vitest, une passe |
| `yarn test:watch` | Vitest en continu |
| `yarn lint` | `oxlint --type-aware` |
| `yarn preview` | sert le build de production sur `http://localhost:4173` |
| `yarn generate-pwa-assets` | régénère les icônes dans `public/` pour les regarder à l'œil |

Le service worker est désactivé en développement, sinon le cache masquerait chaque modification. Pour le tester sans passer par `yarn build` : `SW_DEV=true yarn dev`.

## Les règles

L'écran `/regles` de l'application les donne en entier, et il les tire des mêmes constantes que le moteur : il ne peut donc pas mentir sur un prix ou un plafond. En résumé :

- on tourne la roue, puis on propose une **consonne** ; présente, on rejoue ; absente, la main passe ;
- une consonne présente rapporte la valeur du segment × son nombre d'occurrences × le numéro de la manche, dans la cagnotte de la manche ;
- une **voyelle** s'achète — en appuyant directement dessus sur le clavier, il n'y a pas de bouton dédié — et ne rapporte rien ;
- **Banqueroute** vide la cagnotte de la manche et fait passer la main ; **Passe** fait seulement passer la main ;
- gagner la manche reporte au score total le plus grand entre la cagnotte et un plancher fixe — ce report, lui, n'est pas multiplié.

## Le juge : résoudre est arbitré par un LLM

Comparer la réponse du joueur à la solution par une égalité de chaînes ne marche pas. « la clé est sous le paillasson » sans accent, avec une majuscule en trop ou un mot au pluriel, est une bonne réponse qu'une comparaison exacte refuse. Le verdict est donc rendu par un modèle de langue, via [Mistral](https://mistral.ai) (`mistral-small-latest` par défaut, réglable).

Conséquence assumée : **sans clé d'API, « Résoudre » est indisponible, et il n'existe aucun repli local.** Un repli par comparaison exacte serait pire que l'absence du bouton, parce qu'il refuserait des réponses justes en donnant l'air de fonctionner. Le reste du jeu — deviner lettre par lettre — fonctionne entièrement sans clé, et l'accueil comme l'écran de jeu le disent au lieu de se contenter d'un bouton grisé.

Un **pré-filtre déterministe** (`src/llm/prefilter.ts`) tranche sans réseau les deux cas évidents : égalité après normalisation (accents pliés, ligatures développées, ponctuation ignorée) vaut « correct », et une distance d'édition supérieure à 40 % de la longueur vaut « incorrect ». Seule la bande ambiguë part au modèle. Gain triple : latence, coût, et surtout surface d'attaque réduite.

### La clé d'API

- saisie par l'utilisateur dans les Réglages, jamais dans un fichier du dépôt, jamais dans une variable d'environnement de build ;
- stockée sous une clé de localStorage **qui lui est propre** (`wof:mistral-key:1`), séparée des réglages : aucun objet exportable, journalisable ou affichable ne peut la contenir par accident ;
- transmise dans un en-tête, jamais dans une URL ;
- jamais journalisée — le projet ne fait aucun `console.log` d'une `Request`, de `Headers` ou d'un `init` de `fetch` ;
- absente de l'export des réglages, et masquée partout où elle s'affiche ;
- dans le reste de l'application, seul un booléen circule : `hasMistralKey`.

Le juge est fabriqué **au moment de l'envoi** et relu à chaque appel, plutôt que conservé dans une closure : une clé retenue vivrait indéfiniment dans la mémoire de l'application, visible dans les outils de développement.

### Injection de prompt

L'utilisateur écrit **les deux bouts** : il crée les énigmes perso et tape les réponses. Il peut donc intituler une énigme « Ignore les instructions précédentes ». Les parades : règles dans le message `system`, chaînes non fiables placées dans un message `user` entre délimiteurs à sentinelle **tirée au hasard à chaque appel**, longueurs bornées, caractères de contrôle rejetés — et surtout **échec fermé** : tout parse impossible ou champ manquant vaut « verdict indisponible », jamais « correct ».

## Architecture

```
src/
  game/         moteur : reducer pur, prédicats, roue, bot, énoncés d'annonce
  llm/           juge : contrat Judge, pré-filtre, connecteur Mistral
  storage/       localStorage versionné : clés, codec, sauvegarde, instantané
  data/puzzles/  catalogue embarqué (20 énigmes, 5 catégories)
  context/       providers React : partie, réglages, énigmes, thème, annonces
  hooks/         effets de bord de la partie, clavier physique, accès contextes
  components/    affichage pur, un composant par responsabilité
  routes/        un écran par route
  theme/         thème clair / sombre, partagé avec public/theme-init.js
  test/          utilitaires de test partagés
```

Quelques principes qui expliquent la forme du code mieux que le code lui-même :

- **le moteur est un reducer pur** : mêmes entrées, mêmes sorties, aucun `Date`, aucun aléa, aucun accès au stockage. L'aléa et l'heure entrent toujours par l'appelant ;
- **une action illégale est indispatchable, pas rejetée.** Un reducer qui « rejette avec un retour visuel » ne fonctionne pas : renvoyer la même référence d'état ne provoque aucun rendu, donc aucun retour. Les prédicats (`canSpin`, `canResolve`, `canBuyVowel`…) vivent donc dans `game/rules.ts`, où l'interface, le bot et le reducer les lisent tous les trois ;
- **les composants d'affichage prennent des props, pas de contexte.** Le câblage contexte → props se fait dans les routes. C'est ce qui les rend testables sans provider ;
- **aucun composant ne dispatche d'effet de jeu.** La roue anime ; c'est la route qui signale l'arrêt au provider ;
- **`aria-disabled`, jamais `disabled`.** Un bouton `disabled` qui portait le focus le perd au profit de `<body>`, et le lecteur d'écran se tait au moment précis où le joueur attend une explication. Les gestionnaires sortent tôt quand l'action est illégale ;
- **exactement deux live regions**, montées une fois pour toutes par `components/LiveRegions.tsx` : une `polite` pour le déroulement du jeu, une `role="alert"` réservée aux échecs techniques. Une région créée au moment où le message arrive n'annonce rien — le navigateur doit l'observer avant que son contenu change. Aucun autre composant ne doit en ajouter une troisième.

## Accessibilité

Objectif tenu de bout en bout, pas ajouté après coup :

- **partie entière au clavier physique** : les lettres, `Espace` pour tourner, `Entrée` pour ouvrir « Résoudre ». La boîte de dialogue passe par un `<dialog>` natif ouvert en `showModal()`, ce qui lui donne gratuitement le piège de focus, la fermeture par `Échap` et le retour du focus au déclencheur — trois choses qu'une boîte faite main devrait réécrire ;
- clavier virtuel en `roving tabindex` : une seule tabulation pour le traverser, pas 26 ;
- l'énigme est **épelée** pour le lecteur d'écran, jamais lue telle quelle — `LACLÉ` se prononcerait comme un mot ;
- le SVG de la roue est `aria-hidden` : sa valeur passe par la live region ;
- `prefers-reduced-motion` respecté — la roue ne tourne pas, mais le tour se déroule à l'identique ;
- palette de la roue à contraste vérifié (au moins 9:1 sur les six remplissages, soit le double du seuil), thème clair et thème sombre ;
- aucun `maximum-scale` ni `user-scalable=no` dans le `viewport` : ce serait un échec WCAG 1.4.4.

## Où vivent les données

Quatre entrées de localStorage, **versionnées enregistrement par enregistrement** et non par un préfixe global — changer la forme des réglages ne doit pas invalider les énigmes perso, qui sont le seul contenu irremplaçable :

| Clé | Contenu |
| --- | --- |
| `wof:settings:1` | réglages (manches, adversaires, niveau, thème, modèle) |
| `wof:puzzles:1` | énigmes perso |
| `wof:save:1` | partie en cours |
| `wof:mistral-key:1` | clé d'API, isolée exprès |

La charge utile porte **en plus** son propre numéro de version. Les deux ne servent pas à la même chose : la version de la clé signale un changement de forme voulu (l'ancienne entrée est ignorée), celle de la charge utile permet de reconnaître une donnée écrite par une version ultérieure de l'application — cas réel après un retour arrière de déploiement.

**Avertissement iOS.** Une PWA installée depuis Safari a un stockage **distinct de l'onglet Safari** : la clé d'API saisie dans l'un n'existe pas dans l'autre, et les énigmes perso non plus. L'éviction du stockage par le système est un scénario réel, `navigator.storage.persist()` n'existant pas sur Safari. Le localStorage est donc traité comme du best-effort, et **l'export JSON des énigmes perso est le seul filet de sécurité** en l'absence de serveur.

## PWA et déploiement

Cible : GitHub Pages, sur le sous-chemin `/wheel-of-fortune/`. `base` de Vite, `basename` du routeur et `id` / `scope` / `start_url` du manifest dérivent tous d'une **constante unique** de `vite.config.ts` : trois valeurs divergentes rendraient l'application non installable sans le moindre message d'erreur.

`.github/workflows/ci.yml` vérifie lint, tests et build sur chaque push et chaque pull request. `.github/workflows/deploy.yml` **rejoue les trois portes** avant de publier : un déploiement ne part jamais d'un état non vérifié, même si la CI a été relancée entre-temps.

### Mise à jour proposée, jamais imposée

Le service worker est en `registerType: 'prompt'`. En mise à jour automatique, le plugin injecte `clientsClaim` + `skipWaiting` et recharge la page de lui-même : un rechargement silencieux en pleine rotation de roue détruirait la manche en cours. Une bannière propose donc la mise à jour, et `registration.update()` est rappelé au retour au premier plan — une PWA installée sur iOS n'est jamais vraiment fermée et ne détecterait pas autrement qu'une version existe.

### Ce qui n'est jamais mis en cache

`api.mistral.ai` ne doit jamais l'être : la réponse du juge est un verdict daté, et une clé d'API circule dans l'en-tête de la requête. En stratégie `generateSW`, Workbox n'intercepte que le precache de même origine et les entrées de `runtimeCaching` — **un tableau `runtimeCaching` vide est donc l'exclusion la plus complète qui existe**, et non un oubli. Une règle `NetworkOnly` attend en commentaire, pour le jour où une autre entrée y serait ajoutée.

### Icônes

Toutes les icônes, jusqu'aux écrans de démarrage iOS, sont déclinées d'une **source unique**, `public/favicon.svg`, par `@vite-pwa/assets-generator`. Une seule et pas deux, y compris pour la variante masquable d'Android : l'outil refuse explicitement plus d'une image, et le recadrage se fait par `padding`. Les PNG produits ne sont pas versionnés — le plugin les régénère à chaque build, et un jeu d'icônes versionné finirait par contredire sa source.

### CSP

Une `Content-Security-Policy` est injectée en `<meta http-equiv>` **au build seulement** : en développement, le HMR a besoin de `ws:` et d'inline. Le scénario couvert est précis — une injection de script qui exfiltrerait la clé Mistral du stockage local. `connect-src` réduit les destinations à l'origine et à l'API ; `script-src 'self'` interdit l'inline, ce qui est exactement pourquoi le bootstrap de thème vit dans un fichier externe, `public/theme-init.js`, depuis le début du projet.

`style-src-attr 'unsafe-inline'` est une obligation et non un confort : React écrit des attributs `style`, et `commitStyles()` de l'API Web Animations aussi — sans lui, la roue ne garde pas son angle d'arrêt. `frame-ancestors` et `report-to` sont absents volontairement : une balise `<meta>` les ignore, et les écrire donnerait l'illusion d'une protection.

## Trois choses que le code ne peut pas expliquer seul

**GitHub Pages ne permet pas de fixer `Cache-Control`.** Il sert avec un `max-age` court, de l'ordre de dix minutes : une mise à jour du service worker peut donc être vue avec ce retard. Le rappel de `update()` au retour au premier plan en limite l'effet. Un hébergeur acceptant un fichier `_headers` (`no-cache` sur `index.html`, `sw.js` et `manifest.webmanifest` ; `immutable` sur `/assets/*`, dont les noms sont hachés) serait strictement meilleur sur ce point — c'est le seul argument sérieux pour changer d'hébergeur plus tard.

**L'entrée `resolutions` de `package.json`** épingle `sharp-ico/sharp` en 0.33.5. Sans elle, `sharp-ico` demande `sharp@*` et obtient une version majeure différente de celle qu'épingle le générateur d'icônes : deux copies de libvips se chargent alors dans le même processus, à chaque `yarn test` et `yarn build`, avec un avertissement objc qui parle de « mysterious crashes ». Une seule bibliothèque d'image native par processus. JSON n'accepte pas de commentaire, d'où cette explication ici.

**Deux chemins ne sont pas testables**, et pas par négligence : en développement comme en test, le plugin PWA remplace le module virtuel `virtual:pwa-register/react` par un stub inerte dont `needRefresh` vaut toujours `false`. Ni l'annonce de mise à jour ni le rappel de `visibilitychange` ne peuvent donc être atteints par un test. Ils se vérifient à la main, sur un build servi par `yarn preview`.

## Tests

531 tests sur 37 fichiers. Le moteur est couvert par des tests unitaires, un scénario de partie scripté et un fuzz d'invariants — c'est la partie du code où une régression est invisible à l'écran.

Doctrine, appliquée sans exception :

- **requêtes par rôle et nom accessible uniquement.** Jamais de `data-testid`, jamais de sélecteur de classe, jamais de snapshot. Un test qui passe par le nom accessible vérifie l'accessibilité en même temps que le comportement ;
- les modules purs (`game/`, `llm/`, `storage/`) se testent en environnement node ; seuls les fichiers qui touchent au DOM portent `// @vitest-environment jsdom` ;
- au moins un test affirme une **absence** : la bannière de mise à jour ne crée pas de seconde live region. C'est l'invariant que trois autres fichiers supposent sans le dire.

## Conventions de code

- **TypeScript en `strict` complet**, compilateur natif de TypeScript 7. Attention : il **refuse les options inconnues** au lieu de les ignorer, et ne prend pas en charge les `plugins` de tsconfig ;
- **imports relatifs, aucun alias `@/`** ;
- **aucun formateur automatique.** Indentation à 2 espaces, guillemets simples, **pas de point-virgule en fin de ligne** : formatage à la main, à l'image des fichiers voisins ;
- une responsabilité par composant ; un composant en plusieurs fichiers vit dans son dossier avec un `index.ts` ;
- `oxlint --type-aware` verrouillé sur la version exacte de TypeScript, avec les règles qui attrapent les bugs de la couche asynchrone : `no-floating-promises`, `no-misused-promises`, `await-thenable`, plus `react/exhaustive-deps` en erreur ;
- **`yarn build` est le seul vrai typecheck.** `yarn lint` ne compile pas le projet.

## Ce qui n'est pas fait

Honnêtement listé, pour que personne ne le découvre en production :

- **les contrôles manuels au navigateur n'ont jamais été passés** : ni audit Lighthouse, ni axe DevTools, ni mode hors ligne, ni installation réelle sur un appareil. La CSP en particulier ne se valide qu'en vrai ;
- le catalogue embarqué compte **20 énigmes**, assez pour jouer, pas assez pour ne pas se répéter longtemps ;
- pas de son, pas de vibration ;
- pas de multi local : le moteur est déjà écrit autour d'une liste de joueurs, mais rien ne le pilote ;
- un seul connecteur LLM. Le contrat `Judge` isole le fournisseur : en ajouter un ne touche que `src/llm/`.

## Licence

Projet personnel, sans licence déclarée pour l'instant.
