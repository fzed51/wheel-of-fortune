# Fiches de test manuel

Ce dossier est versionné : les fiches servent une première recette, puis les campagnes
de non-régression suivantes. Elles se rejouent à l'identique, campagne après campagne.

| Fichier | Rôle |
| --- | --- |
| [`recette-manuelle.html`](recette-manuelle.html) | Douze scénarios, soixante-dix étapes, cases à cocher et compte rendu copiable |
| `rapports/` | Les comptes rendus des campagnes passées, un fichier par campagne |

## Passer une campagne

Ouvrir le fichier dans un navigateur — un double-clic suffit, il est autonome et
fonctionne hors ligne :

```bash
open docs/tests/recette-manuelle.html
```

Remplir le contexte (date, origine, commit, appareil, navigateur), puis cocher chaque
étape : **conforme**, **écart** ou **non testé**. Un écart demande une note : c'est
elle qui sera exploitable ensuite, l'attendu étant déjà écrit dans la fiche.

La progression est enregistrée dans le `localStorage` du navigateur qui affiche la
page. On peut fermer l'onglet et reprendre plus tard, mais **une campagne se termine
sur le même navigateur que celui où elle a commencé**.

À la fin, « Générer » puis « Copier » produit un compte rendu Markdown : contexte,
synthèse par scénario, écarts détaillés, observations et liste de ce qui n'a pas été
testé. C'est ce texte qu'on donne à Claude Code pour corriger.

## Archiver une campagne

Coller le compte rendu dans `docs/tests/rapports/AAAA-MM-JJ-<contexte>.md`, par
exemple `2026-08-12-iphone-13-safari.md`. Deux campagnes sur deux appareils le même
jour font deux fichiers. C'est ce qui permet de comparer une régression à l'état
constaté la fois précédente.

## Quand rejouer

- avant une mise en ligne qui touche la PWA, le service worker, le manifest ou la CSP ;
- après un changement du côté de `src/llm/` ou de l'étape bonus ;
- après un rééquilibrage de la roue ou un changement de barème ;
- après un changement du geste de lancer (arc de visée, mode simple, imprécision) ;
- après un changement de thème, de couleurs ou de classes partagées ;
- au moins une fois par version installée réellement sur un appareil.

Sur une campagne ciblée, cocher « non testé » sur les scénarios hors sujet : le compte
rendu les listera comme tels, sans les faire passer pour conformes.

## Ce que ces fiches ne rejouent pas, exprès

Les règles du jeu, la validation de l'éditeur, la navigation et les bornes des
réglages sont couvertes en jsdom, plus vite et plus solidement. La CSP, le thème avant
premier rendu, l'animation de la roue, le lancer à l'arc de visée et le mode
« lancer simple », `prefers-reduced-motion`, l'estompage des boutons inertes, l'arbre
d'accessibilité, les live regions, le clavier physique, le `<dialog>` natif, l'export
sous CSP, le manifest, le service worker et le hors-ligne sont couverts par les
dix-sept contrôles de
[`scripts/browser-check/README.md`](../../scripts/browser-check/README.md).

Ne restent ici que les contrôles hors de portée de l'outillage : une vraie clé d'API,
une installation réelle, deux builds successifs, un audit Lighthouse, un passage axe,
et tout ce que seul l'œil juge.

**Règle de maintenance** : le jour où une étape devient automatisable, elle part dans
`scripts/browser-check/check.mjs` et **disparaît de la fiche**. Une fiche qui double un
automate ne se joue plus, et une fiche qu'on ne joue plus ment.

## Voir aussi

[`docs/test-claude-in-chrome.md`](../test-claude-in-chrome.md) — le prompt de recette
destiné à un agent qui pilote un navigateur. **Il est périmé sur deux points** : il
annonce « Résoudre » inerte sans clé d'API, alors que le verdict est tranché
localement depuis le commit `9921c16`, et il ignore l'étape « Question bonus » ajoutée
par `28ad645`. Les fiches de ce dossier font foi.
