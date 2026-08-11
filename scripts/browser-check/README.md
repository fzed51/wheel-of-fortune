# Contrôle au navigateur

Porte de déploiement manuelle : elle vérifie, dans un vrai Chrome et sur le **build
de production**, ce qu'aucun test Vitest ne peut atteindre.

```bash
yarn build && yarn check:browser
```

Compter une minute environ. Sortie `0` si tout passe, `1` au premier échec constaté —
le script va au bout de ses contrôles avant de rendre son code de sortie.

## Ce que ça vérifie

Dix-sept contrôles, dans cet ordre :

| # | Contrôle | Ce qui casserait sans lui |
| --- | --- | --- |
| 1 | chargement sans erreur | une erreur de console ou un 404 au démarrage |
| 2 | CSP injectée et complète | la balise `<meta>` absente du build, ou une directive perdue |
| 3 | thème posé avant le premier rendu | `theme-init.js` mal résolu → clignotement clair au chargement |
| 4 | roue : animation réelle et angle conservé | `commitStyles()` bloqué faute de `style-src-attr` |
| 5 | arc de visée : armé puis figé | le lancer en deux temps réduit à un clic, ou l'arc qui survit à la rotation |
| 6 | lancer simple : un seul clic suffit, sans arc | le réglage sans effet, ou un arc qui apparaît quand même |
| 7 | `prefers-reduced-motion` | la roue s'anime quand même, ou le tour n'aboutit plus |
| 8 | arbre d'accessibilité : aucun graphique sans nom | un `<svg>` exposé sans nom au lecteur d'écran |
| 9 | deux live regions, et deux seulement | une troisième région, et les annonces se marchent dessus |
| 10 | clavier physique : Espace, lettre, Entrée | l'écouteur posé sur `document` ne réagit plus |
| 11 | dialogue natif : Entrée, piège de focus, Échap | le `<dialog>` perd le focus ou ne le rend pas au déclencheur |
| 12 | export : téléchargement d'un blob sous CSP | le téléchargement bloqué, ou la clé d'API dans le fichier |
| 13 | manifest et icônes | application non installable, sans le moindre message d'erreur |
| 14 | service worker actif, rien de Mistral en cache | precache vide, ou un verdict du juge mis en cache |
| 15 | hors ligne | l'application ne repart pas sans réseau |
| 16 | un bouton inerte s'estompe vraiment | un bouton ou une touche rendus inertes qui gardent l'apparence d'un élément actif |
| 17 | aucune violation de CSP sur tout le parcours | une violation apparue en cours de partie, pas au chargement |

Les contrôles 4 à 7 comptent les animations **du rotor seul**, jamais celles de la
page entière : l'arc de visée est lui aussi animé, et un compte global laisserait
passer une roue qui ne tourne plus.

Le contrôle 6 écrit un réglage persisté, puis le remet à sa valeur par défaut et
recharge la page — `SettingsProvider` ne relit pas le stockage de lui-même.

Le contrôle 12 crée une énigme perso et exporte le fichier : c'est le seul qui écrit
un fichier, et il écrit dans un profil Chrome jetable.

Le contrôle 16 compare, par `getComputedStyle`, l'opacité d'un bouton inerte
(« Passer la main », inerte dès l'arrivée sur l'écran de jeu) à celle d'un bouton
actif (« Lancer »), puis fait la même comparaison sur le clavier de lettres — une
consonne jamais proposée (« H », témoin verrouillé tout du long) contre la voyelle
« A », verrouillée tant que la cagnotte reste sous son prix (250 €) puis relevée de
nouveau une fois la cagnotte suffisante, et contre une lettre quelconque déjà
proposée en cours de route. jsdom ne calcule pas d'opacité et ce dépôt interdit les
sélecteurs de classe dans les tests Vitest : aucun test automatisé ne peut atteindre
`aria-disabled:opacity-50`, seul un vrai navigateur le peut. Aucune voyelle n'étant
achetable dès `demarrerPartie` (la cagnotte du joueur part de zéro), ce contrôle
joue vraiment quelques tours pour en obtenir une.

## Ce que ça ne vérifie pas, exprès

