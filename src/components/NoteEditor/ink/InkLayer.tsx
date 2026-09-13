import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { forwardRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createId } from '@/utils/id'
import { useUIStore } from '@/store/uiStore'
import { notePenSample, tiltFromEvent } from '@/lib/pencil'
import { getInkClipboard, setInkClipboard, setInkGestureActive } from '@/lib/inkSession'

/** True while the user is typing in a text field. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}
import {
  eraseStrokePartially,
  polylineToPath,
  rotateStroke,
  scaleStrokeInto,
  shapePathD,
  simplifyPoints,
  strokeBBox,
  strokeHits,
  strokeInLasso,
  strokeOutlineD,
  translateStroke,
} from '@/utils/ink'
import {
  DEFAULT_GESTURE_CONFIG,
  detectScribble,
  emitGestureDiagnostic,
  recognizeShape,
  scribbleTargets,
  type GestureConfig,
  type ShapeCandidate,
} from '@/utils/gestures'
import type { InkDoc, InkEraserMode, InkPointerMode, InkPoint, InkStroke } from '@/types/ink'
import { ERASER_SIZES, HIGHLIGHTER_SIZES, PEN_SIZES, sizesForTool } from '@/types/ink'

/* ---------------------------------------------------------------------------
   The handwriting canvas: an SVG overlay covering the note's content column.
   Committed strokes are one <path> each (memoized); the in-progress stroke is
   mutated directly inside requestAnimationFrame so drawing never re-renders
   React. Coordinates are captured in "capture space" (the content-column width
   at first stroke); the SVG viewBox scales strokes when the note resizes.
--------------------------------------------------------------------------- */

// Thickness presets live in types/ink.ts (next to the data model they feed);
// re-exported here for the tool UI which has always imported them from here.
export { PEN_SIZES, HIGHLIGHTER_SIZES, ERASER_SIZES }

/** Extra room kept below the lowest stroke. */
const HEIGHT_SLACK = 96
const MIN_DRAW_DIST_SQ = 1.2 * 1.2

/** Round to 0.1 capture-units — keeps persisted payloads small. */
const r01 = (v: number): number => Math.round(v * 10) / 10

/** Moving-average pressure over a ±2 window — raw stylus pressure jitters. */
function smoothPressure(pts: InkPoint[]): InkPoint[] {
  let any = false
  for (const p of pts)
    if (p.p !== undefined && p.p > 0) {
      any = true
      break
    }
  if (!any) return pts
  return pts.map((pt, i) => {
    if (pt.p === undefined) return pt
    let sum = 0
    let cnt = 0
    for (let j = Math.max(0, i - 2); j <= Math.min(pts.length - 1, i + 2); j++) {
      const q = pts[j]!.p
      if (q !== undefined) {
        sum += q
        cnt++
      }
    }
    return { ...pt, p: Math.round((sum / cnt) * 100) / 100 }
  })
}

export interface InkPrefsSnapshot {
  tool: InkPointerMode
  color: string
  sizeIdx: number
  eraserMode: InkEraserMode
  /** Opacity written into new strokes (pencil / highlighter); undefined = tool default. */
  opacity?: number
  /** Stylus behaviour — see PencilSettings in the ui store. Defaults: all on. */
  pressure?: boolean
  tilt?: boolean
  hoverPreview?: boolean
  touchDraws?: boolean
  /** Gesture recognition settings; defaults to DEFAULT_GESTURE_CONFIG. */
  gestures?: GestureConfig
}

export interface InkLayerHandle {
  undo: () => void
  redo: () => void
  clearAll: () => void
  deleteSelection: () => void
  duplicateSelection: () => void
  copySelection: () => void
  cutSelection: () => void
  paste: () => void
  /** Rotate the selection around its centre, degrees clockwise. */
  rotateSelection: (deg: number) => void
  recolorSelection: (color: string) => void
  selectAll: () => void
  clearSelection: () => void
  /** Stroke width / outline colour / fill for selected strokes (shapes get all three). */
  setShapeStyle: (patch: { size?: number; color?: string; fill?: string | null }) => void
  /** Scale the selection about its centre by `factor` (1.1 = 10 % larger). */
  resizeSelection: (factor: number) => void
}

interface InkLayerProps {
  ink: InkDoc | null
  onChange: (ink: InkDoc) => void
  /** Editor scroll container — used for two-finger panning on touch. */
  scrollRef: React.RefObject<HTMLDivElement | null>
  active: boolean
  prefs: InkPrefsSnapshot
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void
  /**
   * Right-click / secondary-click on the canvas while pen mode is active.
   * The browser menu is suppressed here — and only here, since the svg mounts
   * solely while pen mode is active — so the rest of the app keeps its menus.
   */
  onPaletteRequest?: (clientX: number, clientY: number) => void
  /** Selection changed: total count and how many of them are shapes. */
  onSelectionChange?: (count: number, shapes: number) => void
  /** The layer wants a different tool (tap on a shape while drawing → select). */
  onRequestTool?: (tool: InkPointerMode) => void
  /** A new stroke landed — lets the editor remember the pen combination used. */
  onStrokeCommitted?: (stroke: InkStroke) => void
  /**
   * Handle window keyboard shortcuts (undo, delete, copy…). Multi-page
   * surfaces mount many layers at once and route keys to the focused one
   * themselves, so they pass false.
   */
  keyboard?: boolean
  /** Any pointer went down on this layer — multi-page hosts track focus with it. */
  onPointerDownCapture?: () => void
}

interface InkOp {
  before: InkStroke[]
  after: InkStroke[]
}

type Corner = 'nw' | 'ne' | 'sw' | 'se'

type Gesture =
  | {
      kind: 'draw'
      stroke: InkStroke
      pts: InkPoint[]
      startedAt: number
      /** Hold-to-shape: the candidate the live stroke currently snaps to. */
      snap: ShapeCandidate | null
      /** Where the pen was when it snapped — moving away cancels the snap. */
      snapAt: InkPoint | null
    }
  | { kind: 'erase'; base: InkStroke[]; working: InkStroke[]; changed: boolean }
  | { kind: 'pan'; lastY: number }
  | { kind: 'select-move'; dx: number; dy: number; last: InkPoint }
  | {
      kind: 'select-scale'
      corner: Corner
      origin: { x0: number; y0: number; x1: number; y1: number }
      /** Live bbox while dragging (committed on release). */
      to: { x0: number; y0: number; x1: number; y1: number }
    }
  | { kind: 'select-rotate'; cx: number; cy: number; startAngle: number; deg: number }
  | { kind: 'lasso'; pts: InkPoint[] }

/** Minimal pointer shape so native coalesced events need no casting. */
interface Pt {
  clientX: number
  clientY: number
  pointerType: string
  pressure: number
  pointerId: number
  buttons?: number
  tiltX?: number
  tiltY?: number
  altitudeAngle?: number
  getCoalescedEvents?(): Pt[]
  getPredictedEvents?(): Pt[]
}

/**
 * Palm rejection window: a finger landing this soon after (or during) pen
 * contact is a resting hand, not a stroke.
 */
