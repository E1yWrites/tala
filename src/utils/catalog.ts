import type { Note } from '@/types/models'

let cachedFor: readonly Note[] | null = null
let cached = new Map<string, number>()

/**
 * Catalogue numbers: every note's 1-based place in creation order, like a star
 * catalogue. Trash and archive keep their numbers; a note deleted forever
 * frees its slot and later notes close up.
 * Memoised on the notes array identity, so every row in a list shares one pass.
 */
export function catalogNumbers(notes: readonly Note[]): Map<string, number> {
  if (notes === cachedFor) return cached
  const order = [...notes].sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  cached = new Map(order.map((n, i) => [n.id, i + 1]))
  cachedFor = notes
  return cached
}

export const formatCatalog = (n: number): string => `№ ${String(n).padStart(3, '0')}`
