/* ---------------------------------------------------------------------------
   Handwriting ("ink") layer data model. Stored as vector stroke JSON on each
   Note (Note.ink) — no bitmaps, scales losslessly with the note width.
--------------------------------------------------------------------------- */

export type InkToolId = 'pen' | 'pencil' | 'highlighter'
export type InkPointerMode = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'select'
export type InkEraserMode = 'stroke' | 'pixel'

/* Thickness presets in capture-space px, indexed by InkPrefs.sizeIdx.
   Every row shares a length so one relative slot (S…XL) maps cleanly onto
   any tool. Pencil renders through the pen pipeline (slightly translucent
   via CSS), highlighters get their own wider row, and the eraser treats its
   slot as the eraser DIAMETER. */
export const PEN_SIZES = [1.5, 2.5, 4, 6, 10, 14]
export const HIGHLIGHTER_SIZES = [6, 10, 14, 20, 26, 34]
export const ERASER_SIZES = [8, 14, 22, 32, 44, 60]

/** Preset row for a given pointer mode — the single source every consumer
 *  (canvas hit-testing, cursor ring, wheel hint, palette previews) shares. */
export function sizesForTool(tool: InkPointerMode): number[] {
  if (tool === 'highlighter') return HIGHLIGHTER_SIZES
  if (tool === 'eraser') return ERASER_SIZES
  return PEN_SIZES
}

export interface InkPoint {
  x: number
  y: number
  /** Device pressure 0..1 when reported; absent = uniform width */
  p?: number
}

export interface InkStroke {
  id: string
  tool: InkToolId
  color: string
  /** Stroke width in capture-space px (before note scaling) */
  size: number
  points: InkPoint[]
}

export interface InkDoc {
  v: 1
  /** Capture-space width of the editor column at draw time; strokes scale
   *  proportionally when the note is rendered at a different width. */
  width: number
  /** Capture-space height; grows as the user writes further down. */
  height: number
  strokes: InkStroke[]
}
