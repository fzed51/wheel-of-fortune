# Recette manuelle au navigateur — prompt pour Claude in Chrome

Ce fichier contient le prompt à coller dans Claude in Chrome pour passer la recette
manuelle que le README liste dans « Ce qui n'est pas fait ». Il est écrit pour un
agent qui pilote un vrai navigateur : il n'a pas accès au code, seulement à la page.

> **Une partie est automatisée.** `yarn build && yarn check:browser` rejoue sans
> intervention la CSP, le service worker, le hors-ligne, le manifest, le lancer de la
> roue à la jauge de puissance et son animation, le clavier physique, le `<dialog>`
> natif et l'arbre d'accessibilité de Chrome — soit l'essentiel des scénarios 4, 5 et
> 9, et tout le scénario 10 sauf
> Lighthouse. Voir [`scripts/browser-check/README.md`](../scripts/browser-check/README.md).
> Ce prompt reste utile pour ce qu'une assertion ne sait pas juger : la lisibilité,
> le confort de jeu, un audit Lighthouse, une installation réelle sur un appareil.

## Avant de lancer

```bash
yarn dev          # http://localhost:5173/wheel-of-fortune/
```

Le `base` de Vite est `/wheel-of-fortune/` : l'URL de développement porte ce
sous-chemin, `http://localhost:5173/` seul renvoie une page vide.

Pour la partie PWA / CSP / service worker (section 9 du prompt), il faut un build :

```bash
yarn build && yarn preview   # http://localhost:4173/wheel-of-fortune/
```

Le service worker est désactivé en `yarn dev`, la CSP n'est injectée qu'au build :
ces deux points ne peuvent pas être vérifiés sur le serveur de développement.

## Clé d'API Mistral

Les scénarios 6 et 7 supposent une clé enregistrée. Utilisez une clé dédiée,
révocable, avec un plafond de dépense — elle sera stockée en clair dans le
localStorage, et l'agent aura la main sur la page. Le prompt lui interdit
explicitement de lire ou de recopier `wof:mistral-key:1`. Sans clé, sautez ces deux
scénarios : le reste du jeu est entièrement testable.

---

## Le prompt

> Tout ce qui suit est à coller tel quel dans Claude in Chrome.

---

Tu testes une application web locale : **La Roue de la Fortune**, un jeu d'énigmes à
lettres en français (React, PWA). Tu es le testeur manuel : tu ouvres l'application
dans l'onglet, tu joues, tu observes, et tu rends un rapport. Tu n'as pas accès au
code source et tu n'as pas à le demander.

**URL de départ : `http://localhost:5173/wheel-of-fortune/`**
(le sous-chemin `/wheel-of-fortune/` est obligatoire).

### Règles de conduite

- **N'écris jamais dans le code, ne lance aucune commande.** Tu agis uniquement dans
  la page : clics, frappes clavier, navigation, et lecture du DOM / de la console.
- **Ne lis jamais, ne recopie jamais, n'affiche jamais** la valeur de l'entrée de
  localStorage `wof:mistral-key:1`. Tu peux constater qu'elle existe ou non
  (`localStorage.getItem('wof:mistral-key:1') !== null`), rien de plus.
- **Ne quitte pas `localhost`.** Aucun site externe, aucune recherche web.
- Avant de conclure « ça ne marche pas », **retente une fois** : certaines actions
  attendent une animation (en mode jauge, charge ≈ 0,5 s puis rotation de roue
  ≈ 2,6 à 4,2 s ; en mode « lancer simple », rotation directe) ou un tour de bot
  (≈ 0,8 s).
- Note ce que tu **vois**, pas ce que tu supposes. Cite les libellés exacts.

### Vocabulaire de l'application

Écrans : Accueil `/`, Jeu `/jeu`, Résultats `/resultats`, Règles `/regles`,
Mes énigmes `/enigmes`, Réglages `/reglages` (tous préfixés par `/wheel-of-fortune`).

Noms accessibles que tu utiliseras (respecte-les au caractère près) :

