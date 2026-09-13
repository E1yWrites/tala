/* ---------------------------------------------------------------------------
   Handwriting ("ink") layer data model. Stored as vector stroke JSON on each
   Note (Note.ink) — no bitmaps, scales losslessly with the note width.
--------------------------------------------------------------------------- */

export type InkToolId = 'pen' | 'pencil' | 'highlighter'
export type InkPointerMode = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'select'
export type InkEraserMode = 'stroke' | 'pixel'

/**
 * Named writing presets — each maps to a rendering tool + default thickness.
 * Subtools (brush-pen, fine-pencil, ballpoint) share the pen/pencil rendering
 * pipeline but differ in their default size.
 */
export type InkPreset =
  | 'marker'
  | 'pencil'
  | 'brush-pen'
  | 'fine-pencil'
  | 'highlighter'
  | 'ballpoint'

export interface InkPresetSpec {
  tool: Exclude<InkPointerMode, 'select' | 'eraser'>
  label: string
  /** Default sizeIdx for this preset (index into the size row). */
  defaultSizeIdx: number
}

export const INK_PRESETS: Record<InkPreset, InkPresetSpec> = {
  marker:        { tool: 'pen',        label: 'Marker',      defaultSizeIdx: 3 },
  pencil:        { tool: 'pencil',     label: 'Pencil',      defaultSizeIdx: 2 },
  'brush-pen':   { tool: 'pen',        label: 'Brush Pen',   defaultSizeIdx: 2 },
  'fine-pencil': { tool: 'pencil',     label: 'Fine Pencil', defaultSizeIdx: 0 },
  highlighter:   { tool: 'highlighter', label: 'Highlighter', defaultSizeIdx: 3 },
  ballpoint:     { tool: 'pen',        label: 'Ballpoint',   defaultSizeIdx: 0 },
}

export const INK_PRESET_IDS = Object.keys(INK_PRESETS) as InkPreset[]

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
  /**
   * Stylus tilt 0..1 (0 = perpendicular, 1 = flat on the surface) when the
   * device reports it. Only recorded for the pencil tool, where a flatter
   * angle widens the mark like shading with the side of the lead.
   */
  t?: number
}

/**
 * Geometric primitives a held stroke can snap to. `polygon` covers any
 * closed shape with straight sides the recogniser could not name.
 */
export type InkShapeKind = 'line' | 'arrow' | 'ellipse' | 'rect' | 'triangle' | 'polygon'

/**
 * Marks a stroke as a recognised vector shape. The geometry itself stays in
 * `points` (line = 2 points, polygon = corners with the first repeated last,
 * ellipse = evenly sampled perimeter), so every existing operation —
 * hit-testing, lasso, move, scale, rotate, export — works unchanged; only
 * rendering differs (crisp stroked outline instead of a pressure ribbon).
 */
export interface InkShapeMeta {
  kind: InkShapeKind
  /** Fill colour for closed shapes; 'none' / absent = outline only. */
  fill?: string
  /** True when `points` closes on itself (rect, ellipse, triangle, polygon). */
  closed: boolean
  /** Recogniser confidence 0..1 at creation — diagnostics only. */
  confidence?: number
}

export interface InkStroke {
  id: string
  tool: InkToolId
  color: string
  /** Stroke width in capture-space px (before note scaling) */
  size: number
  points: InkPoint[]
  /**
   * Per-stroke opacity 0..1. Absent on strokes written before opacity became
   * adjustable — those keep the tool's CSS default (see DEFAULT_OPACITY).
   */
  opacity?: number
  /** Present when the stroke is an editable recognised shape. */
  shape?: InkShapeMeta
}

/** Tool defaults used when a stroke carries no explicit opacity. */
export const DEFAULT_OPACITY: Record<InkToolId, number> = {
  pen: 1,
  pencil: 0.82,
  highlighter: 0.35,
}

/** Adjustable opacity ranges per tool — pen stays solid. */
export const OPACITY_RANGE: Partial<Record<InkToolId, { min: number; max: number }>> = {
  pencil: { min: 0.4, max: 1 },
  highlighter: { min: 0.15, max: 0.7 },
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
