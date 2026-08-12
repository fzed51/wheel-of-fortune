/**
 * Masquage de la clé d'API avant écriture dans `localStorage`.
 *
 * Ce n'est **pas** du chiffrement : `SEL` est une constante du bundle, donc
 * lisible par quiconque ouvre les sources ou le débogueur, et l'opération se
 * défait avec les mêmes quelques lignes de code. Ça ne protège de rien face à
 * un attaquant qui lit le JavaScript livré au navigateur.
 *
 * Son seul rôle : qu'un curieux qui ouvre l'inspecteur et regarde
 * `localStorage` ne voie pas la clé Mistral en clair au premier coup d'œil.
 * Un simple `atob` ne suffisait déjà plus à ça, d'où le XOR en plus du base64.
 */

/** Préfixe de forme : distingue une valeur masquée d'une valeur en clair (l'ancien format, sans marqueur). */
const MARQUEUR = 'v2:'

/** Constante de XOR, cyclée octet par octet. Une constante du bundle, donc publique de fait. */
const SEL = 'wof:roue-fortune'

/**
 * Octet du sel à la position `i`, cyclé. `sel` vient toujours de l'encodage de
 * `SEL`, non vide : l'accès indexé est donc toujours dans les bornes, mais
 * `noUncheckedIndexedAccess` l'ignore — le repli à `0` est inatteignable en
 * pratique, jamais silencieusement faux.
 */
function octetSel(sel: Uint8Array, i: number): number {
  const s = sel[i % sel.length]
  return s === undefined ? 0 : s
}

export function masquer(clair: string): string {
  const octets = new TextEncoder().encode(clair)
  const sel = new TextEncoder().encode(SEL)
  // `Array.from` avec une fonction de map type chaque élément en `number`, pas
  // en `number | undefined` : contrairement à un accès `octets[i]`, ce n'est
  // pas un accès indexé au sens de `noUncheckedIndexedAccess`.
  const masques = Array.from(octets, (octet, i) => octet ^ octetSel(sel, i))
  // `btoa` lève un `InvalidCharacterError` hors Latin-1 : chaque octet masqué
  // est ≤ 255, donc on construit la chaîne binaire caractère par caractère
  // plutôt que de tenter `btoa(clair)` directement, qui casserait sur un
  // accent ou un emoji collé dans le champ de la clé.
  const binaire = masques.map((octet) => String.fromCharCode(octet)).join('')
  return MARQUEUR + btoa(binaire)
}

export function demasquer(stocke: string): string | null {
  if (!stocke.startsWith(MARQUEUR)) return null
  try {
    const binaire = atob(stocke.slice(MARQUEUR.length))
    const sel = new TextEncoder().encode(SEL)
    const octets = new Uint8Array(binaire.length)
    for (let i = 0; i < binaire.length; i++) {
      octets[i] = binaire.charCodeAt(i) ^ octetSel(sel, i)
    }
    // `fatal: true` : des octets invalides doivent rendre `null`, pas une
    // chaîne truffée de caractères de remplacement qui masquerait la panne.
    return new TextDecoder('utf-8', { fatal: true }).decode(octets)
  } catch {
    // `atob` lève sur du base64 mal formé, `TextDecoder` en mode `fatal` lève
    // sur de l'UTF-8 invalide : dans les deux cas, une entrée corrompue ne
    // doit jamais faire lever `demasquer`, seulement rendre `null`.
    return null
  }
}
