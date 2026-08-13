import { pack } from './pack'

export const CUISINE = pack('Cuisine', [
  ['cui-001', 'LA TARTE AUX POMMES'],
  ['cui-002', 'UN GRATIN DAUPHINOIS'],
  ['cui-003', 'LE POT-AU-FEU DU DIMANCHE'],
  ['cui-004', 'UNE SALADE NIÇOISE'],
  ['cui-005', "LA SOUPE À L'OIGNON"],
  // « BOEUF » et non « BŒUF » : la ligature n'est révélée par aucune lettre du
  // clavier, et `puzzles.test.ts` refuse Œ comme Æ pour cette raison.
  ['cui-006', 'UN BOEUF BOURGUIGNON'],
  ['cui-007', 'LA BLANQUETTE DE VEAU'],
  ['cui-008', 'DES CRÊPES AU SUCRE'],
  ['cui-009', 'LE CROQUE-MONSIEUR'],
  ['cui-010', 'UNE TARTE TATIN'],
  ['cui-011', 'LA QUICHE LORRAINE'],
  ['cui-012', 'LE CASSOULET DE CASTELNAUDARY'],
  ['cui-013', 'UNE RATATOUILLE NIÇOISE'],
  ['cui-014', 'LE HACHIS PARMENTIER'],
  ['cui-015', 'DES MOULES-FRITES'],
  ['cui-016', 'LA MOUSSE AU CHOCOLAT'],
  ['cui-017', 'UN POULET RÔTI DU DIMANCHE'],
  ['cui-018', 'LA CHOUCROUTE GARNIE'],
  ['cui-019', 'DES ESCARGOTS DE BOURGOGNE'],
  ['cui-020', 'LE MAGRET DE CANARD'],
  ['cui-021', 'UNE BAGUETTE TRADITION'],
  ['cui-022', 'LA RACLETTE SAVOYARDE'],
  ['cui-023', 'DES PROFITEROLES AU CARAMEL'],
  ['cui-024', 'LE CONFIT DE CANARD'],
  ['cui-025', 'UNE TARTIFLETTE AU REBLOCHON'],
])
