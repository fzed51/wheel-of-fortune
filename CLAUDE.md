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

## La recette manuelle (`docs/tests/`)

`docs/tests/recette-manuelle.html` porte les contrôles qu'aucun automate ne joue : une vraie clé d'API, une installation réelle, deux builds successifs, un audit Lighthouse, un passage axe, et tout ce que seul l'œil juge. C'est une page autonome, cochable, qui produit un compte rendu Markdown copiable. Le mode d'emploi complet vit dans `docs/tests/README.md` — ne pas le recopier ici.

**Après toute modification qui touche une zone couverte, demander à l'utilisateur de passer les scénarios concernés**, en les nommant par leur numéro. Le dire au moment de rendre le travail, avec les portes de validation ; ne pas le garder pour soi sous prétexte que les tests unitaires passent. C'est justement ce que Vitest ne voit pas.

| Zone modifiée | Scénarios à rejouer |
| --- | --- |
| `src/llm/`, `src/components/BonusQuestion/`, l'étape bonus de `src/hooks/useGameEffects.ts`, la partie clé de `src/routes/SettingsRoute.tsx` | S2, S3, S4 |
| `vite.config.ts`, `pwa-assets.config.ts`, `public/`, `src/components/UpdatePrompt/` | S5, S6, S7 |
| `src/components/classes.ts`, les couleurs Tailwind, `public/theme-init.js`, `src/components/Wheel/` | S9 |
| `src/game/wheel.ts`, `src/game/setup.ts` (barème, montants) | S1, S9 |
| `src/storage/`, `SCHEMA_VERSION` | S10, S11 |
| `src/components/PuzzleEditor/`, `src/data/puzzles/` | S11 |
| Une route, un écran, un nom accessible | S8 |

Règles d'entretien des fiches :

- **Un libellé, un montant ou un parcours cité par une fiche qui change dans le code change dans la fiche, au même commit.** Une fiche qui décrit l'application d'avant fait échouer une campagne pour rien, et use la confiance dans le support.
- **Ne jamais écrire un attendu sans l'avoir vérifié dans le code.** Chaque étape cite des libellés réels ; un attendu inventé transforme une campagne en chasse au fantôme. C'est la même règle que pour les briefs de sous-agents.
- **Une étape devenue automatisable part dans `scripts/browser-check/check.mjs` et disparaît de la fiche.** Doubler un automate ne teste rien de plus et allonge une campagne que personne ne passera.
- **Ne jamais cocher les cases ni rédiger un compte rendu à la place de l'utilisateur.** Une campagne se joue devant un vrai navigateur, sur un vrai appareil.
- Quand l'utilisateur colle un compte rendu : traiter les écarts, puis proposer de l'archiver dans `docs/tests/rapports/AAAA-MM-JJ-<contexte>.md`.

## Le code passe par des sous-agents

Découper chaque tâche en zones de fichiers bornées et **disjointes**, puis les confier à l'agent `frontend-dev` (`.claude/agents/frontend-dev.md`, modèle Sonnet imposé). Ne pas écrire le code depuis le fil principal : son contexte est la ressource rare.