- **Les règles du jeu, la validation de l'éditeur, la navigation, les bornes des
  réglages.** Déjà couverts en jsdom, plus vite et plus solidement. Les rejouer ici
  ne coûterait que du temps.
- **Le juge.** Une clé factice (`controle-navigateur-aucune-requete`) est écrite dans
  le stockage juste avant le contrôle de l'export, pour vérifier qu'elle ne s'y
  retrouve pas — elle ne conditionne plus `Résoudre`, rendu localement depuis que
  `matchesAnswer` compare les chaînes sans réseau. Elle est effacée du stockage dès
  ce contrôle terminé : la laisser mettrait `config.bonusEnabled` à vrai pour toute
  partie démarrée par un contrôle ultérieur, et un futur contrôle qui jouerait
  jusqu'à la manche finale déclencherait un vrai appel réseau vers Mistral avec une
  clé invalide. **Aucun contrôle ne joue une partie jusqu'à la manche finale**, et
  la clé n'est de toute façon plus là pour l'atteindre : l'étape bonus n'est donc
  jamais sollicitée, aucune réponse n'est soumise, rien ne part vers Mistral. La
  règle de comparaison (`matchesAnswer`, qui a remplacé l'ancien pré-filtre), le
  contrat `Judge` et le connecteur ont leurs propres tests.
- **La bannière de mise à jour du service worker.** Elle demande deux builds
  successifs servis à la même origine ; ça reste une vérification à la main.
- **Lighthouse, axe, l'installation réelle sur un appareil.** Voir
  [`docs/test-claude-in-chrome.md`](../../docs/test-claude-in-chrome.md).
- **Les autres navigateurs.** Le pilote parle le Chrome DevTools Protocol.

## Réglages

| Variable | Défaut | Rôle |
| --- | --- | --- |
| `WOF_HEADED=1` | sans interface | affiche la fenêtre Chrome, pour regarder le parcours |
| `CHROME_PATH` | Chrome stable sur macOS | chemin du binaire sur un autre poste |
| `WOF_URL` | `http://localhost:4174` | origine à contrôler ; le script sert lui-même le build |

Le port 4174 est **différent** de celui de `yarn preview` (4173), volontairement : un
serveur d'aperçu laissé ouvert dans un autre terminal servirait un `dist/` d'avant le
dernier build. Le script refuse d'ailleurs de démarrer si quelque chose écoute déjà
sur son port, et compare le document servi à `dist/index.html` avant de commencer.

## Les fichiers

| Fichier | Rôle |
| --- | --- |
| `cdp.mjs` | pilote Chrome par le DevTools Protocol : lancement, navigation, `evaluate`, clavier, souris, hors ligne, `prefers-reduced-motion` |
| `page.mjs` | boîte à outils injectée dans la page avant son premier script : requêtes par nom accessible, mouchards du thème et des violations CSP |
| `check.mjs` | les dix-sept contrôles, et le serveur d’aperçu qu’ils utilisent |

Aucune dépendance : Node fournit `fetch` et `WebSocket`, Chrome fournit le reste.
Playwright coûterait un navigateur à télécharger pour un contrôle passé à la main de
temps en temps. Le jour où ce contrôle partirait en intégration continue, c'est
l'inverse qui serait vrai : il faudra alors basculer sur Playwright plutôt que
d'étoffer `cdp.mjs`.

## Deux pièges rencontrés en l'écrivant

**`el.click()` ne déplace pas le focus.** Un clic programmatique ouvre bien la boîte
`Résoudre`, mais le bouton n'a jamais eu le focus : à la fermeture, le `<dialog>` le
rend à `document.body` et le retour au déclencheur paraît cassé alors qu'il marche.
D'où `clickElement()`, qui dispatche un vrai clic de souris.

**Le piège de focus traverse `document.body`.** Chrome passe une fois par la racine du
document à chaque cycle de tabulation dans une boîte modale. Ce n'est pas une fuite :
le contenu sous la boîte reste inatteignable. Le contrôle 11 l'accepte donc.

## Quand ça échoue

Chaque échec cite ce qui était attendu et ce qui a été vu. Pour rejouer le parcours à
l'œil, relancer avec `WOF_HEADED=1 yarn check:browser`.
