/*
 * Boîte à outils injectée dans chaque document avant le premier script de la page.
 *
 * Même doctrine que les tests Vitest : **requêtes par rôle et nom accessible
 * uniquement**, jamais de `data-testid`, jamais de sélecteur de classe. Un contrôle
 * qui passe par le nom accessible vérifie l'accessibilité en même temps que le
 * comportement — et il casse si un libellé change, ce qui est exactement le but.
 *
 * Deux mouchards sont posés ici et nulle part ailleurs, parce qu'ils doivent
 * exister **avant** que la page ne s'exécute : le thème appliqué à
 * `DOMContentLoaded` (ce que fait `public/theme-init.js`, et ce que la double
 * préfixation du `base` casserait) et les violations de la CSP.
 */
export const PAGE_HELPERS = `
window.__themeAvantRendu = null
window.__cspViolations = []

document.addEventListener('DOMContentLoaded', () => {
  window.__themeAvantRendu = document.documentElement.getAttribute('data-theme')
})

document.addEventListener('securitypolicyviolation', (event) => {
  window.__cspViolations.push({
    directive: event.violatedDirective,
    bloque: event.blockedURI,
    ligne: event.lineNumber,
  })
})

window.__h = {
  txt(el) {
    const label = el && el.getAttribute ? el.getAttribute('aria-label') : null
    return String(label || (el && el.textContent) || '').replace(/\\s+/g, ' ').trim()
  },
  all(sel) { return Array.from(document.querySelectorAll(sel)) },
  byName(name, sel) {
    return window.__h.all(sel || 'button, a, [role="button"]')
      .find((el) => window.__h.txt(el) === name) || null
  },
  click(name, sel) {
    const el = window.__h.byName(name, sel)
    if (!el) throw new Error('Élément introuvable : ' + name)
    el.click()
    return true
  },
  /*
   * Le bouton de lancer change de nom selon le mode et l'état de visée —
   * « Lancer » au repos et « Stop » pendant que l'arc de visée balaie en mode
   * par défaut, « Tourner » en mode lancer simple. Un contrôle qui cherche l'un
   * de ces trois libellés en dur casse dès qu'il tombe sur un autre état ;
   * celui-ci essaie les trois et clique le premier trouvé.
   *
   * Deux boutons portent ce texte visible depuis que la roue a le sien, au
   * centre du disque — mais c'est bien celui de la barre d'actions qui est
   * cliqué ici, et lui seul : \`txt\` privilégie \`aria-label\` sur le texte, et le
   * bouton central en porte un, « … au centre de la roue ». Les deux appellent
   * de toute façon la même commande, mais seul celui de la barre reste monté
   * quand le lancer est illégal : le bouton central, lui, est alors simplement
   * absent du DOM, pas de \`aria-disabled\` à lui comparer.
   */
  clickLancer() {
    for (const nom of ['Lancer', 'Stop', 'Tourner']) {
      const el = window.__h.byName(nom)
      if (el) {
        el.click()
        return nom
      }
    }
    throw new Error('Bouton de lancer introuvable (ni Lancer, ni Stop, ni Tourner)')
  },
  labelled(labelText) {
    const label = window.__h.all('label').find((l) => window.__h.txt(l) === labelText)
    if (!label) return null
    const id = label.getAttribute('for')
    return id ? document.getElementById(id) : label.querySelector('input, select, textarea')
  },
  /*
   * Écrit dans un champ contrôlé par React : le setter natif est appelé
   * directement, sinon React ne voit pas la nouvelle valeur et la réécrit au
   * rendu suivant.
   */
  setValue(labelText, value) {
    const field = window.__h.labelled(labelText)
    if (!field) throw new Error('Champ introuvable : ' + labelText)
    const proto = field.tagName === 'SELECT'
      ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, String(value))
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new Event('change', { bubbles: true }))
    return field.value
  },
  /*
   * Coche une case en la cliquant, jamais en écrivant \`checked\` directement :
   * React ne verrait rien passer et réécrirait l'état non coché au rendu
   * suivant. Idempotent, pour rester utilisable même si l'état de départ n'est
   * pas connu à l'appel.
   */
  setChecked(labelText, coche) {
    const field = window.__h.labelled(labelText)
    if (!field) throw new Error('Champ introuvable : ' + labelText)
    if (field.checked !== coche) field.click()
    return field.checked
  },
  bodyText() { return document.body.innerText.replace(/\\s+/g, ' ').trim() },
  has(text) { return window.__h.bodyText().includes(text) },
  url() { return location.pathname },
  /** Lettres encore jouables : le libellé nu, sans « déjà proposée » ni « indisponible ». */
  lettresJouables() {
    return window.__h.all('button')
      .filter((b) => /^Lettre [A-Z]$/.test(window.__h.txt(b)))
      .map((b) => window.__h.txt(b).slice(-1))
  },
  clickLettre(lettre) {
    const el = window.__h.all('button').find((b) => window.__h.txt(b) === 'Lettre ' + lettre)
    if (!el) throw new Error('Touche indisponible : ' + lettre)
    el.click()
    return true
  },
  /** Instantané de l'écran de jeu, tel qu'un joueur le lit. */
  jeu() {
    const controls = {}
    for (const nom of ['Résoudre', 'Passer la main', 'Manche suivante']) {
      const el = window.__h.byName(nom)
      controls[nom] = el ? el.getAttribute('aria-disabled') : 'absent'
    }
    // Bouton de lancer à part : son libellé même change (« Lancer », « Stop »,
    // « Tourner » selon le mode et l'état de visée), un seul de ces trois
    // libellés est affiché à la fois — c'est \`controls\` ci-dessus qui garde les
    // libellés fixes. L'état relevé est celui du bouton de la barre d'actions :
    // le bouton central de la roue affiche le même libellé mais porte un
    // \`aria-label\`, que \`txt\` fait primer sur le texte. Le bouton central n'a
    // pas d'\`aria-disabled\` : il disparaît simplement du DOM quand le lancer est
    // illégal, au même instant et sur la même valeur que l'estompage de celui
    // de la barre.
    const lancerEl = window.__h.byName('Lancer') || window.__h.byName('Stop') || window.__h.byName('Tourner')
    const lancer = {
      nom: lancerEl ? window.__h.txt(lancerEl) : null,
      gele: lancerEl ? lancerEl.getAttribute('aria-disabled') : 'absent',
    }
    const paragraphes = window.__h.all('main p').map(window.__h.txt)
    return {
      entete: window.__h.txt(document.querySelector('main h2')),
      tour: paragraphes.find((t) => t.startsWith('Au tour de')) || null,
      evenement: paragraphes.find((t) => /roue s'arrête|Banqueroute|Passe\\.|Pas de |fois\\.|Voyelle payée|Manche gagnée|Manche annulée/.test(t)) || null,
      controls,
      lancer,
      jouables: window.__h.lettresJouables(),
      dialogue: document.querySelector('dialog[open]') !== null,
    }
  },
}
`