- boutons de jeu : le bouton de lancer porte trois libellés possibles — `Lancer`
  au repos en mode jauge de puissance (le réglage par défaut), `Stop` pendant que
  la jauge charge, `Tourner` si le mode « lancer simple » est actif dans les
  Réglages — puis `Résoudre`, `Passer la main`, `Manche suivante` ;
- clavier virtuel : groupe `Clavier des lettres`, touches libellées `Lettre A`,
  ou `Lettre A, déjà proposée`, ou `Lettre A, indisponible` ;
- boîte « Résoudre » : titre `Proposer une réponse`, champ `Votre réponse`,
  boutons `Proposer` et `Annuler` ;
- thème : groupe `Thème`, boutons `Système`, `Clair`, `Sombre` ;
- accueil : champs `Nombre de manches`, `Adversaires`, `Niveau des bots`,
  bouton `Jouer` (ou `Repartir de zéro` si une partie est en cours) ;
- réglages : `Clé d’API Mistral`, `Afficher` / `Masquer`, `Enregistrer la clé`,
  `Tester la clé`, `Effacer la clé`, `Modèle`, `Effacer toutes les données` ;
- énigmes : `Énoncé`, `Catégorie`, `Ajouter l'énigme`, `Modifier`, `Supprimer`,
  `Exporter mes énigmes`, `Importer un fichier d’énigmes`.

Constantes du jeu : voyelle = 250 €, plancher de gain d'une manche = 500 €,
gains × numéro de manche (manche 1 = ×1, manche 2 = ×2…), 1 à 10 manches,
0 à 3 adversaires.

Les montants s'écrivent en toutes lettres dans les phrases du jeu : `cagnotte 0 euro`,
`La roue s'arrête sur 750 euros`, avec une espace insécable pour les milliers
(`1 300 euros`). Ne cherche pas le symbole `€` : il n'apparaît que sur l'écran des
résultats.

---

## Scénarios

Exécute-les dans l'ordre. Chacun a un résultat attendu : dis pour chacun **conforme**
ou **écart**, avec ce que tu as observé.

### 1. Accueil et navigation

1. Ouvre l'URL de départ. La page doit s'afficher avec le titre `La Roue de la Fortune`
   en en-tête et une phrase d'introduction.
2. Si aucune clé d'API n'est enregistrée, une carte `Aucune clé d’API enregistrée`
   doit être visible, avec un lien `Enregistrer une clé dans les réglages`.
   Elle doit dire que le jeu reste jouable sans clé.
3. Appuie sur `Tab` depuis le haut de page : le tout premier arrêt doit être un lien
   `Aller au contenu`, invisible jusqu'à ce qu'il reçoive le focus.
4. Visite `Règles`, `Mes énigmes`, `Réglages` via la navigation `Autres écrans`,
   puis reviens à l'accueil par le titre de l'en-tête à chaque fois.
5. Va sur `/wheel-of-fortune/nimportequoi` : une page « introuvable » doit s'afficher,
   pas une erreur ni une page blanche.
6. Va sur `/wheel-of-fortune/jeu` sans avoir lancé de partie : tu dois être renvoyé
   vers l'accueil, jamais rester sur un écran de jeu vide.

### 2. Réglages de partie et démarrage

1. Sur l'accueil, mets `Nombre de manches` à `2` et `Adversaires` à `1`,
   `Niveau des bots` sur `Normal`.
2. Essaie de saisir `99` dans `Nombre de manches` puis lance une partie : la partie
   doit démarrer avec au plus 10 manches (l'en-tête de l'écran de jeu l'indique :
   `Manche 1 sur …`). Même contrôle avec `Adversaires` à `9` → 3 au maximum.
3. Remets 2 manches / 1 adversaire, clique `Jouer`. Tu dois arriver sur `/jeu`.

### 3. Une manche complète au clavier virtuel

1. L'en-tête doit afficher `Manche 1 sur 2 — gains ×1` et
   `Au tour de Vous — cagnotte 0 euro`.
2. Clique `Lancer`. Une jauge de puissance apparaît au-dessus des boutons et balaie
   d'un bord à l'autre ; le bouton devient `Stop`. Laisse-la charger environ une
   demi-seconde, puis clique `Stop` : la roue s'anime alors (≈ 2,6 à 4,2 s selon la
   force figée). Pendant la charge puis l'animation, le bouton de lancer, `Résoudre`
   et `Passer la main` doivent porter `aria-disabled="true"`.
