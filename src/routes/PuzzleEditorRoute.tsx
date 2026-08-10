import { useId, useState } from 'react'
import type { ChangeEvent } from 'react'
import { PuzzleForm, PuzzleList, downloadJson } from '../components/PuzzleEditor'
import { BUTTON_PRIMARY, CARD } from '../components/classes'
import { CATEGORIES } from '../data/categories'
import { PACK_PUZZLES, PACK_QUESTIONS } from '../data/puzzles'
import { mergeImported, removeCustomPuzzle, saveCustomPuzzle } from '../game/customPuzzles'
import type { Puzzle, PuzzleId } from '../game/types'
import type { PuzzleDraft } from '../game/validate'
import { usePuzzles } from '../hooks/usePuzzles'
import { decodePuzzleFile, encodePuzzleFile, type DecodeFailure } from '../storage/codec'

/** Phrase d'échec de lecture, un cas par valeur de `DecodeFailure` — le `switch` doit rester exhaustif. */
function importFailureMessage(reason: DecodeFailure): string {
  switch (reason) {
    case 'unreadable':
      return 'Ce fichier n’est pas du JSON lisible.'
    case 'invalid':
      return 'Ce fichier ne contient pas de liste d’énigmes.'
    case 'version':
      return 'Ce fichier a été écrit par une autre version de l’application.'
    case 'absent':
      // Ne se produit pas ici (`decodePuzzleFile` ne lit rien depuis le
      // stockage), mais le type est partagé avec le reste du décodage et
      // un `switch` exhaustif doit couvrir chaque valeur, pas seulement
      // celles qu'on croit possibles.
      return 'Aucun contenu à importer.'
  }
}

/**
 * Compte rendu d'import : les entrées écartées à la lecture (`rejected`) et
 * celles refusées à la fusion (`invalid`) comptent ensemble comme « refusées »
 * pour l'utilisateur — les deux sont des erreurs de son point de vue. Les
 * doublons sont annoncés à part : réimporter le même fichier est inoffensif
 * par conception, ce n'est pas un problème à signaler comme tel.
 */
function importReportMessage(added: number, duplicates: number, invalid: number): string {
  // Singulier à 0 comme à 1, la règle du français et celle que `formatEuros`
  // suit déjà pour les euros : « 0 énigme ajoutée », jamais « 0 énigmes ».
  const plural = (count: number): string => (count > 1 ? 's' : '')
  const parts = [`${added} énigme${plural(added)} ajoutée${plural(added)}`]
  if (duplicates > 0) {
    parts.push(duplicates === 1 ? '1 déjà présente' : `${duplicates} déjà présentes`)
  }
  if (invalid > 0) {
    parts.push(invalid === 1 ? '1 refusée' : `${invalid} refusées`)
  }
  return `${parts.join(', ')}.`
}

/**
 * Éditeur d'énigmes perso : catalogue, formulaire, liste et sauvegarde.
 * Aucune règle de validation n'y est réécrite — `saveCustomPuzzle` et
 * `mergeImported` sont la seule source de vérité, partagée avec `PuzzleForm`.
 */
