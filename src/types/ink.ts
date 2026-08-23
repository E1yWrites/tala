/* ---------------------------------------------------------------------------
   Handwriting ("ink") layer data model. Stored as vector stroke JSON on each
   Note (Note.ink) — no bitmaps, scales losslessly with the note width.
--------------------------------------------------------------------------- */

export type InkToolId = 'pen' | 'highlighter'
export type InkPointerMode = 'pen' | 'highlighter' | 'eraser' | 'select'
export type InkEraserMode = 'stroke' | 'pixel'

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
