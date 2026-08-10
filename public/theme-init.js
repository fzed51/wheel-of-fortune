/*
 * Bootstrap du thème, exécuté avant le rendu pour éviter le flash de thème clair.
 *
 * Fichier **externe** et volontairement en JavaScript ancien, sans module : c'est
 * ce qui permet de garder une CSP `script-src 'self'` stricte. Un script inline
 * imposerait `'unsafe-inline'`, ce qui annulerait l'essentiel de la protection
 * contre le vol de la clé d'API.
 *
 * Il duplique quatre valeurs, faute de pouvoir importer quoi que ce soit :
 * la clé `wof:settings:1`, la version d'enveloppe `2` (voir `src/storage/keys.ts`)
 * et les deux couleurs de fond (voir `src/theme/theme.ts` et `src/index.css`).
 * `theme.test.ts` lit ce fichier et vérifie que les copies concordent.
 */
;(function () {
  try {
    var theme = 'system'
    var raw = window.localStorage.getItem('wof:settings:1')
    if (raw) {
      var stored = JSON.parse(raw)
      // Une enveloppe d'une autre version que `SCHEMA_VERSION` est rejetée par
      // l'application (voir `src/storage/codec.ts`) : la lire ici quand même
      // ferait poser un thème que l'app va aussitôt écraser par `system`, donc
      // exactement le flash que ce fichier existe pour éviter.
      var value = stored && stored.version === 2 && stored.value
      var candidate = value && value.theme
      if (candidate === 'light' || candidate === 'dark' || candidate === 'system') {
        theme = candidate
      }
    }

    var dark =
      theme === 'dark' ||
      (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)

    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')

    var color = dark ? '#1b1033' : '#faf7ff'
    var metas = document.querySelectorAll('meta[name="theme-color"]')
    for (var i = 0; i < metas.length; i += 1) {
      metas[i].setAttribute('content', color)
    }
  } catch {
    // Stockage inaccessible ou JSON abîmé : le thème du système s'applique seul,
    // via `prefers-color-scheme`. Rien à signaler, et surtout rien à journaliser.
  }
})()
