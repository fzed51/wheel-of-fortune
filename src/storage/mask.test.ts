import { describe, expect, it } from 'vitest'
import { demasquer, masquer } from './mask'

// Même sel que `mask.ts`, recopié ici pour construire un cas de test précis
// (une entrée corrompue après démasquage) sans dépendre d'une exportation
// interne — la constante fait partie du contrat documenté dans le brief.
const SEL = 'wof:roue-fortune'

describe('masquer / demasquer', () => {
  it('fait l’aller-retour sur une clé d’API réaliste', () => {
    const cle = 'aBcD12efGh34IjKl56MnOp78qRsT90uV'
    expect(cle).toHaveLength(32)
    expect(demasquer(masquer(cle))).toBe(cle)
  })

  it('fait l’aller-retour sur des accents et un emoji', () => {
    // Si l'encodage revenait à `btoa(clair)` directement, `btoa` lèverait ici
    // (caractères hors Latin-1) : ce test rougirait immédiatement.
    const valeur = 'clé-café-emoji-🔑-été'
    expect(demasquer(masquer(valeur))).toBe(valeur)
  })

  it('rend une sortie marquée qui ne contient pas la valeur d’entrée', () => {
    const cle = 'sk-test-1234567890abcdef'
    const masque = masquer(cle)
    expect(masque.startsWith('v2:')).toBe(true)
    expect(masque).not.toContain(cle)
  })

  it('rend null sur une valeur sans marqueur, typiquement une ancienne clé en clair', () => {
    expect(demasquer('sk-abcdef0123456789')).toBeNull()
  })

  it('rend null sur du base64 mal formé après le marqueur', () => {
    expect(demasquer('v2:!!!pas du base64!!!')).toBeNull()
  })

  it('rend null sur une chaîne vide', () => {
    expect(demasquer('')).toBeNull()
  })

  it('rend null, sans lever, quand le contenu démasqué n’est pas de l’UTF-8 valide', () => {
    // Un octet 0xFF seul n'est un début de séquence UTF-8 valide dans aucun
    // cas : XORé avec le premier octet du sel, puis encodé en base64 avec le
    // marqueur, ça reproduit exactement la forme qu'écrirait `masquer`.
    const sel = new TextEncoder().encode(SEL)
    const premierOctetSel = sel[0]
    if (premierOctetSel === undefined) throw new Error('sel vide, cas impossible en pratique')
    const octetInvalide = 0xff ^ premierOctetSel
    const binaire = String.fromCharCode(octetInvalide)
    const stocke = `v2:${btoa(binaire)}`

    expect(() => demasquer(stocke)).not.toThrow()
    expect(demasquer(stocke)).toBeNull()
  })
})
