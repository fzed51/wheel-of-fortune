# La Roue de la Fortune — consignes de travail

React 19 (compiler) · TypeScript 7 `strict` · Tailwind v4 · react-router 8 en mode data · Vitest · oxlint

## Le README est la référence, pas ce fichier

`README.md` documente l'architecture, les conventions, les données et les tests. Ces sections ne sont **pas** recopiées ici. Avant d'écrire du code, lire la section concernée plutôt que d'explorer le dépôt :

| Question | Section du README |
| --- | --- |
| Où vit quoi, et pourquoi cette forme | `## Architecture` |
| Style, imports, typage, lint | `## Conventions de code` |
| Doctrine de test | `## Tests` |
| localStorage, versions, iOS | `## Où vivent les données` |
| PWA, CSP, service worker, icônes | `## PWA et déploiement` |
| Décisions que le code n'explique pas | `## … choses que le code ne peut pas expliquer seul` |
| Angles morts connus | `## Ce qui n'est pas fait` |

## Portes de validation

```bash
yarn lint && yarn test && yarn build
```

- **`yarn build` est le seul vrai typecheck** — `yarn lint` ne compile pas le projet.
- Cibler un fichier pendant le développement : `yarn test src/game/rules.test.ts`. La suite complète (plus de 700 tests) seulement avant de rendre.
- `yarn build && yarn check:browser` est une porte manuelle de déploiement, hors CI. Ne pas la lancer sans demande : elle ouvre un vrai Chrome.

## Le code passe par des sous-agents

Découper chaque tâche en zones de fichiers bornées et **disjointes**, puis les confier à l'agent `frontend-dev` (`.claude/agents/frontend-dev.md`, modèle Sonnet imposé). Ne pas écrire le code depuis le fil principal : son contexte est la ressource rare.

- Jamais deux tâches parallèles sur des zones qui se recouvrent.
- Les sous-agents ne commitent pas. Le fil principal garde l'ordonnancement, les portes finales et le commit.
- **Ne jamais affirmer un fait technique dans un brief sans l'avoir vérifié** : un fait faux se propage jusque dans les commentaires du code produit.
- Exiger de chaque agent qu'il dise **ce qu'il casserait pour faire rougir chacun de ses tests**. C'est ce qui révèle les tests complaisants.
- Un agent peut mourir en vol (erreur d'API, watchdog). Si un rapport manque, **relire le diff de sa zone** avant de la considérer perdue : le travail est souvent déjà là.
- Le contenu inventé (énigmes, questions) s'écrit dans le fil principal, validé par un fichier de test jetable qui passe les candidats par les vraies fonctions du dépôt.

## Invariants à ne pas casser

- **`src/game/` est pur** : aucun `Date`, aucun aléa, aucun accès au stockage. L'heure et le hasard entrent par l'appelant.
- **Une action illégale est indispatchable, pas rejetée.** Les prédicats vivent dans `src/game/rules.ts`, lus par l'interface, le bot et le reducer.
- **`aria-disabled`, jamais `disabled`** — un bouton `disabled` perd le focus et rend le lecteur d'écran muet.
- **Exactement deux live regions**, montées par `src/components/LiveRegions.tsx`. Ne jamais en ajouter une troisième.
- **Les composants d'affichage prennent des props, pas de contexte.** Le câblage se fait dans les routes.
- **`src/llm/` ne sert plus que la question bonus** et le bouton « Tester la clé ». « Résoudre » est tranché localement par `src/game/compare.ts`. Sans clé, il n'y a **aucun juge de repli** : l'étape bonus disparaît entièrement.
- **Tests par rôle et nom accessible uniquement.** Jamais de `data-testid`, de sélecteur de classe ni de snapshot.
- Changer la forme d'un enregistrement sauvegardé impose de monter son numéro de version.

## Le graphe de code (graphify)

```bash
graphify extract src --out .      # écrit graphify-out/graph.json, incrémental
```

Viser `src` et non la racine : la racine échoue, parce que le README, `docs/` et les images exigent une extraction sémantique, donc une clé de LLM. Un corpus de code seul n'en demande aucune. Les relances suivantes ne réextraient que les fichiers modifiés.

Le graphe remplace une exploration à l'aveugle, à condition de l'interroger avec **les identifiants du code** — fonctions suffixées de `()`, fichiers avec leur extension. Coûts mesurés :

| Commande | Sortie | Usage |
| --- | --- | --- |
| `graphify path "reduce()" "createJudge()"` | ~120 caractères | par où deux symboles se rejoignent |
| `graphify explain "reduce()"` | ~1 000 caractères | source, communauté, voisins directs |
| `graphify affected "reduce()"` | ~2 000 caractères | ce qui casse si on y touche |

Trois pièges, vérifiés :

- **`graphify query` en français ne marche pas.** Il fabrique ses nœuds de départ à partir des mots de la question et tombe sur des nœuds inexistants : 6 000 caractères de liste sans rapport. Poser la question avec les termes du code, et borner par `--budget 500`.
- **Ne jamais lire `graphify-out/graph.json`.** Le fichier pèse près de 900 000 caractères, soit environ 250 000 tokens — il se requête, il ne se lit pas.
- **Le graphe ignore les constantes et les valeurs.** `SCHEMA_VERSION` n'y figure pas ; ce genre de symbole se cherche au `grep`.

## Git

- Messages de commit **en français**, format Conventional Commits, une étape de plan = un commit.
- Remote `origin` : `git@github:fzed51/wheel-of-fortune.git`. L'URL sans `.com` est un **alias Host SSH du compte perso `fzed51`** — correcte, ne jamais la « corriger ».
- Ne jamais commiter sans demande explicite.