const PALM_WINDOW_MS = 700
/** Offset applied to duplicated / pasted strokes so copies are visible. */
const PASTE_OFFSET = 18

const EMPTY_STROKES: InkStroke[] = []

export const InkLayer = forwardRef<InkLayerHandle, InkLayerProps>(function InkLayer(
  {
    ink,
    onChange,
    scrollRef,
    active,
    prefs,
    onHistoryChange,
    onPaletteRequest,
    onSelectionChange,
    onStrokeCommitted,
    onRequestTool,
    keyboard = true,
    onPointerDownCapture,
  },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const livePathRef = useRef<SVGPathElement | null>(null)
  const liveTipRef = useRef<SVGCircleElement | null>(null)

  /** Cached getBoundingClientRect — refreshed once per event batch, never per
   *  coalesced sample (layout reads were the hottest no-op in the loop). */
  const svgRectRef = useRef<DOMRect | null>(null)

  const gestureRef = useRef<Gesture | null>(null)
  const rafRef = useRef<number | null>(null)
  /** Live-rebuild throttle bookkeeping (see renderLive). */
  const liveBuiltLenRef = useRef(0)
  const liveBuiltAtRef = useRef(-1e9)
  const undoStack = useRef<InkOp[]>([])
  const redoStack = useRef<InkOp[]>([])
  const touchIds = useRef<number[]>([])
  const lastNativeRef = useRef<Pt | null>(null)

  /**
   * Draft doc for brand-new notes: created locally on the very first stroke so
   * an untouched note is never written to IndexedDB just for opening pen mode.
   */
  const draftRef = useRef<InkDoc | null>(null)
  const effDoc = ink ?? draftRef.current

  const inkRef = useRef<InkDoc | null>(effDoc)
  inkRef.current = effDoc

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [lasso, setLasso] = useState<InkPoint[] | null>(null)
  const [movePreview, setMovePreview] = useState<{ dx: number; dy: number } | null>(null)
  /** Live resize / rotate previews for the selection handles. */
  const [scalePreview, setScalePreview] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const [rotatePreview, setRotatePreview] = useState<{ deg: number; cx: number; cy: number } | null>(null)
  /** Hold-to-shape timer (see scheduleHoldCheck). */
  const holdTimerRef = useRef<number | null>(null)
  const [erasingStrokes, setErasingStrokes] = useState<InkStroke[] | null>(null)
  /** Ring under the pointer: eraser reach, or a hovering pen's tip preview. */
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number; hover: boolean } | null>(
    null,
  )

  /** Latest prefs for handlers that must not be recreated per render. */
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  /** Last moment a pen touched the canvas — gates palm rejection. */
  const lastPenAtRef = useRef(-1e9)
  /** Pointer that owns the current gesture. */
  const gesturePointerRef = useRef<{ id: number; type: string } | null>(null)

  /**
   * Transient gesture visuals (eraser ring, erase preview, marquee, move
   * preview) are queued here and flushed at most once per animation frame —
   * pointermove fires far more often than paint.
   */
  interface UiPending {
    cursor?: { x: number; y: number; hover: boolean } | null
    erasing?: InkStroke[] | null
    lasso?: InkPoint[] | null
    move?: { dx: number; dy: number } | null
    scale?: { x0: number; y0: number; x1: number; y1: number } | null
    rotate?: { deg: number; cx: number; cy: number } | null
  }
  const uiFrameRef = useRef<number | null>(null)
  const uiPendingRef = useRef<UiPending>({})

  const flushUi = useCallback(() => {
    uiFrameRef.current = null
    const p = uiPendingRef.current
    uiPendingRef.current = {}
    if ('cursor' in p) setCursorPos(p.cursor ?? null)
    if ('erasing' in p) setErasingStrokes(p.erasing ?? null)
    if ('lasso' in p) setLasso(p.lasso ? [...p.lasso] : null)
    if ('move' in p) setMovePreview(p.move ?? null)
    if ('scale' in p) setScalePreview(p.scale ?? null)
    if ('rotate' in p) setRotatePreview(p.rotate ?? null)
  }, [])

  const scheduleUi = useCallback(() => {
    if (uiFrameRef.current === null) uiFrameRef.current = requestAnimationFrame(flushUi)
  }, [flushUi])

  /** Observed content-box size in CSS px. */
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  // A pending draw/UI frame must not fire after unmount/deactivation.
  useEffect(
    () => () => {
      if (holdTimerRef.current !== null) {
        window.clearTimeout(holdTimerRef.current)
        holdTimerRef.current = null
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (uiFrameRef.current !== null) {
        cancelAnimationFrame(uiFrameRef.current)
        uiFrameRef.current = null
      }
    },
    [],
  )

  /** Transient doc so the SVG can render before the first stroke persists one. */
  const displayDoc =
    effDoc ??
    (box.w > 0
      ? {
          v: 1,
          width: Math.max(Math.round(box.w), 320),
          height: Math.max(Math.round(box.h), 480),
          strokes: EMPTY_STROKES,
        }
      : null)

  const dispScale = displayDoc && box.w > 0 ? box.w / displayDoc.width : 1
  const dispViewH =
    displayDoc && box.w > 0 ? Math.max(displayDoc.height, box.h / dispScale) : 0

  const scale = dispScale
  const strokes = erasingStrokes ?? effDoc?.strokes ?? EMPTY_STROKES

  /* ------------------------------ History ops ------------------------------ */

  const notifyHistory = useCallback(() => {
    onHistoryChange?.(undoStack.current.length > 0, redoStack.current.length > 0)
  }, [onHistoryChange])

  useEffect(notifyHistory, [notifyHistory])

  const commit = useCallback(
    (nextStrokes: InkStroke[], before: InkStroke[], growToY1?: number) => {
      const doc = inkRef.current
      if (!doc) return
      // The previous height already encodes the lowest stroke so far — only a
      // caller that can GROW it (new stroke, move/scale down) passes growToY1.
      // This keeps commits O(1) instead of rescanning every stroke bbox.
      let maxY = doc.height > HEIGHT_SLACK ? doc.height - HEIGHT_SLACK : 0
      if (growToY1 !== undefined && growToY1 > maxY) maxY = growToY1
      const visibleCaptureH = box.w > 0 ? (box.h * doc.width) / box.w : 0
      const height = Math.max(
        nextStrokes.length > 0 ? maxY + HEIGHT_SLACK : 0,
        visibleCaptureH,
        480,
      )
      undoStack.current.push({ before, after: nextStrokes })
      if (undoStack.current.length > 100) undoStack.current.shift()
      redoStack.current = []
      onChange({ ...doc, height, strokes: nextStrokes })
      notifyHistory()
    },
    [box.h, box.w, notifyHistory, onChange],
  )

  const applyStrokes = useCallback(
    (nextStrokes: InkStroke[]) => {
      const doc = inkRef.current
      if (!doc) return
      onChange({ ...doc, strokes: nextStrokes })
    },
    [onChange],
  )

  const undo = useCallback(() => {
    const op = undoStack.current.pop()
    if (!op) return
    redoStack.current.push(op)
    applyStrokes(op.before)
    notifyHistory()
  }, [applyStrokes, notifyHistory])

  const redo = useCallback(() => {
    const op = redoStack.current.pop()
    if (!op) return
    undoStack.current.push(op)
    applyStrokes(op.after)
    notifyHistory()
  }, [applyStrokes, notifyHistory])

  const clearAll = useCallback(() => {
    const doc = inkRef.current
    if (!doc || doc.strokes.length === 0) return
    commit([], doc.strokes)
  }, [commit])

  const deleteSelection = useCallback(() => {
    const doc = inkRef.current
    if (!doc || selected.size === 0) return
    commit(
      doc.strokes.filter((s) => !selected.has(s.id)),
      doc.strokes,
    )
    setSelected(new Set())
  }, [commit, selected])

  const selectedStrokes = useCallback(
    (): InkStroke[] => (inkRef.current?.strokes ?? []).filter((s) => selected.has(s.id)),
    [selected],
  )

  /** Insert copies of `source` shifted by (dx, dy) with fresh ids; selects them. */
  const insertCopies = useCallback(
    (source: InkStroke[], dx: number, dy: number) => {
      const doc = inkRef.current
      if (!doc || source.length === 0) return
      const copies = source.map((s) => ({ ...translateStroke(s, dx, dy), id: createId() }))
      let y1 = 0
      for (const c of copies) y1 = Math.max(y1, strokeBBox(c).y1)
      commit([...doc.strokes, ...copies], doc.strokes, y1)
      setSelected(new Set(copies.map((c) => c.id)))
    },
    [commit],
  )

  const duplicateSelection = useCallback(() => {
    insertCopies(selectedStrokes(), PASTE_OFFSET, PASTE_OFFSET)
  }, [insertCopies, selectedStrokes])

  const copySelection = useCallback(() => {
    const picked = selectedStrokes()
    if (picked.length > 0) setInkClipboard(picked)
  }, [selectedStrokes])

  const cutSelection = useCallback(() => {
    const picked = selectedStrokes()
    if (picked.length === 0) return
    setInkClipboard(picked)
    deleteSelection()
  }, [deleteSelection, selectedStrokes])

  const paste = useCallback(() => {
    const clip = getInkClipboard()
    if (clip.length === 0 || !inkRef.current) {
      // A brand-new note has no doc yet — seed one so the paste has a home.
      if (clip.length === 0) return
      draftRef.current = displayDoc
        ? { ...displayDoc, strokes: [...displayDoc.strokes] }
        : { v: 1, width: Math.max(Math.round(box.w), 320), height: Math.max(Math.round(box.h), 480), strokes: [] }
      inkRef.current = draftRef.current
    }
    insertCopies(clip, PASTE_OFFSET, PASTE_OFFSET)
  }, [box.h, box.w, displayDoc, insertCopies])

  const rotateSelection = useCallback(
    (deg: number) => {
      const doc = inkRef.current
      if (!doc || selected.size === 0 || deg === 0) return
      let bb: { x0: number; y0: number; x1: number; y1: number } | null = null
      for (const s of doc.strokes) {
        if (!selected.has(s.id)) continue
        const b = strokeBBox(s)
        bb = bb
          ? { x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1) }
          : b
      }
      if (!bb) return
      const cx = (bb.x0 + bb.x1) / 2
      const cy = (bb.y0 + bb.y1) / 2
      const rad = (deg * Math.PI) / 180
      let y1 = 0
      const next = doc.strokes.map((s) => {
        if (!selected.has(s.id)) return s
        const r = rotateStroke(s, cx, cy, rad)
        y1 = Math.max(y1, strokeBBox(r).y1)
        return r
      })
      commit(next, doc.strokes, y1)
    },
    [commit, selected],
  )

  const recolorSelection = useCallback(
    (color: string) => {
      const doc = inkRef.current
      if (!doc || selected.size === 0) return
      const next = doc.strokes.map((s) =>
        selected.has(s.id) && s.color !== color ? { ...s, color } : s,
      )
      commit(next, doc.strokes)
    },
    [commit, selected],
  )

  const selectAll = useCallback(() => {
    const doc = inkRef.current
    if (!doc) return
    setSelected(new Set(doc.strokes.map((s) => s.id)))
  }, [])

  const setShapeStyle = useCallback(
    (patch: { size?: number; color?: string; fill?: string | null }) => {
      const doc = inkRef.current
      if (!doc || selected.size === 0) return
      let changed = false
      const next = doc.strokes.map((s) => {
        if (!selected.has(s.id)) return s
        const out: InkStroke = { ...s }
        if (patch.size !== undefined && patch.size !== s.size) {
          out.size = patch.size
          changed = true
        }
        if (patch.color !== undefined && patch.color !== s.color) {
          out.color = patch.color
          changed = true
        }
        if (patch.fill !== undefined && s.shape && s.shape.closed) {
          const fill = patch.fill ?? undefined
          if (fill !== s.shape.fill) {
            out.shape = { ...s.shape, ...(fill ? { fill } : {}) }
            if (!fill) delete out.shape.fill
            changed = true
          }
        }
        return out
      })
      if (changed) commit(next, doc.strokes)
    },
    [commit, selected],
  )

  const resizeSelection = useCallback(
    (factor: number) => {
      const doc = inkRef.current
      if (!doc || selected.size === 0 || !(factor > 0) || factor === 1) return
      let bb: { x0: number; y0: number; x1: number; y1: number } | null = null
      for (const s of doc.strokes) {
        if (!selected.has(s.id)) continue
        const b = strokeBBox(s)
        bb = bb
          ? { x0: Math.min(bb.x0, b.x0), y0: Math.min(bb.y0, b.y0), x1: Math.max(bb.x1, b.x1), y1: Math.max(bb.y1, b.y1) }
          : b
      }
      if (!bb) return
      const cx = (bb.x0 + bb.x1) / 2
      const cy = (bb.y0 + bb.y1) / 2
      const hw = ((bb.x1 - bb.x0) / 2) * factor
      const hh = ((bb.y1 - bb.y0) / 2) * factor
      const to = { x0: cx - hw, y0: cy - hh, x1: cx + hw, y1: cy + hh }
      const next = doc.strokes.map((s) => (selected.has(s.id) ? scaleStrokeInto(s, bb!, to) : s))
      commit(next, doc.strokes, to.y1)
    },
    [commit, selected],
  )

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  useImperativeHandle(
    ref,
    () => ({
      undo,
      redo,
      clearAll,
      deleteSelection,
      duplicateSelection,
      copySelection,
      cutSelection,
      paste,
      rotateSelection,
      recolorSelection,
      selectAll,
      clearSelection,
      setShapeStyle,
      resizeSelection,
    }),
    [
      undo,
      redo,
      clearAll,
      deleteSelection,
      duplicateSelection,
      copySelection,
      cutSelection,
      paste,
      rotateSelection,
      recolorSelection,
      selectAll,
      clearSelection,
      setShapeStyle,
      resizeSelection,
    ],
  )

  const selectedShapeCount = useMemo(() => {
    if (selected.size === 0) return 0
    let n = 0
    for (const s of strokes) if (selected.has(s.id) && s.shape) n++
    return n
  }, [selected, strokes])

  useEffect(() => {
    onSelectionChange?.(selected.size, selectedShapeCount)
  }, [onSelectionChange, selected.size, selectedShapeCount])

  /* --------------------------- Coordinate mapping -------------------------- */

  /** Refresh the cached SVG rect once per event batch (down / each move). */
  const refreshSvgRect = useCallback(() => {
    svgRectRef.current = svgRef.current?.getBoundingClientRect() ?? null
  }, [])

  const toLocal = useCallback((e: Pt): InkPoint => {
    const rect = svgRectRef.current
    const s =
      rect && rect.width > 0 && inkRef.current ? inkRef.current.width / rect.width : 1
    const pf = prefsRef.current
    const isPen = e.pointerType === 'pen'
    const pressure =
      isPen && pf.pressure !== false && e.pressure > 0
        ? Math.round(e.pressure * 100) / 100
        : undefined
    // Tilt only shapes the pencil (side-of-the-lead shading); other tools
    // ignore it so the recorded geometry stays lean.
    const tilt = isPen && pf.tilt !== false && pf.tool === 'pencil' ? tiltFromEvent(e) : undefined
    return {
      x: r01((e.clientX - (rect?.left ?? 0)) * s),
      y: r01((e.clientY - (rect?.top ?? 0)) * s),
      ...(pressure !== undefined ? { p: pressure } : {}),
      ...(tilt !== undefined ? { t: tilt } : {}),
    }
  }, [])

  /* ------------------------------ Draw pipeline ---------------------------- */

  const renderLive = useCallback(() => {
    rafRef.current = null
    const g = gestureRef.current
    const pathEl = livePathRef.current
    if (!g || g.kind !== 'draw' || !pathEl) return

    const n = g.stroke.points.length
    // Rebuilding the outline allocates; skip frames that only added a point or
    // two. The final stroke always gets a full rebuild on pointerup.
    const now = performance.now()
    if (
      n >= 8 &&
      n - liveBuiltLenRef.current < 3 &&
      now - liveBuiltAtRef.current < 32
    )
      return
    liveBuiltLenRef.current = n
    liveBuiltAtRef.current = now

    if (g.snap) {
      // Snapped: draw the clean vector shape as a stroked outline
      pathEl.setAttribute('d', shapePathD({ points: g.snap.points, shape: { kind: g.snap.kind, closed: g.snap.closed } }))
      pathEl.setAttribute('fill', 'none')
      pathEl.setAttribute('stroke', g.stroke.color)
      pathEl.setAttribute('stroke-width', String(g.stroke.size))
      pathEl.setAttribute('stroke-linejoin', 'round')
      pathEl.setAttribute('stroke-linecap', 'round')
    } else {
      pathEl.setAttribute('d', strokeOutlineD(g.stroke))
      pathEl.setAttribute('fill', g.stroke.color)
      pathEl.setAttribute('stroke', 'none')
    }

    // Predicted-events ghost tip: shows where the OS expects the pen next,
    // hiding input latency without polluting recorded geometry.
    const tipEl = liveTipRef.current
    if (tipEl && prefs.tool === 'pen') {
      let shown = false
      const last = lastNativeRef.current
      if (last?.getPredictedEvents) {
        const preds = last.getPredictedEvents()
        if (preds.length > 0) {
          const p = toLocal(preds[0]!)
          const halfW = g.stroke.size / 2
          tipEl.setAttribute('cx', String(p.x))
          tipEl.setAttribute('cy', String(p.y))
          tipEl.setAttribute('r', String(halfW))
          shown = true
        }
      }
      if (!shown) tipEl.setAttribute('r', '0')
    }
  }, [prefs.tool, toLocal])

  const scheduleRenderLive = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(renderLive)
  }, [renderLive])

  const clearHoldTimer = useCallback(() => {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current)
      holdTimerRef.current = null
    }
  }, [])

  const cancelCurrentDraw = useCallback(() => {
    clearHoldTimer()
    const g = gestureRef.current
    if (g && g.kind === 'draw') {
      gestureRef.current = null
      if (livePathRef.current) livePathRef.current.setAttribute('d', '')
    }
  }, [clearHoldTimer])

  /**
   * Hold-to-shape: (re)armed on every pen move. When the pen rests for
   * holdMs, the stroke so far is measured; a confident line / arrow /
   * ellipse / rect / triangle / polygon replaces the live stroke. Moving on
   * afterwards cancels the snap (see onPointerMove), so handwriting that
   * merely pauses is never hijacked.
   */
  const scheduleHoldCheck = useCallback(() => {
    clearHoldTimer()
    const cfg = prefsRef.current.gestures ?? DEFAULT_GESTURE_CONFIG
    if (!cfg.shapeSnap) return
    holdTimerRef.current = window.setTimeout(() => {
      holdTimerRef.current = null
      const g = gestureRef.current
      if (!g || g.kind !== 'draw' || g.snap || g.pts.length < 4) return
      const candidate = recognizeShape(g.pts)
      const applied = !!candidate && candidate.confidence >= cfg.shapeConfidence
      emitGestureDiagnostic({
        gesture: 'shape',
        decision: applied ? 'applied' : 'rejected',
        confidence: candidate?.confidence ?? 0,
        threshold: cfg.shapeConfidence,
        detail: candidate ? { kind: candidate.kind, scores: candidate.scores } : { reason: 'no candidate' },
      })
      if (!applied || !candidate) return
      g.snap = candidate
      g.snapAt = g.pts[g.pts.length - 1] ?? null
      liveBuiltLenRef.current = 0
      liveBuiltAtRef.current = -1e9
      scheduleRenderLive()
    }, cfg.holdMs)
  }, [clearHoldTimer, scheduleRenderLive])

  const finishDraw = useCallback((g: Extract<Gesture, { kind: 'draw' }>): void => {
    clearHoldTimer()
    if (livePathRef.current) livePathRef.current.setAttribute('d', '')
    if (liveTipRef.current) liveTipRef.current.setAttribute('r', '0')
    const doc = inkRef.current!
    const cfg = prefsRef.current.gestures ?? DEFAULT_GESTURE_CONFIG

    // 1. Hold-to-shape won: commit the clean vector shape (one undo step).
    if (g.snap) {
      const shape: InkStroke = {
        ...g.stroke,
        points: g.snap.points,
        shape: { kind: g.snap.kind, closed: g.snap.closed, confidence: Math.round(g.snap.confidence * 100) / 100 },
      }
      commit([...doc.strokes, shape], doc.strokes, strokeBBox(shape).y1)
      onStrokeCommitted?.(shape)
      return
    }

    const pts = simplifyPoints(smoothPressure(g.pts))
    if (pts.length === 0) return
    const elapsed = performance.now() - g.startedAt

    // 2. Tap on a recognised shape (pen/pencil): select it instead of dotting it.
    if (elapsed < 220 && g.pts.length <= 6) {
      const bb = strokeBBox({ ...g.stroke, points: g.pts })
      const tiny = bb.x1 - bb.x0 - g.stroke.size - 2 < 3 && bb.y1 - bb.y0 - g.stroke.size - 2 < 3
      if (tiny) {
        const p = g.pts[0]!
        const hit = findTopmostStroke(doc.strokes, p.x, p.y, 6, true)
        if (hit) {
          emitGestureDiagnostic({ gesture: 'tap-select', decision: 'applied', confidence: 1, threshold: 1, detail: { id: hit.id, kind: hit.shape?.kind } })
          setSelected(new Set([hit.id]))
          onRequestTool?.('select')
          return
        }
      }
    }

    // 3. Scribble / scratch-out erase (never with the highlighter).
    if (cfg.scribbleErase && g.stroke.tool !== 'highlighter' && g.pts.length >= 8) {
      const candidate = detectScribble(g.pts)
      if (candidate) {
        const confident = candidate.confidence >= cfg.scribbleConfidence
        const targets = confident
          ? scribbleTargets(g.pts, doc.strokes, { tolerance: Math.max(6, g.stroke.size) })
          : []
        emitGestureDiagnostic({
          gesture: 'scribble',
          decision: targets.length > 0 ? 'applied' : 'rejected',
          confidence: candidate.confidence,
          threshold: cfg.scribbleConfidence,
          detail: { kind: candidate.kind, reversals: candidate.reversals, density: Math.round(candidate.density * 10) / 10, targets: targets.length },
        })
        if (targets.length > 0) {
          const gone = new Set(targets.map((t) => t.id))
          commit(doc.strokes.filter((s) => !gone.has(s.id)), doc.strokes)
          return
        }
      }
    }

    // 4. Ordinary handwriting.
    const finished: InkStroke = { ...g.stroke, points: pts }
    commit([...doc.strokes, finished], doc.strokes, strokeBBox(finished).y1)
    onStrokeCommitted?.(finished)
  }, [clearHoldTimer, commit, onRequestTool, onStrokeCommitted])

  /* ------------------------------ Erase pipeline --------------------------- */

  /** Single source of truth: ring, hit-testing and the palette all read this. */
  const eraserRadiusCapture = useCallback(
    (): number => (sizesForTool('eraser')[prefs.sizeIdx] ?? 24) / 2 / (scale || 1),
    [prefs.sizeIdx, scale],
  )

  const eraseAt = useCallback(
    (x: number, y: number) => {
      const g = gestureRef.current
      if (!g || g.kind !== 'erase') return
      const r = eraserRadiusCapture()
      let changed = false
      const working: InkStroke[] = []
      for (const s of g.working) {
        if (prefs.eraserMode === 'pixel') {
          const parts = eraseStrokePartially(s, x, y, r)
          if (parts === null) working.push(s)
          else {
            changed = true
            working.push(...parts)
          }
        } else if (strokeHits(s, x, y, r)) changed = true
        else working.push(s)
      }
      if (changed) {
        g.working = working
        g.changed = true
        uiPendingRef.current.erasing = working
        scheduleUi()
      }
    },
    [eraserRadiusCapture, prefs.eraserMode, scheduleUi],
  )

  const finishErase = useCallback(
    (g: Gesture & { kind: 'erase' }): void => {
      flushUi()
      setErasingStrokes(null)
      uiPendingRef.current.erasing = null
      if (!g.changed) return
      // Erasing can only shrink content — no growToY1.
      commit(g.working, g.base)
    },
    [commit, flushUi],
  )

  /* ------------------------- Selection interactions ------------------------ */

  const selectionBBox = useMemo(() => {
    if (selected.size === 0) return null
    let bb: { x0: number; y0: number; x1: number; y1: number } | null = null
    for (const s of strokes) {
      if (!selected.has(s.id)) continue
      const b = strokeBBox(s)
      bb = bb
        ? {
            x0: Math.min(bb.x0, b.x0),
            y0: Math.min(bb.y0, b.y0),
            x1: Math.max(bb.x1, b.x1),
            y1: Math.max(bb.y1, b.y1),
          }
        : b
    }
    return bb
  }, [selected, strokes])

  const finishSelectMove = useCallback(
    (g: Gesture & { kind: 'select-move' }): void => {
      flushUi()
      setMovePreview(null)
      uiPendingRef.current.move = null
      if (g.dx === 0 && g.dy === 0) return
      const doc = inkRef.current!
      const next = doc.strokes.map((s) =>
        selected.has(s.id) ? translateStroke(s, g.dx, g.dy) : s,
      )
      // Moved selection may have grown downward
      commit(next, doc.strokes, (selectionBBox?.y1 ?? 0) + g.dy)
    },
    [commit, flushUi, selectionBBox, selected],
  )

  const finishSelectScale = useCallback(
    (g: Gesture & { kind: 'select-scale' }): void => {
      flushUi()
      setScalePreview(null)
      uiPendingRef.current.scale = null
      const doc = inkRef.current!
      const to = g.to
      if (to.x0 === g.origin.x0 && to.y0 === g.origin.y0 && to.x1 === g.origin.x1 && to.y1 === g.origin.y1) return
      const next = doc.strokes.map((s) =>
        selected.has(s.id) ? scaleStrokeInto(s, g.origin, to) : s,
      )
      commit(next, doc.strokes, to.y1)
    },
    [commit, flushUi, selected],
  )

  const finishSelectRotate = useCallback(
    (g: Gesture & { kind: 'select-rotate' }): void => {
      flushUi()
      setRotatePreview(null)
      uiPendingRef.current.rotate = null
      if (Math.abs(g.deg) < 0.5) return
      const doc = inkRef.current!
      const rad = (g.deg * Math.PI) / 180
      let y1 = 0
      const next = doc.strokes.map((s) => {
        if (!selected.has(s.id)) return s
        const r = rotateStroke(s, g.cx, g.cy, rad)
        y1 = Math.max(y1, strokeBBox(r).y1)
        return r
      })
      commit(next, doc.strokes, y1)
    },
    [commit, flushUi, selected],
  )

  /** Bbox for a corner drag: the opposite corner stays put; Shift keeps proportions. */
  const scaledBox = (
    origin: { x0: number; y0: number; x1: number; y1: number },
    corner: Corner,
    p: InkPoint,
    keepRatio: boolean,
  ): { x0: number; y0: number; x1: number; y1: number } => {
    const MIN = 12
    const ax = corner === 'nw' || corner === 'sw' ? origin.x1 : origin.x0
    const ay = corner === 'nw' || corner === 'ne' ? origin.y1 : origin.y0
    let w = Math.max(MIN, Math.abs(p.x - ax))
    let h = Math.max(MIN, Math.abs(p.y - ay))
    if (keepRatio) {
      const ow = origin.x1 - origin.x0 || 1
      const oh = origin.y1 - origin.y0 || 1
      const k = Math.max(w / ow, h / oh)
      w = ow * k
      h = oh * k
    }
    const left = corner === 'nw' || corner === 'sw'
    const top = corner === 'nw' || corner === 'ne'
    return {
      x0: left ? ax - w : ax,
      x1: left ? ax : ax + w,
      y0: top ? ay - h : ay,
      y1: top ? ay : ay + h,
    }
  }

  /* ------------------------------ Pointer events --------------------------- */

  const beginPanIfNeeded = (p: Pt): boolean => {
    if (p.pointerType !== 'touch') return false
    touchIds.current = [...touchIds.current, p.pointerId]
    // Two fingers always pan; one finger pans too when touch is set to scroll.
    if (touchIds.current.length >= 2 || prefsRef.current.touchDraws === false) {
      cancelCurrentDraw()
      gestureRef.current = { kind: 'pan', lastY: toLocal(p).y }
      return true
    }
    return false
  }

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!active) return
    onPointerDownCapture?.()
    // Primary button only — right-click opens the pen palette via
    // onContextMenu, and must never start a draw/erase gesture.
    if (e.button !== 0) return
    e.preventDefault()

    const native = e.nativeEvent
    const now = performance.now()
    if (native.pointerType === 'pen') {
      notePenSample(native)
      lastPenAtRef.current = now
      // A finger stroke already in flight was the palm settling before the
      // nib landed — drop it rather than keep a smear.
      const owner = gesturePointerRef.current
      if (owner && owner.type === 'touch' && gestureRef.current?.kind === 'draw') {
        cancelCurrentDraw()
        gesturePointerRef.current = null
      }
    } else if (native.pointerType === 'touch') {
      // Palm rejection: while the pen is (or was just) down, touches are noise.
      const penOwnsGesture = gesturePointerRef.current?.type === 'pen'
      if (penOwnsGesture || now - lastPenAtRef.current < PALM_WINDOW_MS) return
    }

    refreshSvgRect()
    if (beginPanIfNeeded(native)) return
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch { /* ignore */ }
    gesturePointerRef.current = { id: e.pointerId, type: native.pointerType }
    setInkGestureActive(true)

    // Lazily size the draft doc for brand-new notes
    if (!inkRef.current) {
      draftRef.current = displayDoc
        ? { ...displayDoc, strokes: [...displayDoc.strokes] }
        : {
            v: 1,
            width: Math.max(Math.round(box.w), 320),
            height: Math.max(Math.round(box.h), 480),
            strokes: [],
          }
      inkRef.current = draftRef.current
    }

    const p = toLocal(native)

    if (prefs.tool === 'eraser') {
      gestureRef.current = {
        kind: 'erase',
        base: inkRef.current.strokes,
        working: inkRef.current.strokes,
        changed: false,
      }
      uiPendingRef.current.cursor = { ...p, hover: false }
      scheduleUi()
      eraseAt(p.x, p.y)
      return
    }

    if (prefs.tool === 'select') {
      if (selectionBBox) {
        const hr = 12 / (scale || 1)
        const bb = selectionBBox
        const corners: Array<[Corner, number, number]> = [
          ['nw', bb.x0, bb.y0],
          ['ne', bb.x1, bb.y0],
          ['sw', bb.x0, bb.y1],
          ['se', bb.x1, bb.y1],
        ]
        for (const [corner, cx, cy] of corners) {
          const ddx = p.x - cx
          const ddy = p.y - cy
          if (ddx * ddx + ddy * ddy <= hr * hr * 4) {
            gestureRef.current = { kind: 'select-scale', corner, origin: bb, to: bb }
            return
          }
        }
        const rx = (bb.x0 + bb.x1) / 2
        const ry = bb.y0 - ROTATE_HANDLE_OFFSET / (scale || 1)
        const rdx = p.x - rx
        const rdy = p.y - ry
        if (rdx * rdx + rdy * rdy <= hr * hr * 4) {
          const cx = (bb.x0 + bb.x1) / 2
          const cy = (bb.y0 + bb.y1) / 2
          gestureRef.current = { kind: 'select-rotate', cx, cy, startAngle: Math.atan2(p.y - cy, p.x - cx), deg: 0 }
          return
        }
        // Dragging inside the box moves the whole selection
        if (p.x >= bb.x0 && p.x <= bb.x1 && p.y >= bb.y0 && p.y <= bb.y1 && !e.shiftKey) {
          const inside = findTopmostStroke(inkRef.current.strokes, p.x, p.y)
          if (!inside || selected.has(inside.id)) {
            gestureRef.current = { kind: 'select-move', dx: 0, dy: 0, last: p }
            return
          }
        }
      }
      const hit = findTopmostStroke(inkRef.current.strokes, p.x, p.y)
      if (hit) {
        setSelected((prev) => {
          const next = new Set(e.shiftKey ? prev : [])
          next.add(hit.id)
          return next
        })
        gestureRef.current = { kind: 'select-move', dx: 0, dy: 0, last: p }
      } else {
        setSelected(new Set())
        const pts = [p]
        gestureRef.current = { kind: 'lasso', pts }
        uiPendingRef.current.lasso = pts
        scheduleUi()
      }
      return
    }

    // Draw (pen / pencil / highlighter)
    const size =
      sizesForTool(prefs.tool)[prefs.sizeIdx] ?? PEN_SIZES[1]!
    liveBuiltLenRef.current = 0
    liveBuiltAtRef.current = -1e9
    uiPendingRef.current.cursor = null
    scheduleUi()
    gestureRef.current = {
      kind: 'draw',
      pts: [p],
      startedAt: now,
      snap: null,
      snapAt: null,
      stroke: {
        id: createId(),
        tool: prefs.tool,
        color: prefs.color,
        size,
        points: [],
        ...(prefs.opacity !== undefined ? { opacity: prefs.opacity } : {}),
      },
    }
    scheduleRenderLive()
    scheduleHoldCheck()
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!active) return
    const native = e.nativeEvent
    lastNativeRef.current = native

    const g = gestureRef.current

    // One rect read per event batch — coalesced samples reuse the cache.
    refreshSvgRect()

    if (native.pointerType === 'pen') {
      notePenSample(native)
      if (g) lastPenAtRef.current = performance.now()
    }

    if (!g) {
      // Eraser ring follows any pointer before pressing; drawing tools get a
      // tip preview only under a hovering stylus (Apple Pencil on M2+ iPads).
      if (prefs.tool === 'eraser') {
        uiPendingRef.current.cursor = { ...toLocal(native), hover: false }
        scheduleUi()
      } else if (
        native.pointerType === 'pen' &&
        prefs.hoverPreview !== false &&
        prefs.tool !== 'select'
      ) {
        uiPendingRef.current.cursor = { ...toLocal(native), hover: true }
        scheduleUi()
      }
      return
    }
    // Only the pointer that started the gesture may drive it (palm rejection).
    const owner = gesturePointerRef.current
    if (owner && owner.id !== native.pointerId && g.kind !== 'pan') return
    e.preventDefault()

    // Coalesced events deliver every input sample between frames (low latency)
    const events: Pt[] =
      typeof native.getCoalescedEvents === 'function'
        ? (native.getCoalescedEvents() as Pt[]).filter(Boolean)
        : []
    if (events.length === 0) events.push(native)

    if (g.kind === 'draw') {
      let moved = false
      for (const ev of events) {
        const p = toLocal(ev)
        const prev = g.pts[g.pts.length - 1]
        if (prev) {
          const dx = p.x - prev.x
          const dy = p.y - prev.y
          if (dx * dx + dy * dy < MIN_DRAW_DIST_SQ) continue
        }
        g.pts.push(p)
        moved = true
      }
      if (moved) {
        // Drawing on after a snap cancels it — the user was not done.
        if (g.snap && g.snapAt) {
          const last = g.pts[g.pts.length - 1]!
          const dx = last.x - g.snapAt.x
          const dy = last.y - g.snapAt.y
          if (dx * dx + dy * dy > SNAP_CANCEL_DIST_SQ) {
            emitGestureDiagnostic({ gesture: 'shape', decision: 'cancelled', confidence: g.snap.confidence, threshold: 0, detail: { kind: g.snap.kind } })
            g.snap = null
            g.snapAt = null
            liveBuiltLenRef.current = 0
            liveBuiltAtRef.current = -1e9
          }
        }
        if (!g.snap) scheduleHoldCheck()
      }
      g.stroke.points = g.pts
      scheduleRenderLive()
      return
    }

    const p = toLocal(events[events.length - 1]!)

    switch (g.kind) {
      case 'erase':
        uiPendingRef.current.cursor = { ...p, hover: false }
        eraseAt(p.x, p.y)
        scheduleUi()
        break
      case 'pan': {
        const scroller = scrollRef.current
        if (scroller) scroller.scrollTop -= (p.y - g.lastY) / (scale || 1)
        g.lastY = p.y
        break
      }
      case 'select-move':
        g.dx += p.x - g.last.x
        g.dy += p.y - g.last.y
        g.last = p
        uiPendingRef.current.move = { dx: g.dx, dy: g.dy }
        scheduleUi()
        break
      case 'select-scale': {
        g.to = scaledBox(g.origin, g.corner, p, native.shiftKey === true)
        uiPendingRef.current.scale = g.to
        scheduleUi()
        break
      }
      case 'select-rotate': {
        const a = Math.atan2(p.y - g.cy, p.x - g.cx)
        let deg = ((a - g.startAngle) * 180) / Math.PI
        // Shift snaps to 15° steps
        if (native.shiftKey) deg = Math.round(deg / 15) * 15
        g.deg = deg
        uiPendingRef.current.rotate = { deg, cx: g.cx, cy: g.cy }
        scheduleUi()
        break
      }
      case 'lasso': {
        const prev = g.pts[g.pts.length - 1]!
        const dx = p.x - prev.x
        const dy = p.y - prev.y
        if (dx * dx + dy * dy >= 4) {
          g.pts.push(p)
          uiPendingRef.current.lasso = g.pts
          scheduleUi()
        }
        break
      }
    }
  }

  const onPointerLeave = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (gestureRef.current) return
    if (e.pointerType === 'pen' || prefs.tool === 'eraser') {
      uiPendingRef.current.cursor = null
      scheduleUi()
    }
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (e.pointerType === 'touch') {
      touchIds.current = touchIds.current.filter((id) => id !== e.pointerId)
    }
    const g = gestureRef.current
    if (!g) return
    const owner = gesturePointerRef.current
    if (owner && owner.id !== e.pointerId && g.kind !== 'pan') return
    e.preventDefault()

    if (g.kind === 'pan') {
      if (touchIds.current.length < 2) gestureRef.current = null
      return
    }
    gestureRef.current = null
    gesturePointerRef.current = null
    setInkGestureActive(false)

    switch (g.kind) {
      case 'draw':
        finishDraw(g)
        break
      case 'erase':
        finishErase(g)
        break
      case 'select-move':
        finishSelectMove(g)
        break
      case 'select-scale':
        finishSelectScale(g)
        break
      case 'select-rotate':
        finishSelectRotate(g)
        break
      case 'lasso': {
        const picked = new Set<string>()
        if (g.pts.length >= 3) {
          for (const s of inkRef.current?.strokes ?? []) {
            if (strokeInLasso(s, g.pts)) picked.add(s.id)
          }
        }
        setSelected(picked)
        uiPendingRef.current.lasso = null
        setLasso(null)
        break
      }
    }
  }

  /* -------------------------------- Keyboard ------------------------------- */

  useEffect(() => {
    if (!active || !keyboard) return
    const onKey = (e: KeyboardEvent): void => {
      // Never steal keys while the user is typing text or a dialog is up —
      // otherwise Ctrl+Z would undo ink AND text (tiptap runs first), and
      // Backspace in the title field would delete strokes.
      if (isTypingTarget(e.target)) return
      const ui = useUIStore.getState()
      if (ui.modalStack.length > 0 || ui.sidebarDrawerOpen) return
      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          if (redoStack.current.length > 0) {
            e.preventDefault()
            redo()
          }
        } else if (undoStack.current.length > 0) {
          e.preventDefault()
          undo()
        }
        return
      }
      if (mod && e.key.toLowerCase() === 'y') {
        if (redoStack.current.length > 0) {
          e.preventDefault()
          redo()
        }
        return
      }
      if (mod && selected.size > 0) {
        const k = e.key.toLowerCase()
        if (k === 'c') {
          e.preventDefault()
          copySelection()
          return
        }
        if (k === 'x') {
          e.preventDefault()
          cutSelection()
          return
        }
        if (k === 'd') {
          e.preventDefault()
          duplicateSelection()
          return
        }
      }
      if (mod && e.key.toLowerCase() === 'v' && getInkClipboard().length > 0) {
        e.preventDefault()
        paste()
        return
      }
      if (mod && e.key.toLowerCase() === 'a' && prefsRef.current.tool === 'select') {
        e.preventDefault()
        selectAll()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0) {
        e.preventDefault()
        deleteSelection()
        return
      }
      if (e.key === 'Escape') setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    active,
    keyboard,
    copySelection,
    cutSelection,
    deleteSelection,
    duplicateSelection,
    paste,
    redo,
    selectAll,
    selected.size,
    undo,
  ])

  // Deactivation mid-gesture (mode switch, unmount) must not leave the
  // floating toolbar faded or a stale gesture owner behind.
  useEffect(() => {
    if (active) return
    clearHoldTimer()
    gestureRef.current = null
    gesturePointerRef.current = null
    setInkGestureActive(false)
    setCursorPos(null)
  }, [active, clearHoldTimer])
  useEffect(() => () => setInkGestureActive(false), [])

  /* Drop stale selection ids when strokes change externally (undo etc.) */
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev
      const alive = new Set(strokes.map((s) => s.id))
      const filtered = new Set([...prev].filter((id) => alive.has(id)))
      return filtered.size === prev.size ? prev : filtered
    })
  }, [strokes])

  /* -------------------------------- Rendering ------------------------------ */

  const { highlights, pens } = useMemo(() => {
    const hl: InkStroke[] = []
    const pn: InkStroke[] = []
    for (const s of strokes) (s.tool === 'highlighter' ? hl : pn).push(s)
    return { highlights: hl, pens: pn }
  }, [strokes])

  const selectionTransform =
    movePreview && (movePreview.dx !== 0 || movePreview.dy !== 0)
      ? `translate(${movePreview.dx} ${movePreview.dy})`
      : rotatePreview && rotatePreview.deg !== 0
        ? `rotate(${rotatePreview.deg} ${rotatePreview.cx} ${rotatePreview.cy})`
        : undefined
  const renderStroke = (s: InkStroke): React.ReactNode => (
    <StrokePath key={s.id} stroke={s} transform={selected.has(s.id) ? selectionTransform : undefined} />
  )

  return (
    <div ref={wrapRef} data-active={active || undefined} className="ink-layer" aria-hidden={!active}>
      {/* Strokes stay visible while typing (layer is pointer-inert until pen
          mode re-activates), so ink never "vanishes" between modes. */}
      {displayDoc && box.w > 0 && (
        <svg
          ref={svgRef}
          className={`ink-svg ink-tool-${prefs.tool}`}
          width="100%"
          height={dispViewH * dispScale}
          viewBox={`0 0 ${displayDoc.width} ${Math.max(displayDoc.height, box.h / (scale || 1))}`}
          role="application"
          aria-label="Handwriting canvas"          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerLeave={onPointerLeave}
          onContextMenu={(e) => {
            e.preventDefault()
            onPaletteRequest?.(e.clientX, e.clientY)
          }}
        >
          {/* Highlighters beneath pen strokes */}
          {highlights.map(renderStroke)}
          {pens.map(renderStroke)}

          {/* In-progress stroke */}
          <path
            ref={livePathRef}
            className={`ink-live${
              prefs.tool === 'highlighter'
                ? ' ink-hl-path'
                : prefs.tool === 'pencil'
                  ? ' ink-pencil-path'
                  : ''
            }`}
            fill={prefs.color}
            style={prefs.opacity !== undefined ? { opacity: prefs.opacity } : undefined}
          />

          {/* Predicted-input ghost tip (pen only) — visual latency compensation */}
          <circle ref={liveTipRef} r={0} className="ink-live-tip" fill={prefs.color} />

          {lasso && lasso.length > 1 && (
            <path
              d={`${polylineToPath(lasso)} Z`}
              className="ink-marquee"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {selectionBBox && (() => {
            const box = scalePreview ?? {
              x0: selectionBBox.x0 + (movePreview?.dx ?? 0),
              y0: selectionBBox.y0 + (movePreview?.dy ?? 0),
              x1: selectionBBox.x1 + (movePreview?.dx ?? 0),
              y1: selectionBBox.y1 + (movePreview?.dy ?? 0),
            }
            const hr = 7 / (scale || 1)
            const midX = (box.x0 + box.x1) / 2
            const rotY = box.y0 - ROTATE_HANDLE_OFFSET / (scale || 1)
            const group = rotatePreview && rotatePreview.deg !== 0 ? `rotate(${rotatePreview.deg} ${rotatePreview.cx} ${rotatePreview.cy})` : undefined
            return (
              <g transform={group} data-testid="ink-selection">
                <rect
                  x={box.x0}
                  y={box.y0}
                  width={box.x1 - box.x0}
                  height={box.y1 - box.y0}
                  className="ink-selection"
                  vectorEffect="non-scaling-stroke"
                />
                <line x1={midX} y1={box.y0} x2={midX} y2={rotY} className="ink-selection" vectorEffect="non-scaling-stroke" />
                <circle cx={midX} cy={rotY} r={hr} className="ink-handle ink-handle-rotate" vectorEffect="non-scaling-stroke" />
                {(
                  [
                    [box.x0, box.y0, 'nw'],
                    [box.x1, box.y0, 'ne'],
                    [box.x0, box.y1, 'sw'],
                    [box.x1, box.y1, 'se'],
                  ] as Array<[number, number, Corner]>
                ).map(([cx, cy, c]) => (
                  <circle key={c} cx={cx} cy={cy} r={hr} className="ink-handle" data-corner={c} vectorEffect="non-scaling-stroke" />
                ))}
              </g>
            )
          })()}

          {active && cursorPos && prefs.tool === 'eraser' && (
            <circle
              cx={cursorPos.x}
              cy={cursorPos.y}
              r={eraserRadiusCapture()}
              className="ink-cursor-ring"
              vectorEffect="non-scaling-stroke"
            />
          )}

          {/* Hovering stylus: a faint ring the size and colour of the next mark */}
          {active && cursorPos?.hover && prefs.tool !== 'eraser' && prefs.tool !== 'select' && (
            <circle
              cx={cursorPos.x}
              cy={cursorPos.y}
              r={Math.max(1.5, (sizesForTool(prefs.tool)[prefs.sizeIdx] ?? 4) / 2)}
              className="ink-hover-ring"
              stroke={prefs.color}
              fill={prefs.color}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}
    </div>
  )
})

/** Distance (screen-ish px) of the rotate handle above the selection box. */
const ROTATE_HANDLE_OFFSET = 26
/** Pen travel (capture px²) after a snap that cancels the recognised shape. */
const SNAP_CANCEL_DIST_SQ = 8 * 8

function findTopmostStroke(
  strokes: InkStroke[],
  x: number,
  y: number,
  radius = 8,
  shapesOnly = false,
): InkStroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i]!
    if (shapesOnly && !s.shape) continue
    if (strokeHits(s, x, y, radius)) return s
  }
  return null
}