export default function PuzzleEditorRoute() {
  // `all` : l'éditeur valide et numérote les énigmes perso, il ne les tire
  // jamais pour une manche. Il lui faut donc l'union des deux réservoirs —
  // `pool` (manches ordinaires) et `questions` (manche finale) — pour ne pas
  // manquer un doublon d'énoncé ni réattribuer un identifiant déjà pris par
  // une énigme de l'autre nature.
  const { custom, all, replace } = usePuzzles()
  const [editing, setEditing] = useState<Puzzle | null>(null)
  const [message, setMessage] = useState('')
  const importId = useId()

  // Catégories du catalogue en tête, puis celles que portent déjà des énigmes
  // perso mais qui n'y figurent pas — un fichier importé peut apporter une
  // catégorie hors liste, et sans cet ajout la modifier depuis le formulaire
  // la remplacerait en silence par la première catégorie de la liste.
  const knownCategories = new Set<string>(CATEGORIES)
  const extraCategories = [...new Set(custom.map((puzzle) => puzzle.category))].filter(
    (category) => !knownCategories.has(category),
  )
  const categories = [...CATEGORIES, ...extraCategories]

  // L'énigme en cours de modification est exclue des « autres » : sinon elle
  // serait signalée comme son propre doublon pendant qu'on la corrige.
  const others = editing === null ? all : all.filter((puzzle) => puzzle.id !== editing.id)

  const exportDisabled = custom.length === 0

  function handleSave(draft: PuzzleDraft) {
    const result = saveCustomPuzzle(custom, all, draft, editing?.id ?? null)
    // En échec, rien à afficher de plus : `PuzzleForm` a déjà montré les mêmes
    // problèmes, la validation étant la même fonction (`draftIssues`). Un
    // second affichage d'erreurs ici ferait doublon avec celui du formulaire.
    if (!result.ok) return
    replace(result.puzzles)
    setMessage(editing === null ? 'Énigme ajoutée.' : 'Énigme modifiée.')
    setEditing(null)
  }

  /*
   * Le formulaire est au-dessus de la liste : cliquer « Modifier » sur une
   * ligne du bas remplit un formulaire qui peut être hors de l'écran. Le
   * compte rendu est le seul indice qu'il se soit passé quelque chose, et il
   * est lu à voix haute par-dessus le marché.
   */
  function handleEdit(puzzle: Puzzle) {
    setEditing(puzzle)
    setMessage(`Modification de « ${puzzle.answer} » en cours.`)
  }

  function handleRemove(id: PuzzleId) {
    const removed = custom.find((puzzle) => puzzle.id === id)
    replace(removeCustomPuzzle(custom, id))
    // Garder un formulaire prérempli sur une énigme qui n'existe plus
    // enregistrerait un doublon au clic suivant sur « Enregistrer ».
    if (editing !== null && editing.id === id) setEditing(null)
    setMessage(removed === undefined ? 'Énigme supprimée.' : `« ${removed.answer} » supprimée.`)
  }

  function handleExport() {
    if (exportDisabled) return
    // Nom de fichier daté : `toISOString` donne `AAAA-MM-JJTHH:mm:ss.sssZ`, les
    // dix premiers caractères sont la date ISO courte voulue.
    const today = new Date().toISOString().slice(0, 10)
    // Uniquement `custom` : jamais les réglages, jamais la sauvegarde de
    // partie, et surtout jamais la clé d'API Mistral, qui vit dans sa propre
    // entrée de stockage précisément pour qu'aucun objet exportable ne la
    // contienne. Ne pas élargir cet appel à un objet plus large que `custom`.
    downloadJson(`enigmes-perso-${today}.json`, encodePuzzleFile(custom))
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const input = event.target
    const file = input.files?.[0]
    // Toujours vider le champ, même en échec : sans ça, choisir deux fois le
    // même fichier ne redéclenche aucun `change`, et l'utilisateur croit
    // l'import ignoré.
    input.value = ''
    if (file === undefined) return

    let raw: string
    try {
      raw = await file.text()
    } catch {
      setMessage('Le fichier n’a pas pu être lu.')
      return
    }

    const decoded = decodePuzzleFile(raw)
    if (!decoded.ok) {
      setMessage(importFailureMessage(decoded.reason))
      return
    }

    const report = mergeImported(custom, all, decoded.value.entries)
    replace(report.puzzles)
    setMessage(importReportMessage(report.added, report.duplicates, report.invalid + decoded.value.rejected))
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={CARD}>
        <h2 className="font-semibold text-fg">Catalogue</h2>
        <p className="mt-1 text-sm text-fg-muted">
          {/* Le compte additionne les deux réservoirs embarqués : `PACK_PUZZLES`
              (manches ordinaires) et `PACK_QUESTIONS` (manche finale). Ne
              compter que `PACK_PUZZLES` sous-estimerait ce que l'application
              embarque vraiment, alors que les deux catalogues cohabitent
              désormais. */}
          {PACK_PUZZLES.length + PACK_QUESTIONS.length} énigmes embarquées, {custom.length} énigme
          {custom.length > 1 ? 's' : ''} à vous.
        </p>
      </section>

      <section className={CARD}>
        {/* `h2` comme les autres sections de l'écran : « Catalogue », le
            formulaire, la liste et la sauvegarde sont au même niveau sous le
            titre de page, et un `h3` y ferait croire à une imbrication. */}
        <h2 className="font-semibold text-fg">
          {editing === null ? 'Ajouter une énigme' : 'Modifier l’énigme'}
        </h2>
        <div className="mt-2">
          <PuzzleForm
            categories={categories}
            initial={editing}
            others={others}
            onSubmit={handleSave}
            onCancel={() => setEditing(null)}
          />
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-semibold text-fg">Vos énigmes</h2>
        <PuzzleList puzzles={custom} onEdit={handleEdit} onRemove={handleRemove} />
      </section>

      <section className={CARD}>
        <h2 className="font-semibold text-fg">Sauvegarde</h2>
        <div className="mt-2 flex flex-col items-start gap-2">
          <button
            type="button"
            aria-disabled={exportDisabled}
            onClick={handleExport}
            className={`${BUTTON_PRIMARY} min-h-11`}
          >
            Exporter mes énigmes
          </button>
          {exportDisabled && (
            <p className="text-sm text-fg-muted">Aucune énigme personnelle à exporter.</p>
          )}

          <label htmlFor={importId} className="text-fg">
            Importer un fichier d’énigmes
          </label>
          <input
            id={importId}
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void handleImport(event)
            }}
            className="text-fg"
          />
        </div>
      </section>

      {/* Emplacement unique de compte rendu : ajout, modification, suppression
          et import y écrivent tous. `polite`, pas `assertive` : rien ici n'est
          urgent au sens où `LiveRegions`/`Announcer` le sont pour la partie en
          cours, qu'on ne réutilise pas ici — ils sont pilotés par le driver de
          jeu, pas par cet écran. Pas de `role="status"` : le layout racine en
          porte déjà un pour la partie en cours, et un second de même rôle sur
          cet écran ne ferait que rendre les deux ambigus pour qui les cherche. */}
      <p aria-live="polite" aria-atomic="true" className="text-sm text-fg-muted">
        {message}
      </p>
    </div>
  )
}
