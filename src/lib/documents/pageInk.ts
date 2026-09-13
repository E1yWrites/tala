import type { DocumentPage, PageTextNote } from '@/types/models'
import type { InkDoc } from '@/types/ink'
import { displaySize } from './pdf'

/* ---------------------------------------------------------------------------
   Page-space ink helpers. A page's ink doc uses the displayed page size (in
   PDF points) as its capture space, so strokes map 1:1 onto the export.
--------------------------------------------------------------------------- */

/** Fresh, empty ink doc sized to the page as currently displayed. */
export function emptyPageInk(page: DocumentPage): InkDoc {
  const { width, height } = displaySize(page)
  return { v: 1, width, height, strokes: [] }
}

/**
 * Rotates page ink 90° clockwise along with the page so annotations stay
 * glued to the content they were written on. (x, y) → (H − y, x), where
 * (W, H) is the page's displayed size before rotation; the doc's capture
 * space becomes (H, W).
 */
export function rotateInkDoc90(doc: InkDoc, prev: { width: number; height: number }): InkDoc {
  const sx = doc.width > 0 ? prev.width / doc.width : 1
  return {
    ...doc,
    width: prev.height,
    height: prev.width,
    strokes: doc.strokes.map((s) => ({
      ...s,
      size: s.size * sx,
      points: s.points.map((p) => ({
        ...p,
        x: Math.round((prev.height - p.y * sx) * 10) / 10,
        y: Math.round(p.x * sx * 10) / 10,
      })),
    })),
  }
}

/** Same rotation for typed page notes (boxes stay upright, anchors move). */
export function rotateTextNotes90(notes: PageTextNote[], prev: { width: number; height: number }): PageTextNote[] {
  return notes.map((n) => ({ ...n, x: Math.max(0, prev.height - n.y - n.size * 1.3), y: n.x }))
}
