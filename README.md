# La Roue de la Fortune

**→ [Jouer en ligne](https://fzed51.github.io/wheel-of-fortune/)**

Jeu d'énigmes à lettres, en français, installable comme application. On lance une roue en visant à l'arc, on propose une consonne, on achète une voyelle, et on tente de deviner l'énoncé caché — seul ou contre des bots.

Le lancer se joue à l'arc de visée : un arc tourne en aller-retour autour de la roue, et le figer dans une fenêtre de deux cases est toute l'imprécision qu'il promet — jamais moins, jamais plus. Tout le reste — les lettres qu'on propose, l'énoncé qu'on devine — est du pur raisonnement.

Application entièrement locale : rien n'est envoyé nulle part, à deux exceptions près — le bouton « Tester la clé » des Réglages et le verdict de la question bonus de la manche finale, décrits plus bas — et les deux exigent une clé d'API que rien n'oblige à enregistrer.

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
| `yarn check:browser` | contrôle du build dans un vrai Chrome — à lancer après `yarn build` |
| `yarn generate-pwa-assets` | régénère les icônes dans `public/` pour les regarder à l'œil |

Le service worker est désactivé en développement, sinon le cache masquerait chaque modification. Pour le tester sans passer par `yarn build` : `SW_DEV=true yarn dev`.

## Les règles

L'écran `/regles` de l'application les donne en entier, et il les tire des mêmes constantes que le moteur : il ne peut donc pas mentir sur un prix ou un plafond. En résumé :

- on lance la roue en visant à l'arc, puis on propose une **consonne** ; présente, on rejoue ; absente, la main passe ;
- une consonne présente rapporte la valeur du segment × son nombre d'occurrences × le numéro de la manche, dans la cagnotte de la manche ;
- une **voyelle** s'achète — en appuyant directement dessus sur le clavier, il n'y a pas de bouton dédié — et ne rapporte rien ;
- **Banqueroute** vide la cagnotte de la manche et fait passer la main ; **Passe** fait seulement passer la main ;
- gagner la manche reporte au score total le plus grand entre la cagnotte et un plancher fixe — ce report, lui, n'est pas multiplié.

## Résoudre : un verdict local, rendu par le moteur

Proposer la solution complète, c'est retaper la même phrase. Ça se compare sans modèle de langue, à condition de comparer la bonne chose : `matchesAnswer` (`src/game/compare.ts`) replie les deux chaînes — majuscules, `Œ` développé en `OE`, `Æ` en `AE`, diacritiques et caractères non alphanumériques retirés — puis exige l'**égalité**. `LA CLÉ`, `la cle` et `LACLE` sont donc acceptés ; `LES CLÉS` est refusé.

C'est volontairement plus sévère qu'un arbitrage souple : aucune tolérance de faute de frappe. En échange, le verdict est **synchrone, rendu dans le reducer**, sans réseau, sans attente et sans état intermédiaire — la phase `resolving` et le couple requête/verdict qui allaient avec ont disparu. Une réponse fausse fait passer la main sans toucher à la cagnotte de la manche.

**Le jeu est donc entièrement jouable sans clé d'API**, du premier au dernier tour.

### Le juge : la seule question qu'aucune comparaison de chaînes ne peut trancher

Une fois la manche finale remportée, le gagnant peut tenter de répondre à sa question — catégorie « Question » — pour un montant fixe (`BONUS_PRIZE` de `src/game/setup.ts`), jamais multiplié par le coefficient de manche et versé directement au score total : il peut donc créer une égalité ou en défaire une, le classement n'étant calculé qu'après cette étape.

C'est le **seul** moment où `src/llm/` est encore appelé (hors « Tester la clé » des Réglages) : « c'est Canberra », « la ville de Canberra » et « Canbera » répondent toutes correctement à « Canberra », et aucune comparaison de chaînes ne peut le voir — c'est exactement ce que `matchesAnswer` ne sait pas faire. Un juge injoignable n'est jamais compté comme une mauvaise réponse : le joueur retape sans pénalité, ou renonce via un bouton « Passer » qui va directement aux résultats. Un bot qui remporte la manche finale répond aussi, mais son verdict est tiré à une chance sur deux localement, sans le moindre appel réseau.

**Sans clé d'API enregistrée, cette étape n'existe pas du tout** : la partie va directement aux résultats après la manche finale. Elle ne conditionne aucune règle du reste du jeu.

Le modèle est [Mistral](https://mistral.ai) (`mistral-small-latest` par défaut, réglable). Quant à la clé elle-même :

- saisie par l'utilisateur dans les Réglages, jamais dans un fichier du dépôt, jamais dans une variable d'environnement de build ;
- stockée sous une clé de localStorage **qui lui est propre** (`wof:aux:2`, un nom volontairement anodin — l'ancien `wof:mistral-key:1` attirait l'œil), séparée des réglages : aucun objet exportable, journalisable ou affichable ne peut la contenir par accident ;
- **masquée avant écriture** : XOR octet à octet avec un sel constant, puis base64 (`src/storage/mask.ts`). Ce n'est **pas** un chiffrement — le sel vit dans le bundle, donc dans le code livré au navigateur, et l'opération se défait avec les mêmes quelques lignes ; ça ne protège de rien face à quiconque lit les sources. Le seul effet recherché : qu'un curieux qui ouvre l'inspecteur ne voie pas la clé en clair au premier coup d'œil. Une vraie protection demanderait un secret que l'application n'a pas — un code saisi par l'utilisateur, ou `sessionStorage` pour que la clé meure avec l'onglet ;
- transmise dans un en-tête, jamais dans une URL ;
- jamais journalisée — le projet ne fait aucun `console.log` d'une `Request`, de `Headers` ou d'un `init` de `fetch` ;
- absente de l'export des réglages, et masquée partout où elle s'affiche ;
- dans le reste de l'application, seul un booléen circule : `hasMistralKey`.

Elle est relue depuis le stockage **au moment de l'envoi**, plutôt que retenue dans une closure ou dans un état React : une clé conservée vivrait indéfiniment dans la mémoire de l'application, visible dans les outils de développement. Le connecteur est fabriqué au dernier moment, pour la durée d'une requête.

### Injection de prompt

L'utilisateur écrit **les deux bouts** : il crée les énigmes perso et tape les réponses. Il peut donc intituler une énigme « Ignore les instructions précédentes ». Les parades : règles dans le message `system`, chaînes non fiables placées dans un message `user` entre délimiteurs à sentinelle **tirée au hasard à chaque appel**, longueurs bornées, caractères de contrôle rejetés — et surtout **échec fermé** : tout parse impossible ou champ manquant vaut « verdict indisponible », jamais « correct ».

## Architecture

```
src/
  game/         moteur : reducer pur, prédicats, roue, bot, comparaison, annonces
  llm/           juge : contrat Judge, connecteur Mistral
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
- **la case n'est plus tirée puis animée, elle est lue à l'arrivée de la rotation.** Le geste de lancer fixe un angle visé sur la roue, et la case sous l'aiguille au repos en est le résultat direct — l'ancienne rotation n'était qu'une animation décorative vers un résultat déjà choisi. Une version antérieure dosait une force plutôt qu'un angle (`travel = 720 + force × 1440`, soit 2 à 6 tours) : sur une course de jauge de 900 ms — la durée qu'a aujourd'hui un aller de l'arc au réglage par défaut —, la case visée défilait en 9 ms, contre 37 ms pour l'arc angulaire à durée égale, parce que la jauge couvrait 1 440° de rotation là où l'arc n'en couvre que 360 ; viser était donc impossible, et un arc qui aurait affiché cette force n'aurait été qu'un cadran illisible. En passant à l'angle, la géométrie devient honnête : amener sous l'aiguille le point situé à l'angle écran θ ne demande que `travel ≡ −θ (mod 360)`, sans jamais consulter l'angle de repos de la roue — ce qui permet à `throwFromAim` de rester une fonction pure d'un seul angle. Rien n'annonce la case visée, ni avant ni pendant la rotation : l'annonce se limite à « La roue tourne… », le doute pendant la rotation est voulu ; le mode « lancer simple » (un seul clic, angle tiré au hasard) reste le chemin d'accès égal pour qui ne peut pas viser à l'œil ou au temps de réaction ;
- **la vitesse du balayage de l'arc est un réglage persisté**, à quatre valeurs (Lente, Normale, Rapide — le défaut —, Très rapide), sans aucun effet en mode « lancer simple » puisqu'aucun arc n'y apparaît ;
- **`aria-disabled`, jamais `disabled`.** Un bouton `disabled` qui portait le focus le perd au profit de `<body>`, et le lecteur d'écran se tait au moment précis où le joueur attend une explication. Les gestionnaires sortent tôt quand l'action est illégale ;
- **exactement deux live regions**, montées une fois pour toutes par `components/LiveRegions.tsx` : une `polite` pour le déroulement du jeu, une `role="alert"` réservée aux échecs techniques. Une région créée au moment où le message arrive n'annonce rien — le navigateur doit l'observer avant que son contenu change. Aucun autre composant ne doit en ajouter une troisième.

## Accessibilité

Objectif tenu de bout en bout, pas ajouté après coup :

- **partie entière au clavier physique** : les lettres, `Espace` pour lancer la roue — un appui l'arme, un second fige l'arc de visée ; un seul suffit en mode « lancer simple » —, `Entrée` pour ouvrir « Résoudre ». La boîte « Résoudre » passe par un `<dialog>` natif ouvert en `showModal()`, ce qui lui donne gratuitement le piège de focus, la fermeture par `Échap` et le retour du focus au déclencheur — trois choses qu'une boîte faite main devrait réécrire. La question bonus de la manche finale, elle, n'est **pas** un dialogue : c'est une simple carte (`<section>`), parce qu'à cette étape le plateau, la roue et le clavier sont déjà masqués — rien à recouvrir, donc rien à piéger (voir le docblock de `BonusQuestion`) ;
- clavier virtuel en `roving tabindex` : une seule tabulation pour le traverser, pas 26 ;
- l'énigme est **épelée** pour le lecteur d'écran, jamais lue telle quelle — `LACLÉ` se prononcerait comme un mot ;
- le SVG de la roue est `aria-hidden` : sa valeur passe par la live region ;
- `prefers-reduced-motion` respecté — la roue ne tourne pas, mais le tour se déroule à l'identique ; l'arc de visée, lui, continue de balayer, seulement ralenti (×2,5), faute de quoi le lancer perdrait tout jeu ; le mode « lancer simple » reste le vrai repli pour qui ne veut aucun mouvement ;
- palette de la roue à contraste vérifié (au moins 9:1 sur les six remplissages, soit le double du seuil), thème clair et thème sombre ;
- aucun `maximum-scale` ni `user-scalable=no` dans le `viewport` : ce serait un échec WCAG 1.4.4.

## Où vivent les données

Quatre entrées de localStorage, **versionnées enregistrement par enregistrement** et non par un préfixe global — changer la forme des réglages ne doit pas invalider les énigmes perso, qui sont le seul contenu irremplaçable :

| Clé | Contenu |
| --- | --- |
| `wof:settings:1` | réglages (manches, adversaires, niveau, thème, modèle, mode de lancer, vitesse de l'arc de visée) |
| `wof:puzzles:1` | énigmes perso |
| `wof:save:1` | partie en cours |
| `wof:aux:2` | clé d'API, isolée exprès, masquée et sous un nom anodin |

La charge utile porte **en plus** son propre numéro de version. Les deux ne servent pas à la même chose : la version de la clé signale un changement de forme voulu (l'ancienne entrée est ignorée), celle de la charge utile permet de reconnaître une donnée écrite par une version ultérieure de l'application — cas réel après un retour arrière de déploiement.

L'entrée de la clé d'API est passée de `wof:mistral-key:1` (clair) à `wof:aux:2` (masquée) : le numéro monte parce que les deux formes sont indistinguables par simple examen — une clé Mistral fait 32 caractères alphanumériques, donc `atob` réussit dessus et rend du binaire, ce qui interdit de deviner le format à la forme de la valeur. L'ancienne entrée n'est pas retirée du code : `loadMistralKey()` la migre au premier chargement — relue en clair, réécrite masquée sous la nouvelle entrée, puis effacée — et elle reste dans la liste que « Réinitialiser les données » efface.

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

## Quatre choses que le code ne peut pas expliquer seul

**La réponse attendue de la question bonus vit dans l'état de la partie**, donc dans `localStorage` et dans React DevTools, pendant toute la manche finale — exactement comme `puzzle.answer` depuis le début. Ce n'est pas un oubli de sécurité à corriger : le bonus n'a jamais eu la prétention d'être un dispositif anti-triche, et n'en a pas plus besoin que le reste de l'énigme.

**GitHub Pages ne permet pas de fixer `Cache-Control`.** Il sert avec un `max-age` court, de l'ordre de dix minutes : une mise à jour du service worker peut donc être vue avec ce retard. Le rappel de `update()` au retour au premier plan en limite l'effet. Un hébergeur acceptant un fichier `_headers` (`no-cache` sur `index.html`, `sw.js` et `manifest.webmanifest` ; `immutable` sur `/assets/*`, dont les noms sont hachés) serait strictement meilleur sur ce point — c'est le seul argument sérieux pour changer d'hébergeur plus tard.

**L'entrée `resolutions` de `package.json`** épingle `sharp-ico/sharp` en 0.33.5. Sans elle, `sharp-ico` demande `sharp@*` et obtient une version majeure différente de celle qu'épingle le générateur d'icônes : deux copies de libvips se chargent alors dans le même processus, à chaque `yarn test` et `yarn build`, avec un avertissement objc qui parle de « mysterious crashes ». Une seule bibliothèque d'image native par processus. JSON n'accepte pas de commentaire, d'où cette explication ici.

**Deux chemins ne sont pas testables**, et pas par négligence : en développement comme en test, le plugin PWA remplace le module virtuel `virtual:pwa-register/react` par un stub inerte dont `needRefresh` vaut toujours `false`. Ni l'annonce de mise à jour ni le rappel de `visibilitychange` ne peuvent donc être atteints par un test. Ils se vérifient à la main, sur un build servi par `yarn preview`.

## Tests

832 tests sur 45 fichiers. Le moteur est couvert par des tests unitaires, un scénario de partie scripté et un fuzz d'invariants — c'est la partie du code où une régression est invisible à l'écran.

Doctrine, appliquée sans exception :

- **requêtes par rôle et nom accessible uniquement.** Jamais de `data-testid`, jamais de sélecteur de classe, jamais de snapshot. Un test qui passe par le nom accessible vérifie l'accessibilité en même temps que le comportement ;
- les modules purs (`game/`, `llm/`, `storage/`) se testent en environnement node ; seuls les fichiers qui touchent au DOM portent `// @vitest-environment jsdom` ;
- au moins un test affirme une **absence** : la bannière de mise à jour ne crée pas de seconde live region. C'est l'invariant que trois autres fichiers supposent sans le dire.

### Le contrôle au navigateur

```bash
yarn build && yarn check:browser
```

Dix-sept contrôles dans un vrai Chrome, sur le build de production, pour ce que jsdom ne peut pas atteindre : la CSP réelle, le service worker et le hors-ligne, le manifest, le lancer de la roue à l'arc de visée — armé puis figé, et le mode « lancer simple » qui s'en passe — et son animation par la Web Animations API, l'arbre d'accessibilité de Chrome, le `<dialog>` natif et l'écouteur clavier posé sur `document`. Sans aucune dépendance : le pilote parle directement le Chrome DevTools Protocol.

Ce n'est **pas** dans la CI ni dans `yarn test` — c'est une porte de déploiement passée à la main, qui lance Chrome et dure une minute. Aucune requête ne part vers Mistral : la seule clé écrite dans le profil jetable est factice, et sert uniquement à vérifier qu'elle ne se retrouve pas dans l'export des énigmes.

Détail des contrôles, de ce qui n'est volontairement pas couvert, et des variables d'environnement : [`scripts/browser-check/README.md`](scripts/browser-check/README.md).

## Conventions de code

- **TypeScript en `strict` complet**, compilateur natif de TypeScript 7. Attention : il **refuse les options inconnues** au lieu de les ignorer, et ne prend pas en charge les `plugins` de tsconfig ;
- **imports relatifs, aucun alias `@/`** ;
- **aucun formateur automatique.** Indentation à 2 espaces, guillemets simples, **pas de point-virgule en fin de ligne** : formatage à la main, à l'image des fichiers voisins ;
- une responsabilité par composant ; un composant en plusieurs fichiers vit dans son dossier avec un `index.ts` ;
- `oxlint --type-aware` verrouillé sur la version exacte de TypeScript, avec les règles qui attrapent les bugs de la couche asynchrone : `no-floating-promises`, `no-misused-promises`, `await-thenable`, plus `react/exhaustive-deps` en erreur ;
- **`yarn build` est le seul vrai typecheck.** `yarn lint` ne compile pas le projet.

## Ce qui n'est pas fait

Honnêtement listé, pour que personne ne le découvre en production :

- **la recette au navigateur n'est qu'à moitié faite.** `yarn check:browser` couvre désormais la CSP, le service worker, le hors-ligne, le manifest et l'accessibilité de l'arbre Chrome ; restent hors couverture l'audit Lighthouse, axe DevTools, l'installation réelle sur un appareil, la bannière de mise à jour (qui demande deux builds successifs) et l'étape bonus de la manche finale, que le script exclut par conception — il n'écrit qu'une clé factice et ne joue jamais de partie jusqu'à la manche finale, justement pour ne jamais appeler Mistral (détail dans [`scripts/browser-check/README.md`](scripts/browser-check/README.md)). À vérifier à la main, avec une vraie clé pour le chemin heureux :
  - **sans clé d'API** : la manche finale se joue normalement, puis la partie va directement aux résultats, sans étape bonus et sans le moindre reproche à l'écran ;
  - **avec clé** : manche finale gagnée → la question est posée ; une réponse en phrase (« c'est Canberra ») est acceptée ; une réponse hors sujet est refusée sans crédit ; une coupure réseau volontaire donne « juge injoignable », sans pénalité, et un nouvel essai reste possible ; le bouton « Passer » mène directement aux résultats ;
  - **rechargement pendant l'attente du verdict** : retour à l'attente de réponse, le bonus reste entièrement à gagner ;
  - **partie contre trois bots** : un bot remporte la manche finale, répond — une chance sur deux, sans le moindre appel réseau — et la partie se termine normalement ;
  - **réponse exacte** : acceptée sans le moindre appel réseau, observable dans l'onglet Réseau du navigateur — c'est la confirmation locale de `matchesAnswer` qui joue, jamais le juge ;
- le catalogue embarqué compte **20 énigmes**, assez pour jouer, pas assez pour ne pas se répéter longtemps ;
- pas de son, pas de vibration ;
- pas de multi local : le moteur est déjà écrit autour d'une liste de joueurs, mais rien ne le pilote ;
- un seul connecteur LLM. Le contrat `Judge` isole le fournisseur : en ajouter un ne touche que `src/llm/`.

## Licence

Projet personnel, sans licence déclarée pour l'instant.
