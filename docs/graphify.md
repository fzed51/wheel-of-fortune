# Le graphe de code (graphify)

Note d'outillage, sortie du `CLAUDE.md` pour ne pas peser sur le contexte de chaque
session. Le `CLAUDE.md` n'en garde que le strict nécessaire ; tout le détail vit ici.

## Ce que couvre le graphe

```bash
graphify update .        # met le graphe à jour, incrémental, sans clé d'API
```

Le graphe couvre **tout le dépôt** — `src/`, mais aussi `scripts/browser-check/`, les
`tsconfig`, `package.json` et `public/theme-init.js`. Il compte environ un millier de
nœuds pour près de trois mille arêtes ; le chiffre exact bouge à chaque commit et ne
vaut pas d'être noté.

Il est reconstruit automatiquement par les hooks git après chaque commit et chaque
changement de branche. `graphify update .` n'est à lancer à la main qu'après des
modifications non commitées.

## Installation et mise à jour

L'outil est le paquet PyPI `graphifyy`, installé dans le venv `~/.venvs/graphify` vers
lequel `/opt/homebrew/bin/graphify` est un lien.

```bash
~/.venvs/graphify/bin/pip install -U graphifyy
graphify hook install     # pour que les hooks git repointent le bon interpréteur
```

## Comment l'interroger

Le graphe remplace une exploration à l'aveugle, à condition de l'interroger avec **les
identifiants du code** — fonctions suffixées de `()`, fichiers avec leur extension.
Coûts mesurés :

| Commande | Sortie | Usage |
| --- | --- | --- |
| `graphify path "jouer()" "reduce()"` | 70 à 120 caractères | par où deux symboles se rejoignent |
| `graphify explain "reduce()"` | ~1 600 caractères | source, communauté, voisins directs |
| `graphify affected "reduce()"` | ~3 000 caractères | ce qui casse si on y touche |

`graphify-out/GRAPH_REPORT.md` ne vaut d'être lu que pour sa liste des nœuds les plus
connectés — `reduce()`, `Puzzle` et `jouer()` arrivent en tête, ce qui nomme les vraies
abstractions du projet. Le reste du fichier est une longue liste de « Community N » sans
nom : les communautés ne se nomment qu'avec une clé de LLM, qu'aucun backend supporté ne
trouve ici.

## Six pièges, tous vérifiés

- **`graphify path` ne suit que le sens des arêtes.** Deux symboles qu'aucune chaîne
  d'appels ne relie dans ce sens-là rendent « No directed path found ». Le contournement
  est `--undirected`, mais **placé après les deux nœuds**
  (`graphify path "reduce()" "createJudge()" --undirected`) : en tête il est pris pour un
  nom de nœud. Le flag est absent du `--help` de la commande.
- **`graphify query` est à éviter.** Il fabrique ses nœuds de départ à partir des mots de
  la question ; posée en français, elle part sur des nœuds inexistants et rend des
  milliers de caractères de liste sans rapport. À la rigueur, avec les termes du code et
  `--budget 500`.
- **Ne jamais lire `graphify-out/graph.json`.** Plus d'un million de caractères, soit
  plusieurs centaines de milliers de tokens — il se requête, il ne se lit pas.
- **Les constantes sont indexées, mais pas toutes.** La grande majorité des constantes
  exportées en majuscules sont dans le graphe, `SCHEMA_VERSION` compris ; il en manque
  quelques-unes, dont `WHEEL`, `CATEGORIES`, `INPUT` et `MAX_OPPONENTS`, ce dernier étant
  déclaré dans deux fichiers. Une absence du graphe ne prouve donc rien : la confirmer au
  `grep`.
- **`graphify hook install` écrit un `.gitattributes`** déclarant un pilote de fusion pour
  `graphify-out/graph.json`. Ici il ne sert à rien — `graphify-out/` est ignoré par git,
  donc jamais en conflit. Le supprimer après coup ; `graphify hook uninstall` le retire
  aussi.
- **`graphify extract` à la racine échoue**, faute de clé pour l'extraction sémantique du
  README, de `docs/` et des images. `graphify update` n'a pas ce défaut : il ne fait que
  de l'AST — il avertit seulement que `.claude/settings.json` ne produit aucun nœud, ce
  qui est un défaut de l'outil, sans conséquence ici. Et **ne jamais viser un
  sous-dossier** (`graphify update src`) : la sortie est écrite dans `src/graphify-out/`,
  au milieu du code.
