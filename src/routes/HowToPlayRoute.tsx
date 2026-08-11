import { CARD } from '../components/classes'
import { formatEuros } from '../game/announce'
import { BONUS_PRIZE, MAX_OPPONENTS, MAX_ROUNDS, MIN_ROUNDS, MIN_ROUND_PRIZE, VOWEL_COST } from '../game/setup'
import { BANKRUPT_COUNT, PASS_COUNT, SEGMENT_COUNT, ZERO_COUNT } from '../game/wheel'

/**
 * Règles du jeu. Écran purement documentaire : aucune valeur n'y est écrite en
 * dur quand une constante existe déjà côté moteur, pour qu'une règle changée
 * dans `game/` ne laisse jamais ce texte mentir.
 */
export default function HowToPlayRoute() {
  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="font-semibold text-fg">En bref</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-fg-muted">
          <li>Visez avec l’arc qui tourne autour de la roue, lancez, puis proposez une consonne.</li>
          <li>Chaque occurrence rapporte la valeur du segment, multipliée par le multiplicateur de la manche.</li>
          {/* Phrase interpolée d'un bloc, et non coupée autour de `formatEuros` :
              une valeur interpolée au milieu du JSX devient un nœud texte à part,
              qu'un `getByText` ne recolle pas avec ses voisins. */}
          <li>
            {`Une voyelle coûte ${formatEuros(VOWEL_COST)} et ne rapporte rien : elle s’achète en appuyant directement sur sa touche, il n’y a pas de bouton dédié.`}
          </li>
          <li>Banqueroute vide votre cagnotte de manche, Passe fait seulement passer la main.</li>
          <li>
            Résoudre compare votre réponse à la solution, localement et instantanément : aucun
            réseau, aucune clé d’API n’est nécessaire.
          </li>
        </ul>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Déroulement d’un tour</h2>
        <p className="mt-2 text-fg-muted">
          Le joueur dont c’est le tour vise avec l’arc qui tourne autour de la roue, puis lance.
          Si elle s’arrête sur un montant, il propose une consonne parmi celles jamais tentées.
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-fg-muted">
          <li>La consonne est présente dans la réponse : le gain est crédité et le même joueur rejoue, roue comprise.</li>
          <li>La consonne est absente : la main passe au joueur suivant.</li>
        </ul>
        <p className="mt-2 text-fg-muted">
          Avant de lancer la roue, il est aussi possible d’acheter une voyelle ou de tenter de
          résoudre l’énigme, quand ces actions sont disponibles.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Lancer la roue</h2>
        <p className="mt-2 text-fg-muted">
          Le lancer se joue en deux temps. Un premier appui sur « Lancer » arme un arc qui tourne
          autour de la roue, en aller-retour ; le bouton s’appelle alors « Stop ». Un second appui
          le fige : la roue s’arrêtera quelque part dans cet arc, à l’erreur du hasard près.
        </p>
        <p className="mt-2 text-fg-muted">
          La case obtenue est celle qui se trouve sous l’aiguille quand la roue s’arrête — ce
          n’est pas une case tirée au sort puis simplement animée. L’arc fait deux cases de large :
          c’est exactement l’imprécision du lancer. Viser une case ne garantit donc jamais de
          l’obtenir, la case voisine reste toujours possible. Et dès qu’il est figé, l’arc
          disparaît : rien n’indique, ni avant ni pendant la rotation, la case visée ni le
          résultat à venir.
        </p>
        <p className="mt-2 text-fg-muted">
          Au clavier physique, Espace suit exactement le bouton : un premier appui arme l’arc, un
          second le fige — deux appuis, donc, pour un seul lancer.
        </p>
        <p className="mt-2 text-fg-muted">
          Les Réglages proposent aussi un mode « Lancer simple (sans arc de visée) », dans
          la section « Lancer de la roue ». Le bouton s’y appelle alors « Tourner » : un seul clic
          ou un seul appui sur Espace suffit, et l’angle visé est tiré au hasard. Sous mouvement
          réduit, l’arc continue de balayer, seulement ralenti, plutôt que de disparaître — c’est
          ce mode « lancer simple » qui sert de vrai repli à qui ne veut aucun mouvement à
          l’écran.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Les lettres</h2>
        <h3 className="mt-2 font-medium text-fg">Consonnes</h3>
        <p className="mt-1 text-fg-muted">
          Gratuites. Chaque occurrence dans la réponse rapporte la valeur du segment sur lequel la
          roue s’est arrêtée, multipliée par le multiplicateur de la manche en cours.
        </p>
        <h3 className="mt-3 font-medium text-fg">Voyelles</h3>
        <p className="mt-1 text-fg-muted">
          Une voyelle coûte {formatEuros(VOWEL_COST)}, prélevés sur la cagnotte du joueur qu’elle
          soit présente ou non dans la réponse — elle ne rapporte jamais d’argent, seulement de
          l’information. Elle ne se propose pas comme une consonne : <strong>appuyez directement
          sur la lettre</strong>, au clavier virtuel ou physique, pour l’acheter. L’achat n’est
          possible que si la cagnotte du joueur couvre le prix et qu’il reste au moins une voyelle
          jamais tentée.
        </p>
        <p className="mt-1 text-fg-muted">
          Dans les deux cas, si la lettre trouvée termine la réponse, la manche est gagnée aussitôt ;
          sinon la main reste au même joueur si la voyelle était présente, et passe au suivant si
          elle ne l’était pas.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Les cases spéciales</h2>
        <p className="mt-2 text-fg-muted">
          La roue compte {SEGMENT_COUNT} cases, dont {BANKRUPT_COUNT} Banqueroute, {PASS_COUNT}{' '}
          Passe et {ZERO_COUNT} case à 0 € ; les autres portent un montant strictement positif.
        </p>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-fg-muted">
          <li>
            <strong>Banqueroute</strong> : la cagnotte de manche du joueur qui vient de tourner est
            immédiatement remise à zéro, et la main passe au joueur suivant.
          </li>
          <li>
            <strong>Passe</strong> : la cagnotte ne change pas, seule la main passe au joueur
            suivant.
          </li>
          <li>
            <strong>Case à 0 €</strong> : le joueur propose quand même une consonne et la lettre
            est révélée si elle est présente, mais aucun gain n’est crédité. Contrairement à
            Passe, la main <strong>ne change pas</strong> : le même joueur rejoue aussitôt, roue
            comprise.
          </li>
        </ul>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Fin de manche, gains et multiplicateur</h2>
        <p className="mt-2 text-fg-muted">
          Une manche se termine dès que la dernière lettre manquante est révélée — par une
          consonne ou une voyelle, sans qu’il soit besoin de passer par Résoudre — ou dès qu’une
          tentative envoyée par Résoudre est jugée correcte.
        </p>
        <p className="mt-2 text-fg-muted">
          Le gain reporté au score total est le plus grand entre la cagnotte accumulée pendant la
          manche et un plancher de {formatEuros(MIN_ROUND_PRIZE)} : une manche remportée surtout
          grâce à des voyelles rapporte donc toujours quelque chose.
        </p>
        <p className="mt-2 text-fg-muted">
          Le multiplicateur de la manche vaut son numéro : la manche 1 multiplie les gains de
          consonne par ×1, la manche 2 par ×2, et ainsi de suite. Il ne s’applique ni au prix
          d’une voyelle ni au plancher de gain. Le nombre de manches d’une partie (entre{' '}
          {MIN_ROUNDS} et {MAX_ROUNDS}) et le nombre d’adversaires (jusqu’à {MAX_OPPONENTS}) se
          choisissent avant de lancer la partie.
        </p>
        <p className="mt-2 text-fg-muted">
          La manche finale porte une énigme un peu différente : sa catégorie affichée est{' '}
          <strong>Question</strong>, et l’énoncé prend la forme d’une question plutôt que d’un mot
          ou d’une expression. Elle se joue en tout point comme les autres manches — roue,
          consonnes, voyelles et Résoudre fonctionnent à l’identique.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Question bonus de la manche finale</h2>
        <p className="mt-2 text-fg-muted">
          Une fois la manche finale remportée, le gagnant peut tenter de répondre à sa question
          pour {formatEuros(BONUS_PRIZE)} fixes. Ce montant est un forfait : il n’est jamais
          multiplié par le multiplicateur de la manche, et il est versé directement au score
          total. Il peut donc créer une égalité ou en défaire une — le classement final n’est
          calculé qu’après cette étape.
        </p>
        <p className="mt-2 text-fg-muted">
          Cette étape ne s’ouvre que si une clé d’API Mistral est enregistrée dans les Réglages.{' '}
          <strong>Sans clé, la partie va directement aux résultats après la manche finale</strong> :
          le reste du jeu, lui, se joue entièrement sans connexion, du premier tour au dernier.
        </p>
        <p className="mt-2 text-fg-muted">
          Le verdict de cette seule question est jugé par un modèle de langage, parce qu’une
          simple comparaison de texte ne suffit pas à reconnaître qu’« c’est Canberra » ou « la
          ville de Canberra » répondent aussi bien que « Canberra » tout court. Un juge injoignable
          n’est jamais compté comme une mauvaise réponse : la réponse peut être retapée sans
          pénalité, ou le bouton « Passer » permet d’y renoncer et d’aller directement aux
          résultats.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Résoudre</h2>
        <p className="mt-2 text-fg-muted">
          Le bouton « Résoudre » ouvre une boîte pour taper la réponse complète de l’énigme. Le
          verdict est calculé instantanément par le jeu lui-même, en comparant localement le texte
          tapé à la solution : aucun réseau, aucune clé d’API n’intervient.
        </p>
        <p className="mt-2 text-fg-muted">
          La comparaison ignore la casse, les accents et toute ponctuation ou espace :{' '}
          <strong>LA CLÉ</strong>, <strong>la cle</strong> et <strong>LACLE</strong> sont tous
          acceptés, tout comme <strong>CŒUR</strong> proposé en <strong>coeur</strong>.
        </p>
        <p className="mt-2 text-fg-muted">
          En revanche l’égalité doit être stricte sur les lettres et chiffres qui restent :{' '}
          <strong>LES CLÉS</strong> est refusé pour <strong>LA CLÉ</strong>, aucune lettre en trop
          ou en moins n’est rattrapée.
        </p>
        <p className="mt-2 text-fg-muted">
          Une réponse fausse fait passer la main au joueur suivant, mais la cagnotte de la manche
          est conservée : une tentative n’est pas un renoncement.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Quand plus personne ne peut jouer</h2>
        <p className="mt-2 text-fg-muted">
          « Passer la main » n’apparaît disponible que lorsque le joueur courant n’a plus de
          consonne à proposer et ne peut s’offrir aucune voyelle. Résoudre, lui, reste toujours
          accessible : comparer une réponse tapée à la solution ne dépend jamais de la cagnotte ni
          des lettres restantes.
        </p>
        <p className="mt-2 text-fg-muted">
          Si tous les joueurs passent ainsi d’affilée, sans qu’aucune autre action ne s’intercale,
          la manche est bloquée : elle est annulée au passage à la manche suivante, la réponse est
          révélée et personne ne touche de gain pour cette manche. Toute action qui fait avancer
          la manche — une tentative de résolution comprise, même ratée — remet ce compte à zéro.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Au clavier physique</h2>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-fg-muted">
          <li>Une lettre (accentuée ou non) propose la consonne ou achète la voyelle correspondante.</li>
          <li>Espace lance la roue : un premier appui arme l’arc de visée, un second le fige.</li>
          <li>Entrée ouvre la boîte « Résoudre ».</li>
        </ul>
        <p className="mt-2 text-fg-muted">
          Espace et Entrée n’agissent que si rien n’a le focus à l’écran. Toutes ces touches sont
          ignorées pendant la saisie dans un champ de texte, avec une touche de raccourci
          (Ctrl, Cmd, Alt) enfoncée, ou tant que la boîte « Résoudre » est ouverte.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Installer sur l’écran d’accueil</h2>
        <p className="mt-2 text-fg-muted">
          <strong>iOS / Safari</strong> : aucune invite d’installation n’apparaît automatiquement.
          Ouvrez le menu Partager, puis choisissez « Sur l’écran d’accueil ».
        </p>
        <p className="mt-2 text-fg-muted">
          <strong>Android / Chrome</strong> : le menu du navigateur propose directement
          d’installer l’application.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Où vivent vos données</h2>
        <p className="mt-2 text-fg-muted">
          Partie en cours, énigmes personnelles, réglages et clé d’API restent uniquement dans le
          stockage local de ce navigateur. « Résoudre » compare la réponse localement, sans appel
          réseau : les deux seuls échanges avec l’extérieur sont le bouton « Tester la clé » des
          Réglages, et le verdict de la question bonus de la manche finale, tous deux adressés à
          Mistral avec la clé enregistrée.
        </p>
        <p className="mt-3 rounded-lg border border-border bg-bg-soft p-3 text-sm text-fg">
          Sur iOS, une PWA installée depuis l’écran d’accueil a un stockage <strong>distinct</strong>{' '}
          de celui de l’onglet Safari d’où elle a été installée : une clé d’API saisie dans l’un
          n’existe pas dans l’autre, et vos énigmes personnelles non plus. L’export JSON de
          l’écran « Mes énigmes » est le seul filet de sécurité pour ne pas perdre vos créations
          en changeant d’écran d’accueil.
        </p>
      </section>
    </div>
  )
}
