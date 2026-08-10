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
])