/** One memoized <path> per committed stroke — unchanged strokes never re-render. */
const StrokePath = memo(function StrokePath({
  stroke,
  transform,
}: {
  stroke: InkStroke
  transform?: string
}): React.ReactNode {
  const isHl = stroke.tool === 'highlighter'
  const cls = isHl ? 'ink-hl-path' : stroke.tool === 'pencil' ? 'ink-pencil-path' : undefined
  const style = stroke.opacity !== undefined ? { opacity: stroke.opacity } : undefined
  if (stroke.shape) {
    // Recognised shapes are stroked outlines (optionally filled) so their
    // edges stay crisp at any size; the geometry lives in `points`.
    return (
      <path
        d={shapePathD(stroke)}
        fill={stroke.shape.closed && stroke.shape.fill ? stroke.shape.fill : 'none'}
        stroke={stroke.color}
        strokeWidth={stroke.size}
        strokeLinejoin="round"
        strokeLinecap="round"
        className={cls}
        style={style}
        transform={transform}
        pointerEvents="none"
        data-shape={stroke.shape.kind}
      />
    )
  }
  return (
    <path
      d={strokeOutlineD(stroke)}
      fill={stroke.color}
      className={cls}
      style={style}
      transform={transform}
      pointerEvents="none"
    />
  )
})

