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
])