3. À l'arrêt, un encadré de retour doit afficher une phrase du type
   `La roue s'arrête sur 500 euros.`, `Banqueroute…` ou `Passe…`.
   Après un arrêt sur un montant, les trois boutons **restent** inertes : le jeu
   attend une consonne, et seules les touches du clavier sont jouables. Ce n'est
   pas un blocage. Ils redeviennent actifs après `Banqueroute` ou `Passe`.
4. Si la roue s'est arrêtée sur un montant, propose une consonne : clique une touche
   du `Clavier des lettres` (par exemple `Lettre S`). Deux cas attendus :
   - lettre présente : les cases correspondantes se retournent sur le plateau, la
     cagnotte augmente de `valeur du segment × nombre d'occurrences × 1`, et c'est
     encore à toi ;
   - lettre absente : le message le dit et la main passe (au bot, ou à toi si tu es seul).
5. Vérifie qu'une touche déjà jouée devient `Lettre X, déjà proposée` et qu'un
   nouveau clic dessus ne fait rien.
6. Quand ta cagnotte atteint 250 €, clique directement une **voyelle** sur le clavier
   (il n'y a pas de bouton « acheter une voyelle »). La cagnotte doit baisser de 250 €
   et la voyelle se révéler si elle est présente. Tant que la cagnotte est sous 250 €,
   les voyelles doivent être `Lettre X, indisponible`.
7. Laisse le bot jouer un tour au moins : pendant son tour, aucune touche ne doit être
   `disponible` et les trois boutons doivent être inertes.

### 4. Clavier physique

Sur l'écran de jeu, sans focus dans un champ :

1. Tape une lettre au clavier : elle doit s'allumer brièvement sur le clavier virtuel
   et jouer exactement comme un clic.
2. Appuie sur `Espace` (avec le focus sur le corps de page, pas sur un bouton) :
   en mode jauge de puissance, un premier appui arme la jauge et un second la
   fige, ce qui lance la roue ; en mode « lancer simple », un seul appui suffit.
3. Appuie sur `Entrée` : la boîte `Proposer une réponse` doit s'ouvrir — **sauf** si
   aucune clé d'API n'est enregistrée, auquel cas rien ne doit se passer.
4. Ouvre la boîte, tape une lettre dans le champ `Votre réponse` : la lettre doit
   s'écrire dans le champ et **ne pas** être jouée sur le plateau.
5. Ferme par `Échap` : la boîte se ferme et le focus revient sur `Résoudre`.

### 5. Boutons inertes et accessibilité

1. Dans le DOM, **aucun** bouton de l'application ne doit porter l'attribut natif
   `disabled`. Cherche `button[disabled]` : le résultat attendu est zéro.
   Les boutons inactifs portent `aria-disabled="true"` et gardent le focus.
2. Compte les live regions : exactement **une** `role="status"` (ou `aria-live="polite"`)
   au niveau du layout racine pour le déroulement du jeu, et **une** `role="alert"`.
   Les écrans Réglages et Mes énigmes ont chacun leur propre `aria-live="polite"`
   local : ils ne comptent pas comme une troisième région de jeu, mais signale si tu
   en vois d'autres sur l'écran de jeu.
3. Clavier virtuel en roving tabindex : depuis le plateau, une **seule** tabulation
   doit entrer dans le clavier (pas 26). Une fois dedans, les flèches déplacent le
   focus de touche en touche.
4. La grille de l'énigme doit être `aria-hidden` et doublée d'un texte lisible par
   lecteur d'écran qui **épelle** la réponse partielle (`L, A, blanc, C…`), jamais la
   lit comme un mot. Vérifie sa présence dans le DOM.
5. Le SVG de la roue doit être `aria-hidden`.
6. Zoom : la balise `viewport` ne doit contenir ni `maximum-scale` ni `user-scalable=no`.
7. Active `prefers-reduced-motion: reduce` (DevTools → Rendering → Emulate CSS media
   feature). Clique `Lancer` puis `Stop` : la roue ne doit **pas** s'animer, mais le
   tour doit se dérouler normalement (résultat annoncé, consonne demandée). La jauge
   de puissance, elle, continue de balayer pendant la charge — simplement ralentie
   (≈ ×2,5) — donc un contrôle qui compterait toute animation de la page n'en verrait
   pas zéro : seule la roue doit rester immobile. Remets le réglage après.

### 6. Résoudre — sans clé, puis avec clé

**Sans clé enregistrée :**

1. Le bouton `Résoudre` doit être visible mais inerte (`aria-disabled="true"`), et une
   phrase sous les boutons doit dire
   `Configurez une clé d'API dans les Réglages pour proposer une réponse.`
2. Le bouton doit rester atteignable au `Tab` malgré son état inerte.

**Avec clé** (à ne faire que si l'utilisateur t'a dit qu'une clé était enregistrée) :

3. `Résoudre` s'active pendant ton tour. Ouvre la boîte : elle rappelle la catégorie.
4. Soumets le champ **vide** : le message `Tapez une réponse avant de la proposer.`
   doit s'afficher, et rien ne doit partir.
5. Soumets une réponse volontairement fausse et sans rapport : le verdict doit être
   « incorrect » et arriver **immédiatement**, sans appel réseau (un pré-filtre local
   tranche les cas évidents). Vérifie dans l'onglet Réseau qu'aucune requête vers
   `api.mistral.ai` n'est partie.
6. Soumets la bonne réponse **sans les accents et en minuscules** : elle doit être
   acceptée. Même chose avec une majuscule en trop ou un espace de bord.
7. Pendant l'attente d'un verdict, le bouton `Annuler` doit disparaître et `Échap` ne
   doit pas fermer la boîte.

### 7. Sécurité de la clé d'API

1. Va dans `Réglages`. Un avertissement visible doit dire que la clé est stockée
   **en clair** et que le stockage d'une PWA iOS diffère de celui de Safari.
2. Si une clé est enregistrée, l'écran doit l'évoquer par ses **4 derniers caractères
   seulement**, précédés de points de suspension. Vérifie qu'on n'en voit pas plus.
3. Le champ de saisie doit être de type `password` par défaut, et `Afficher` doit le
   basculer en clair.
4. Ouvre l'onglet Réseau, filtre sur `mistral`, et déclenche `Tester la clé` :
   la clé doit voyager dans un **en-tête**, jamais dans l'URL. Rapporte uniquement
   « en-tête » ou « URL », **sans recopier la valeur**.
5. Clique `Tester la clé` deux fois de suite très vite : le second clic doit être
   ignoré pendant ≈ 2 secondes.
6. Console : aucune trace de la clé, aucune `Request` ni `Headers` journalisée.
   Rapporte seulement le constat, pas le contenu.
7. Va sur `Mes énigmes`, clique `Exporter mes énigmes` (crée-en une d'abord si besoin)
   et **ouvre le fichier téléchargé** : il ne doit contenir que des énigmes. Ni clé,
   ni réglages, ni partie en cours.

### 8. Éditeur d'énigmes perso

Sur `/enigmes` :

1. Saisis `ABC` comme `Énoncé`, quitte le champ : le message `Au moins 10 caractères.`
   doit apparaître.
2. Saisis `LA CLE EST SOUS LE PAILLASSON 123` : un message doit lister les caractères
   refusés (`1, 2, 3`) et rappeler ce qui est accepté.
3. Saisis un énoncé de plus de 42 caractères : message de longueur maximale.
4. Saisis un énoncé pauvre en voyelles ou en consonnes (moins de 2 voyelles distinctes
   ou moins de 3 consonnes distinctes) : les messages correspondants doivent sortir.
5. Saisis `mon voisin   repeint sa barrière` en minuscules avec des espaces multiples :
   une ligne `Sera enregistré : MON VOISIN REPEINT SA BARRIÈRE` doit prévisualiser la
   normalisation, **sans** retoucher le champ pendant la frappe.
   (N'utilise pas `LA CLÉ EST SOUS LE PAILLASSON` comme énigme d'essai : elle est
   déjà dans le catalogue embarqué, et l'ajout sera refusé comme doublon.)
6. Enregistre-la, puis tente de saisir la **même** énigme : `Cette énigme existe déjà.`
7. Clique `Modifier` sur une énigme : le formulaire se remplit, un message annonce la
   modification en cours, et `Annuler` doit apparaître.
8. Clique `Supprimer` : une confirmation doit s'afficher **dans la ligne** (pas de
   fenêtre native du navigateur). Annule, puis recommence et confirme.
9. Exporte, puis réimporte le même fichier : le compte rendu doit annoncer
   `0 énigme ajoutée, 1 déjà présente.` (ou l'équivalent selon le nombre).
10. Importe un fichier qui n'est pas du JSON (n'importe quel `.txt` renommé) :
    le message doit dire que le fichier n'est pas lisible, sans casser l'écran.

### 9. Persistance, thème, fin de partie

1. Lance une partie, joue deux ou trois coups, **recharge la page** : l'accueil doit
   proposer une carte `Partie en cours` avec un lien `Reprendre`, et la manche reprise
   doit être dans le même état (lettres déjà sorties, cagnotte, joueur courant).
2. Bascule le thème sur `Sombre` : la page change immédiatement, le bouton actif porte
   `aria-pressed="true"`. Recharge : le thème doit tenir, **sans clignotement clair**
   au chargement.
3. Termine une partie complète (2 manches, c'est rapide en résolvant ou en devinant) :
   tu dois arriver sur `/resultats` avec `Vainqueur` (ou `Égalité`) et un classement
   trié. Le lien `Retour à l’accueil` doit fonctionner.
4. Reviens sur `/resultats` alors qu'une nouvelle partie est en cours : tu dois être
   renvoyé sur `/jeu`.
5. Vérifie les entrées de localStorage présentes : `wof:settings:1`, `wof:puzzles:1`,
   `wof:save:1`, `wof:mistral-key:1`. Aucune autre clé `wof:` ne doit exister.
6. Réglages → `Effacer toutes les données` → `Confirmer l’effacement` : la page se
   recharge et **toutes** les entrées ci-dessus doivent avoir disparu.

### 10. Build de production (uniquement si l'utilisateur a lancé `yarn preview`)

Sur `http://localhost:4173/wheel-of-fortune/` :

1. Une balise `<meta http-equiv="Content-Security-Policy">` doit être présente dans
   le HTML (elle est absente en développement, c'est normal).
2. Joue un tour complet et surveille la console : **aucune violation CSP**. Si une
   apparaît, cite le message exact et l'action qui l'a déclenchée.
3. La roue doit garder son angle d'arrêt après l'animation (elle ne doit pas revenir
   brutalement à zéro) : c'est le point que la CSP casse en premier.
4. Onglet Application : un service worker doit être **actif**, et le manifest doit
   déclarer `start_url` et `scope` à `/wheel-of-fortune/`. Le navigateur doit proposer
   l'installation.
5. Onglet Réseau, filtre `mistral` : aucune réponse ne doit venir du service worker
   (colonne « Size » ne doit pas indiquer `ServiceWorker`).
6. Passe l'onglet hors ligne (DevTools → Network → Offline) et recharge : l'application
   doit se charger et rester jouable lettre par lettre.
7. Lance un audit Lighthouse (Performance, Accessibilité, Bonnes pratiques, PWA) en
   mode mobile et rapporte les quatre scores plus les points échoués en accessibilité.

---

## Ce que tu rends

Un rapport en français, dans cet ordre :

1. **Tableau de synthèse** : une ligne par scénario (1 à 10), colonne `conforme` /
   `écart` / `non testé`, plus une raison en une ligne quand ce n'est pas conforme.
2. **Les écarts en détail**, un par un : ce que tu attendais, ce que tu as vu, comment
   le reproduire en trois étapes maximum, et la gravité que tu lui donnes
   (bloquant / gênant / cosmétique).
3. **Console et réseau** : toute erreur ou avertissement rencontré, cité tel quel.
4. **Ce que tu n'as pas pu tester**, et pourquoi.

Ne propose pas de correctif dans le code : tu ne l'as pas vu. Décris le symptôme.
