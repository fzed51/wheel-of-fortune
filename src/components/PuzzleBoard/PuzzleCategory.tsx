interface PuzzleCategoryProps {
  readonly category: string
}

/** À part du plateau : la catégorie n'est pas une case à révéler. */
export default function PuzzleCategory({ category }: PuzzleCategoryProps) {
  return <p className="text-sm text-fg-muted">Catégorie : {category}</p>
}
