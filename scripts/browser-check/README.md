# Contrôle au navigateur

Porte de déploiement manuelle : elle vérifie, dans un vrai Chrome et sur le **build
de production**, ce qu'aucun test Vitest ne peut atteindre.

```bash
yarn build && yarn check:browser
```

Compter une minute environ. Sortie `0` si tout passe, `1` au premier échec constaté —
le script va au bout de ses contrôles avant de rendre son code de sortie.

## Ce que ça vérifie

Quatorze contrôles, dans cet ordre :

| # | Contrôle | Ce qui casserait sans lui |
| --- | --- | --- |
| 1 | chargement sans erreur | une erreur de console ou un 404 au démarrage |
| 2 | CSP injectée et complète | la balise `<meta>` absente du build, ou une directive perdue |
| 3 | thème posé avant le premier rendu | `theme-init.js` mal résolu → clignotement clair au chargement |
| 4 | roue : animation réelle et angle conservé | `commitStyles()` bloqué faute de `style-src-attr` |
| 5 | `prefers-reduced-motion` | la roue s'anime quand même, ou le tour n'aboutit plus |
| 6 | arbre d'accessibilité : aucun graphique sans nom | un `<svg>` exposé sans nom au lecteur d'écran |
| 7 | deux live regions, et deux seulement | une troisième région, et les annonces se marchent dessus |
| 8 | clavier physique : Espace, lettre, Entrée | l'écouteur posé sur `document` ne réagit plus |
| 9 | dialogue natif : Entrée, piège de focus, Échap | le `<dialog>` perd le focus ou ne le rend pas au déclencheur |
| 10 | export : téléchargement d'un blob sous CSP | le téléchargement bloqué, ou la clé d'API dans le fichier |
| 11 | manifest et icônes | application non installable, sans le moindre message d'erreur |
| 12 | service worker actif, rien de Mistral en cache | precache vide, ou un verdict du juge mis en cache |
| 13 | hors ligne | l'application ne repart pas sans réseau |
| 14 | aucune violation de CSP sur tout le parcours | une violation apparue en cours de partie, pas au chargement |

Le contrôle 10 crée une énigme perso et exporte le fichier : c'est le seul qui écrit
quelque chose, et il écrit dans un profil Chrome jetable.

## Ce que ça ne vérifie pas, exprès

- **Les règles du jeu, la validation de l'éditeur, la navigation, les bornes des
  réglages.** Déjà couverts en jsdom, plus vite et plus solidement. Les rejouer ici
  ne coûterait que du temps.
- **Le juge.** Une clé factice (`controle-navigateur-aucune-requete`) est écrite dans
  le stockage pour rendre `Résoudre` disponible et pouvoir ouvrir la boîte. **Aucune
  réponse n'est soumise, rien ne part vers Mistral.** Le pré-filtre, le contrat
  `Judge` et le connecteur ont leurs propres tests.
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
| `check.mjs` | les quatorze contrôles, et le serveur d'aperçu qu'ils utilisent |

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
le contenu sous la boîte reste inatteignable. Le contrôle 9 l'accepte donc.

## Quand ça échoue

Chaque échec cite ce qui était attendu et ce qui a été vu. Pour rejouer le parcours à
l'œil, relancer avec `WOF_HEADED=1 yarn check:browser`.
