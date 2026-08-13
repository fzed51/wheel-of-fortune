import { packQuestions } from './pack'

/**
 * Questions de la manche finale. Un énoncé interrogatif à deviner à la roue,
 * puis la réponse attendue de l'étape bonus.
 *
 * Deux contraintes s'ajoutent à celles de toute énigme :
 *
 * - **pas de point d'interrogation** dans l'énoncé, `ANSWER_CHARS` ne
 *   l'accepte pas (voir `QuestionEntry` pour la raison) ;
 * - **la réponse attendue ne doit pas figurer dans l'énoncé**, même à un
 *   accent ou un espace près : la grille la révélerait lettre par lettre et
 *   il ne resterait rien à gagner. `draftIssues` refuse le cas
 *   (`bonus-in-answer`) et `puzzles.test.ts` le vérifie ici.
 *
 * Les réponses sont écrites en majuscules accentuées comme les énoncés, par
 * cohérence de lecture — la comparaison passant par `foldForCompare`, la casse
 * et les accents n'ont de toute façon aucun effet sur le verdict.
 */
export const QUESTIONS = packQuestions([
  ['que-001', "QUELLE EST LA CAPITALE DE L'AUSTRALIE", 'CANBERRA'],
  ['que-002', 'QUI A PEINT LA JOCONDE', 'LÉONARD DE VINCI'],
  ['que-003', 'COMBIEN DE PATTES A UNE ARAIGNÉE', 'HUIT'],
  ['que-004', 'QUEL EST LE PLUS GRAND OCÉAN', 'LE PACIFIQUE'],
  ['que-005', 'QUELLE EST LA PLANÈTE LA PLUS CHAUDE', 'VÉNUS'],
  ['que-006', 'QUI A ÉCRIT LES MISÉRABLES', 'VICTOR HUGO'],
  ['que-007', 'DANS QUEL PAYS SE TROUVE LE TAJ MAHAL', "L'INDE"],
  ['que-008', 'QUEL ANIMAL EST LE ROI DE LA JUNGLE', 'LE LION'],
  ['que-009', 'QUELLE EST LA MONNAIE DU JAPON', 'LE YEN'],
  ['que-010', 'QUI A COMPOSÉ LA FLÛTE ENCHANTÉE', 'MOZART'],
  ['que-011', 'QUEL EST LE PLUS HAUT SOMMET DU MONDE', "L'EVEREST"],
  ['que-012', 'COMBIEN DE CORDES A UNE GUITARE', 'SIX'],
  ['que-013', 'QUELLE EST LA LANGUE PARLÉE AU BRÉSIL', 'LE PORTUGAIS'],
  ['que-014', 'QUI A PEINT LA NUIT ÉTOILÉE', 'VAN GOGH'],
  ['que-015', 'QUEL GAZ RESPIRONS-NOUS POUR VIVRE', "L'OXYGÈNE"],
  ['que-016', 'QUELLE EST LA CAPITALE DU CANADA', 'OTTAWA'],
  ['que-017', 'QUI A DÉCOUVERT LA PÉNICILLINE', 'ALEXANDER FLEMING'],
  ['que-018', 'QUEL FLEUVE TRAVERSE PARIS', 'LA SEINE'],
  ['que-019', 'COMBIEN DE JOUEURS DANS UNE ÉQUIPE DE FOOT', 'ONZE'],
  ['que-020', 'QUELLE EST LA PLUS GRANDE ÎLE DU MONDE', 'LE GROENLAND'],
  ['que-021', 'QUEL MÉTAL EST LIQUIDE À VINGT DEGRÉS', 'LE MERCURE'],
  ['que-022', 'COMBIEN DE CÔTÉS A UN HEXAGONE', 'SIX'],
  ['que-023', 'QUI A ÉCRIT LE PETIT PRINCE', 'SAINT-EXUPÉRY'],
  ['que-024', "QUELLE EST LA CAPITALE DE L'ITALIE", 'ROME'],
  ['que-025', 'QUEL EST LE PLUS LONG FLEUVE DU MONDE', 'LE NIL'],
  ['que-026', 'COMBIEN DE TOUCHES A UN PIANO', 'QUATRE-VINGT-HUIT'],
  ['que-027', 'QUI A INVENTÉ LE TÉLÉPHONE', 'GRAHAM BELL'],
  ['que-028', 'QUEL MÉTAL PRÉCIEUX A POUR SYMBOLE AU', "L'OR"],
  ['que-029', 'QUELLE PLANÈTE EST CONNUE POUR SES ANNEAUX', 'SATURNE'],
  ['que-030', 'QUEL EST LE PLUS PETIT PAYS DU MONDE', 'LE VATICAN'],
  ['que-031', 'QUEL ANIMAL MARIN A HUIT BRAS', 'LA PIEUVRE'],
  ['que-032', 'QUELLE EST LA CAPITALE DE LA GRÈCE', 'ATHÈNES'],
  ['que-033', 'QUI A THÉORISÉ LA RELATIVITÉ', 'ALBERT EINSTEIN'],
  ['que-034', 'QUEL EST LE PLUS GRAND DÉSERT CHAUD', 'LE SAHARA'],
  ['que-035', "COMBIEN DE LETTRES A L'ALPHABET FRANÇAIS", 'VINGT-SIX'],
  ['que-036', 'QUEL EST LE PLUS GROS ANIMAL DU MONDE', 'LA BALEINE BLEUE'],
  ['que-037', 'QUI A PEINT GUERNICA', 'PICASSO'],
  ['que-038', 'QUELLE MER SÉPARE ISRAËL DE LA JORDANIE', 'LA MER MORTE'],
  ['que-039', 'QUELLE EST LA CAPITALE DU PORTUGAL', 'LISBONNE'],
  ['que-040', 'QUEL EST LE PREMIER ÉLÉMENT DU TABLEAU', "L'HYDROGÈNE"],
  ['que-041', 'QUI A ÉCRIT ROMÉO ET JULIETTE', 'SHAKESPEARE'],
  ['que-042', 'QUEL PAYS A CRÉÉ LES JEUX OLYMPIQUES', 'LA GRÈCE'],
  ['que-043', 'COMBIEN DE PATTES A UN INSECTE', 'SIX'],
  ['que-044', 'QUEL EST LE CRI DU CHEVAL', 'LE HENNISSEMENT'],
  ['que-045', 'DE QUELLE COULEUR EST LE SAPHIR', 'LE BLEU'],
  ['que-046', 'QUI A FONDÉ LA CROIX-ROUGE', 'HENRY DUNANT'],
  ['que-047', 'QUEL FRUIT DONNE LE VIN', 'LE RAISIN'],
  ['que-048', 'QUELLE EST LA CAPITALE DE LA SUÈDE', 'STOCKHOLM'],
  ['que-049', 'QUEL OS EST LE PLUS LONG DU CORPS', 'LE FÉMUR'],
  ['que-050', 'QUEL EST LE CONTINENT LE PLUS PEUPLÉ', "L'ASIE"],
  ['que-051', 'COMBIEN DE JOURS DURE UNE ANNÉE BISSEXTILE', 'TROIS CENT SOIXANTE-SIX'],
  ['que-052', 'QUI A PEINT LE RADEAU DE LA MÉDUSE', 'GÉRICAULT'],
  ['que-053', 'QUEL EST LE SPORT DE ROLAND-GARROS', 'LE TENNIS'],
  ['que-054', 'QUELLE EST LA MONNAIE DU ROYAUME-UNI', 'LA LIVRE STERLING'],
  ['que-055', 'QUEL GAZ REND LES BULLES DU CHAMPAGNE', 'LE GAZ CARBONIQUE'],
  ['que-056', 'COMBIEN DE JOUEURS SUR UN TERRAIN DE RUGBY', 'QUINZE'],
  ['que-057', 'QUEL EST LE PLUS HAUT SOMMET DE FRANCE', 'LE MONT BLANC'],
  ['que-058', 'QUI A ÉCRIT LE ROUGE ET LE NOIR', 'STENDHAL'],
  ['que-059', 'QUELLE EST LA CAPITALE DE LA RUSSIE', 'MOSCOU'],
  ['que-060', 'QUEL REPTILE PORTE UNE CARAPACE', 'LA TORTUE'],
  ['que-061', 'COMBIEN DE COULEURS A UN ARC-EN-CIEL', 'SEPT'],
  ['que-062', 'QUEL INGÉNIEUR A BÂTI LA TOUR DE PARIS', 'GUSTAVE EIFFEL'],
  ['que-063', 'QUEL EST LE PLUS PETIT OISEAU DU MONDE', 'LE COLIBRI'],
  ['que-064', 'QUELLE EST LA LANGUE OFFICIELLE DU MEXIQUE', "L'ESPAGNOL"],
  ['que-065', 'QUI A DÉCOUVERT LE RADIUM', 'MARIE CURIE'],
  ['que-066', 'QUEL EST LE JOUR DE LA FÊTE NATIONALE', 'LE QUATORZE JUILLET'],
  ['que-067', 'COMBIEN DE DENTS A UN ADULTE', 'TRENTE-DEUX'],
  ['que-068', 'QUEL FROMAGE EST PERCÉ DE TROUS', "L'EMMENTAL"],
  ['que-069', 'QUELLE EST LA CAPITALE DE LA BELGIQUE', 'BRUXELLES'],
  ['que-070', 'QUEL ASTRE ÉCLAIRE LA NUIT', 'LA LUNE'],
  ['que-071', 'QUI A ÉCRIT LE PETIT CHAPERON ROUGE', 'CHARLES PERRAULT'],
  ['que-072', 'QUEL EST LE PLUS DUR DES MINÉRAUX', 'LE DIAMANT'],
  ['que-073', 'QUELLE MER BORDE NICE ET CANNES', 'LA MÉDITERRANÉE'],
  ['que-074', 'COMBIEN DE SECONDES DANS UNE HEURE', 'TROIS MILLE SIX CENTS'],
  ['que-075', 'QUEL OISEAU NE SAIT PAS VOLER ET NAGE', 'LE MANCHOT'],
])
