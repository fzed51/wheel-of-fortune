// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { PACK_PUZZLES, PACK_QUESTIONS } from '../data/puzzles'
import { asPuzzleId } from '../game/types'
import { clearAllData, saveCustomPuzzles, saveMistralKey } from '../storage/persist'
import { SCHEMA_VERSION } from '../storage/keys'
import { monterApp } from '../test/app'

/**
 * `persist.ts` garde un repli en mémoire au niveau du module, que
 * `localStorage.clear()` seul n'atteint pas : sans les deux, une énigme perso
 * écrite par un test précédent réapparaît dans celui-ci.
 */
beforeEach(() => {
  clearAllData()
  localStorage.clear()
})

// Énoncé de question dédié aux tests, choisi pour ne heurter aucune entrée de
// `PACK_QUESTIONS` : depuis que l'éditeur compare un brouillon à `all` (l'union
// de `pool` et `questions`), un énoncé de test qui reprendrait mot pour mot une
// question déjà embarquée serait rejeté comme doublon dès la première saisie.
const QUESTION_ANSWER = 'QUELLE VILLE ABRITE LA TOUR EIFFEL'
const BONUS_ANSWER = 'PARIS'

describe('PuzzleEditorRoute', () => {
  it('ajoute une énigme valide, qui apparaît dans la liste et incrémente le compte', async () => {
    const user = userEvent.setup()
    monterApp('/enigmes')

    expect(
      screen.getByText(`${PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, 0 énigme à vous.`),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText('Énoncé'), 'MAISON DE CAMPAGNE')
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))

    expect(screen.getByText('MAISON DE CAMPAGNE')).toBeInTheDocument()
    expect(
      screen.getByText(`${PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, 1 énigme à vous.`),
    ).toBeInTheDocument()
  })

  it('refuse une énigme trop courte : rien n’est ajouté, le problème est affiché', async () => {
    const user = userEvent.setup()
    monterApp('/enigmes')

    await user.type(screen.getByLabelText('Énoncé'), 'CHAT NOIR')
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))

    expect(screen.getByText('Au moins 10 caractères.')).toBeInTheDocument()
    expect(
      screen.getByText(`${PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, 0 énigme à vous.`),
    ).toBeInTheDocument()
  })

  it('refuse une énigme qui double une énigme du catalogue embarqué', async () => {
    const existing = PACK_PUZZLES[0]
    if (existing === undefined) throw new Error('PACK_PUZZLES est vide')

    const user = userEvent.setup()
    monterApp('/enigmes')

    await user.type(screen.getByLabelText('Énoncé'), existing.answer)
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))

    expect(screen.getByText('Cette énigme existe déjà.')).toBeInTheDocument()
    expect(
      screen.getByText(`${PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, 0 énigme à vous.`),
    ).toBeInTheDocument()
  })

  it('modifie une énigme existante : le nouvel énoncé remplace l’ancien, sans doublon', async () => {
    const user = userEvent.setup()
    monterApp('/enigmes')

    await user.type(screen.getByLabelText('Énoncé'), 'MAISON DE CAMPAGNE')
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))
    expect(screen.getByText('MAISON DE CAMPAGNE')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Modifier MAISON DE CAMPAGNE' }))
    const answerField = screen.getByLabelText('Énoncé')
    await user.clear(answerField)
    await user.type(answerField, 'UNE VIEILLE FERME')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('UNE VIEILLE FERME')).toBeInTheDocument()
    expect(screen.queryByText('MAISON DE CAMPAGNE')).not.toBeInTheDocument()
    expect(
      screen.getByText(`${PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, 1 énigme à vous.`),
    ).toBeInTheDocument()
  })

  it('supprime une énigme, confirmation comprise', async () => {
    const user = userEvent.setup()
    monterApp('/enigmes')

    await user.type(screen.getByLabelText('Énoncé'), 'MAISON DE CAMPAGNE')
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))

    await user.click(screen.getByRole('button', { name: 'Supprimer MAISON DE CAMPAGNE' }))
    // Avant confirmation, l'énigme est toujours là.
    expect(screen.getByText('MAISON DE CAMPAGNE')).toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: 'Confirmer la suppression de MAISON DE CAMPAGNE' }),
    )

    expect(screen.queryByText('MAISON DE CAMPAGNE')).not.toBeInTheDocument()
    expect(
      screen.getByText(`${PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, 0 énigme à vous.`),
    ).toBeInTheDocument()
    expect(screen.getByText(/supprimée/u)).toBeInTheDocument()
  })

  it('l’énigme ajoutée survit à un remontage de l’application', async () => {
    const user = userEvent.setup()
    const { unmount } = monterApp('/enigmes')

    await user.type(screen.getByLabelText('Énoncé'), 'MAISON DE CAMPAGNE')
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))
    expect(screen.getByText('MAISON DE CAMPAGNE')).toBeInTheDocument()

    // Le remontage prouve que l'énigme est passée par le stockage, et pas
    // seulement par l'état React de ce composant.
    unmount()
    monterApp('/enigmes')

    expect(screen.getByText('MAISON DE CAMPAGNE')).toBeInTheDocument()
    expect(
      screen.getByText(`${PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, 1 énigme à vous.`),
    ).toBeInTheDocument()
  })

  it('exporte uniquement les énigmes perso : ni la clé Mistral, ni les réglages', async () => {
    // Test de sécurité : la clé d'API Mistral vit dans sa propre entrée de
    // stockage précisément pour qu'aucun objet exportable ne puisse la
    // contenir. Ce test protège contre une régression qui construirait
    // l'export à partir d'un objet plus large que les énigmes perso.
    saveMistralKey('cle-secrete-du-testeur')
    saveCustomPuzzles([
      { id: asPuzzleId('user-001'), answer: 'MAISON DE CAMPAGNE', category: 'Expression', source: 'custom' },
    ])

    // jsdom n'implémente ni `URL.createObjectURL` ni `URL.revokeObjectURL` :
    // on les remplace par des espions pour intercepter le contenu du fichier.
    // Le contenu est relu dans `mock.calls` plutôt que capturé dans une
    // variable : affectée depuis une closure, elle resterait typée `null` pour
    // l'analyse de flux et la lecture tomberait sur `never`.
    const createObjectURL = vi.fn((_blob: Blob): string => 'blob:mock')
    const revokeObjectURL = vi.fn()
    URL.createObjectURL = createObjectURL
    URL.revokeObjectURL = revokeObjectURL
    // Sans ça, jsdom tente de suivre l'ancre de téléchargement et écrit
    // « Not implemented: navigation to another Document » dans la sortie : un
    // avertissement qui n'annonce aucun problème mais qui use la vigilance.
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})

    const user = userEvent.setup()
    monterApp('/enigmes')
    await user.click(screen.getByRole('button', { name: 'Exporter mes énigmes' }))

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    const blob = createObjectURL.mock.calls[0]?.[0]
    expect(blob).toBeDefined()
    if (blob === undefined) return
    const text = await blob.text()
    expect(text).toContain('MAISON DE CAMPAGNE')
    expect(text.toLowerCase()).not.toContain('mistral')
    expect(text).not.toContain('cle-secrete-du-testeur')
    expect(text).not.toContain('roundCount')
    expect(text).not.toContain('theme')
    expect(text).not.toContain('botLevel')
  })

  it('l’export est inerte tant qu’aucune énigme perso n’existe', () => {
    monterApp('/enigmes')

    expect(screen.getByRole('button', { name: 'Exporter mes énigmes' })).toHaveAttribute(
      'aria-disabled',
      'true',
    )
    expect(screen.getByText('Aucune énigme personnelle à exporter.')).toBeInTheDocument()
  })

  it('importe un fichier valide : les énigmes apparaissent et le compte rendu annonce le bon nombre', async () => {
    const contenu = JSON.stringify({
      version: SCHEMA_VERSION,
      value: [{ id: null, answer: 'MAISON DE CAMPAGNE', category: 'Expression' }],
    })

    const user = userEvent.setup()
    monterApp('/enigmes')

    const input = screen.getByLabelText('Importer un fichier d’énigmes')
    await user.upload(input, new File([contenu], 'enigmes.json', { type: 'application/json' }))

    await screen.findByText('1 énigme ajoutée.')
    expect(screen.getByText('MAISON DE CAMPAGNE')).toBeInTheDocument()
  })

  it('importe un fichier illisible : message d’erreur, aucune énigme perdue', async () => {
    saveCustomPuzzles([
      { id: asPuzzleId('user-001'), answer: 'MAISON DE CAMPAGNE', category: 'Expression', source: 'custom' },
    ])

    const user = userEvent.setup()
    monterApp('/enigmes')

    const input = screen.getByLabelText('Importer un fichier d’énigmes')
    await user.upload(input, new File(['ceci n’est pas du JSON'], 'illisible.json', { type: 'application/json' }))

    await screen.findByText('Ce fichier n’est pas du JSON lisible.')
    expect(screen.getByText('MAISON DE CAMPAGNE')).toBeInTheDocument()
    expect(
      screen.getByText(`${PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, 1 énigme à vous.`),
    ).toBeInTheDocument()
  })

  it('ajoute une question de manche finale, avec sa réponse attendue, qui apparaît dans la liste', async () => {
    const user = userEvent.setup()
    monterApp('/enigmes')

    await user.type(
      screen.getByLabelText('Énoncé'),
      QUESTION_ANSWER,
    )
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Question')
    await user.type(screen.getByLabelText('Réponse attendue'), BONUS_ANSWER)
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))

    expect(screen.getByText(QUESTION_ANSWER)).toBeInTheDocument()
    expect(
      screen.getByText(`${PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, 1 énigme à vous.`),
    ).toBeInTheDocument()
  })

  it('refuse une énigme dont l’énoncé double celui d’une question perso déjà enregistrée', async () => {
    // `saveCustomPuzzle` compare le brouillon à `all`, l'union des deux
    // réservoirs : sans elle, une question perso ne serait comparée qu'à
    // `PACK_QUESTIONS` et à d'autres questions perso par le tirage, mais pas
    // par l'éditeur, qui recevait autrefois `pool` — lequel exclut justement
    // les questions perso. Ce doublon d'énoncé mot pour mot passerait alors
    // en silence.
    const user = userEvent.setup()
    monterApp('/enigmes')

    await user.type(screen.getByLabelText('Énoncé'), QUESTION_ANSWER)
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Question')
    await user.type(screen.getByLabelText('Réponse attendue'), BONUS_ANSWER)
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))
    expect(screen.getByText(QUESTION_ANSWER)).toBeInTheDocument()

    await user.clear(screen.getByLabelText('Énoncé'))
    await user.type(screen.getByLabelText('Énoncé'), QUESTION_ANSWER)
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))

    expect(screen.getByText('Cette énigme existe déjà.')).toBeInTheDocument()
    expect(
      screen.getByText(`${PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, 1 énigme à vous.`),
    ).toBeInTheDocument()
  })

  it('attribue des identifiants distincts à une question et à une énigme ordinaire créées à la suite', async () => {
    // Preuve indirecte de la collision d'identifiant, l'identifiant lui-même
    // n'étant pas observable depuis le DOM. Avec l'ancien bug (`nextCustomId`
    // calculé sur `pool`, qui exclut les questions perso), la question créée
    // en premier et l'énigme ordinaire créée ensuite recevraient toutes les
    // deux `user-001` : modifier la seconde modifierait alors en réalité la
    // première dans `custom` (`findIndex` renvoie le premier identifiant
    // trouvé), et « MAISON DE CAMPAGNE » resterait affiché sans changement
    // pendant que la question disparaîtrait. Avec des identifiants distincts,
    // seule l'énigme visée par la modification change.
    const user = userEvent.setup()
    monterApp('/enigmes')

    await user.type(screen.getByLabelText('Énoncé'), QUESTION_ANSWER)
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Question')
    await user.type(screen.getByLabelText('Réponse attendue'), BONUS_ANSWER)
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))

    await user.clear(screen.getByLabelText('Énoncé'))
    await user.selectOptions(screen.getByLabelText('Catégorie'), 'Expression')
    await user.type(screen.getByLabelText('Énoncé'), 'MAISON DE CAMPAGNE')
    await user.click(screen.getByRole('button', { name: "Ajouter l'énigme" }))

    expect(screen.getByText(QUESTION_ANSWER)).toBeInTheDocument()
    expect(screen.getByText('MAISON DE CAMPAGNE')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Modifier MAISON DE CAMPAGNE' }))
    const answerField = screen.getByLabelText('Énoncé')
    await user.clear(answerField)
    await user.type(answerField, 'UNE VIEILLE FERME')
    await user.click(screen.getByRole('button', { name: 'Enregistrer' }))

    expect(screen.getByText('UNE VIEILLE FERME')).toBeInTheDocument()
    // Ces deux assertions sont celles qui distinguent le correctif du bug :
    // en cas de collision, la question disparaîtrait (remplacée par erreur)
    // et « MAISON DE CAMPAGNE » resterait affiché, inchangé.
    expect(screen.getByText(QUESTION_ANSWER)).toBeInTheDocument()
    expect(screen.queryByText('MAISON DE CAMPAGNE')).not.toBeInTheDocument()
  })
})
