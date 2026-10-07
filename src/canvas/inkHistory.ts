import type { InkStroke } from '@/types/ink'

/* ---------------------------------------------------------------------------
   Handwriting undo/redo for a whole note, across its pages: in continuous
   scroll the last change may be on a page that has scrolled out (and
   unmounted). Module-level, so it also survives closing and reopening a note.
--------------------------------------------------------------------------- */

/** One committed change to one page's strokes; undo puts `before` back. */
export interface InkOp {
  pageId: string
  before: InkStroke[]
  after: InkStroke[]
}

interface History {
  undo: InkOp[]
  redo: InkOp[]
}

const LIMIT = 100
const histories = new Map<string, History>()

// An import/restore replaced the data: old ops would resurrect stale strokes
if (typeof window !== 'undefined')
  window.addEventListener('tala:external-sync', (e) => {
    if ((e as CustomEvent).detail === 'restore') histories.clear()
  })

function historyOf(noteId: string): History {
  let h = histories.get(noteId)
  if (!h) histories.set(noteId, (h = { undo: [], redo: [] }))
  return h
}

export function recordInk(noteId: string, op: InkOp): void {
  const h = historyOf(noteId)
  h.undo.push(op)
  if (h.undo.length > LIMIT) h.undo.shift()
  h.redo.length = 0
}

/**
 * Moves the newest op to the other stack and returns it: apply `before` for
 * an undo, `after` for a redo. Ops on pages that no longer exist are dropped.
 */
export function stepInk(noteId: string, dir: 'undo' | 'redo', exists: (pageId: string) => boolean): InkOp | undefined {
  const h = historyOf(noteId)
  const [from, to] = dir === 'undo' ? [h.undo, h.redo] : [h.redo, h.undo]
  for (let op = from.pop(); op; op = from.pop()) {
    if (!exists(op.pageId)) continue
    to.push(op)
    return op
  }
  return undefined
}

export function inkHistoryState(noteId: string): { canUndo: boolean; canRedo: boolean } {
  const h = histories.get(noteId)
  return { canUndo: !!h?.undo.length, canRedo: !!h?.redo.length }
}