- Jamais deux tâches parallèles sur des zones qui se recouvrent.
- Les sous-agents ne commitent pas. Le fil principal garde l'ordonnancement, les portes finales et le commit.
- **Ne jamais affirmer un fait technique dans un brief sans l'avoir vérifié** : un fait faux se propage jusque dans les commentaires du code produit.
- Exiger de chaque agent qu'il dise **ce qu'il casserait pour faire rougir chacun de ses tests**. C'est ce qui révèle les tests complaisants.
- Un agent peut mourir en vol (erreur d'API, watchdog). Si un rapport manque, **relire le diff de sa zone** avant de la considérer perdue : le travail est souvent déjà là.
- Le contenu inventé (énigmes, questions) s'écrit dans le fil principal, validé par un fichier de test jetable qui passe les candidats par les vraies fonctions du dépôt.

### Économiser le contexte du fil principal

Le contexte du fil principal est la ressource rare du projet : c'est lui qui porte le plan, l'ordonnancement des vagues et les décisions déjà prises. Une fois plein, tout cela se perd dans un résumé. Le contexte d'un sous-agent, lui, est jetable — il meurt avec sa tâche. **Donc tout ce qui peut être lu par un sous-agent doit l'être.**

- **Ne pas relire le diff produit par un sous-agent.** Son rapport, `git status --short` et `git diff --stat` suffisent à contrôler que la zone est respectée. Ne descendre dans le diff que sur un point précis que le rapport laisse douteux.
- **Lire par extraits, pas par fichiers entiers.** `grep -n` avec du contexte, ou `sed -n 'a,bp'`, quand seules quelques lignes servent à vérifier un fait de brief. Lire un fichier en entier se justifie quand il est court ou qu'il faut vraiment le comprendre.
- **Ne jamais lire le fichier de sortie JSONL d'un sous-agent** : c'est sa transcription complète, elle noie le contexte à elle seule.
- **Écrire des briefs auto-suffisants.** Un brief qui contient les faits déjà vérifiés et le code à écrire évite au sous-agent une exploration — et évite au fil principal de la refaire pour la lui expliquer.
- **Déléguer l'investigation bruyante** (balayage `grep` large, lecture de journaux, recherche à l'aveugle) à un sous-agent, et ne garder que ses conclusions.
- Les portes finales (`yarn lint && yarn test && yarn build`) se relancent depuis le fil principal, mais en n'en gardant que la fin (`| tail -8`) : la sortie complète de Vitest ne dit rien de plus que son décompte.

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
graphify update .        # met le graphe à jour, incrémental, sans clé d'API
```

Un graphe de 802 nœuds et 2273 arêtes couvre **tout le dépôt** — `src/`, mais aussi `scripts/browser-check/`, les `tsconfig`, `package.json` et `public/theme-init.js`. Il est reconstruit automatiquement par les hooks git après chaque commit et chaque changement de branche ; `graphify update .` n'est à lancer à la main qu'après des modifications non commitées.

Le graphe remplace une exploration à l'aveugle, à condition de l'interroger avec **les identifiants du code** — fonctions suffixées de `()`, fichiers avec leur extension. Coûts mesurés :

| Commande | Sortie | Usage |
| --- | --- | --- |
| `graphify path "reduce()" "createJudge()"` | ~120 caractères | par où deux symboles se rejoignent |
| `graphify explain "reduce()"` | ~1 000 caractères | source, communauté, voisins directs |
| `graphify affected "reduce()"` | ~2 000 caractères | ce qui casse si on y touche |

`graphify-out/GRAPH_REPORT.md` (~8 600 caractères) ne vaut d'être lu que pour sa liste des nœuds les plus connectés — `Puzzle` à 32 arêtes, `reduce()` à 31, ce qui nomme les vraies abstractions du projet. La moitié du fichier est une liste de « Community N » sans nom : les communautés ne se nomment qu'avec une clé de LLM, qu'aucun backend supporté ne trouve ici.

Quatre pièges, tous vérifiés :

- **`graphify query` est à éviter.** Il fabrique ses nœuds de départ à partir des mots de la question ; posée en français, elle part sur des nœuds inexistants et rend 6 000 caractères de liste sans rapport. À la rigueur, avec les termes du code et `--budget 500`.
- **Ne jamais lire `graphify-out/graph.json`.** Plus de 900 000 caractères, soit environ 260 000 tokens — il se requête, il ne se lit pas.
- **Le graphe ignore les constantes et les valeurs.** `SCHEMA_VERSION` n'y figure pas ; ce genre de symbole se cherche au `grep`.
- **`graphify extract` à la racine échoue**, faute de clé pour l'extraction sémantique du README, de `docs/` et des images. `graphify update` n'a pas ce défaut : il ne fait que de l'AST. Et **ne jamais viser un sous-dossier** (`graphify update src`) : la sortie est écrite dans `src/graphify-out/`, au milieu du code.

## Git

- Messages de commit **en français**, format Conventional Commits, une étape de plan = un commit.
- Remote `origin` : `git@github:fzed51/wheel-of-fortune.git`. L'URL sans `.com` est un **alias Host SSH du compte perso `fzed51`** — correcte, ne jamais la « corriger ».
- Ne jamais commiter sans demande explicite.
