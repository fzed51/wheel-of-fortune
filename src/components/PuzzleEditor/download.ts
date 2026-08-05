/** Provoque le téléchargement d'un fichier texte. Seul filet de sécurité des énigmes perso, sans backend. */
export function downloadJson(filename: string, text: string): void {
  // Environnement de test ou navigateur exotique sans `URL.createObjectURL` :
  // on ne casse pas l'écran, on renonce silencieusement au téléchargement.
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return

  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
  } catch {
    // Un téléchargement refusé ne casse pas l'écran : l'utilisateur garde ses
    // énigmes, il n'a simplement pas obtenu son fichier.
  } finally {
    // Révocation **différée d'un tour de boucle**, jamais immédiate : Safari
    // annule un téléchargement dont l'URL objet est libérée dans le même tour,
    // et cet export est précisément le filet de sécurité prévu pour iOS. Sans
    // révocation du tout, l'URL fuirait jusqu'au rechargement de la page.
    setTimeout(() => {
      URL.revokeObjectURL(url)
    }, 0)
  }
}
