/**
 * `window.matchMedia` pour jsdom, qui ne l'implémente pas du tout.
 *
 * Un stub est ici la bonne réponse plutôt qu'un garde dans le code de production :
 * `prefersDarkFrom` doit rester une lecture directe de la requête média, sinon le
 * thème système serait silencieusement « clair » le jour où un navigateur réel
 * change d'API.
 *
 * La liste renvoyée est **vivante** : `matches` est un accesseur, parce que
 * `ThemeProvider` relit `query.matches` après l'abonnement.
 */

type Listener = (event: MediaQueryListEvent) => void

interface Registre {
  readonly query: string
  readonly abonnes: Set<Listener>
}

const registres = new Set<Registre>()
let sombre = false

function correspond(query: string): boolean {
  if (query.includes('prefers-color-scheme: dark')) return sombre
  if (query.includes('prefers-color-scheme: light')) return !sombre
  // Tout le reste — `prefers-reduced-motion`, `forced-colors` — est faux par
  // défaut : c'est le comportement d'un navigateur aux réglages neutres.
  return false
}

function creerListe(query: string): MediaQueryList {
  const registre: Registre = { query, abonnes: new Set() }
  registres.add(registre)

  const liste = {
    get matches() {
      return correspond(query)
    },
    media: query,
    onchange: null,
    addEventListener: (type: string, listener: Listener) => {
      if (type === 'change') registre.abonnes.add(listener)
    },
    removeEventListener: (type: string, listener: Listener) => {
      if (type === 'change') registre.abonnes.delete(listener)
    },
    // API historique, gardée parce que des bibliothèques s'en servent encore.
    addListener: (listener: Listener) => registre.abonnes.add(listener),
    removeListener: (listener: Listener) => registre.abonnes.delete(listener),
    dispatchEvent: () => false,
  }

  // Cast assumé : c'est un doublon partiel d'une interface DOM, et implémenter
  // `MediaQueryList` en entier n'apporterait rien au test.
  return liste as unknown as MediaQueryList
}

export function installerMatchMedia(view: Window): void {
  Object.defineProperty(view, 'matchMedia', {
    configurable: true,
    writable: true,
    value: creerListe,
  })
}

/**
 * Bascule la préférence système et notifie les abonnés. À appeler dans un `act()` :
 * la notification déclenche un rendu React.
 */
export function preferSombre(valeur: boolean): void {
  sombre = valeur
  for (const registre of registres) {
    const event = { matches: correspond(registre.query), media: registre.query }
    for (const listener of registre.abonnes) {
      listener(event as MediaQueryListEvent)
    }
  }
}

/** Remet la préférence à « clair » et oublie les abonnés du test précédent. */
export function reinitialiserMedia(): void {
  sombre = false
  registres.clear()
}
