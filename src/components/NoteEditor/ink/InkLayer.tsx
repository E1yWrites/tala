import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { forwardRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createId } from '@/utils/id'
import { useUIStore } from '@/store/uiStore'
import { useZoom } from '@/canvas/ZoomColumn'
import { paintWetSegments, wetCanvasSize } from '@/canvas/wetInk'
import { lassoPath, strokesInLasso } from '@/canvas/lasso'
import { classifyShape, shapeToPoints } from '@/canvas/snapShape'

/** True while the user is typing in a text field. */
export function isTypingTarget(target: EventTarget | null): boolean {
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
  scaleStrokeInto,
  simplifyPoints,
  strokeBBox,
  strokeHits,
  strokeOutlineD,
  translateStroke,
} from '@/utils/ink'
import type { InkDoc, InkEraserMode, InkPointerMode, InkPoint, InkStroke } from '@/types/ink'
import { ERASER_SIZES, HIGHLIGHTER_SIZES, PEN_SIZES, sizesForTool } from '@/types/ink'

/* ---------------------------------------------------------------------------
   The handwriting canvas: an SVG overlay covering one page of the note.
   Committed strokes are one <path> each (memoized); the in-progress stroke is
   mutated directly inside requestAnimationFrame so drawing never re-renders
   React. Coordinates are captured in "capture space" (the content-column width
   at first stroke); the SVG viewBox scales strokes when the note resizes.
--------------------------------------------------------------------------- */

// Thickness presets live in types/ink.ts (next to the data model they feed);
// re-exported here for the tool UI which has always imported them from here.
export { PEN_SIZES, HIGHLIGHTER_SIZES, ERASER_SIZES }

/** Resting the pen this long at the end of a stroke snaps it to a clean shape. */
const SNAP_HOLD_MS = 550
/** Pen movement (screen px) that still counts as holding still. */
const SNAP_JITTER_PX = 4

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
  /** Whether a hovering Apple Pencil shows a preview tip ring (Pencil Pref). */
  pencilHover: boolean
}

export interface InkLayerHandle {
  deleteSelection: () => void
  recolorSelection: (color: string) => void
  duplicateSelection: () => void
  clearSelection: () => void
}

interface InkLayerProps {
  ink: InkDoc | null
  /** A committed change; `before` is what undo restores (the note keeps the history). */
  onCommit: (ink: InkDoc, before: InkStroke[]) => void
  active: boolean
  /** Keep a full-size wet-ink canvas. Only the page being written on has one (iOS caps canvas memory). */
  wet: boolean
  /** A gesture started here: the page wants the wet canvas. */
  onEngage?: () => void
  prefs: InkPrefsSnapshot
  /**
   * Right-click / secondary-click on the canvas while pen mode is active.
   * The browser menu is suppressed here — and only here, since the svg mounts
   * solely while pen mode is active — so the rest of the app keeps its menus.
   */
  onPaletteRequest?: (clientX: number, clientY: number) => void
  /** Called when the ink selection size changes (contextual selection actions). */
  onSelectionChange?: (count: number) => void
  /** A lecture is being recorded for this note: new strokes get a timestamp. */
  recording?: boolean
  /** Select-tool tap on a timestamped stroke: jump the lecture audio to when it was written. */
  onStrokeTap?: (ts: number) => void
}

type Gesture =
  | { kind: 'draw'; stroke: InkStroke; pts: InkPoint[]; anchor?: InkPoint; snapped?: boolean }
  | { kind: 'erase'; base: InkStroke[]; working: InkStroke[]; changed: boolean }
  | { kind: 'pinch' }
  | { kind: 'select-move'; dx: number; dy: number; last: InkPoint; hit: InkStroke }
  | {
      kind: 'select-scale'
      anchor: InkPoint
      origin: { x0: number; y0: number; x1: number; y1: number }
    }
  | { kind: 'lasso'; pts: InkPoint[] }

/** Minimal pointer shape so native coalesced events need no casting. */
interface Pt {
  clientX: number
  clientY: number
  pointerType: string
  pressure: number
  pointerId: number
  tiltX?: number
  tiltY?: number
  getCoalescedEvents?(): Pt[]
  getPredictedEvents?(): Pt[]
}

const EMPTY_STROKES: InkStroke[] = []

export const InkLayer = forwardRef<InkLayerHandle, InkLayerProps>(function InkLayer(
  {
    ink,
    onCommit,
    active,
    wet,
    onEngage,
    prefs,
    onPaletteRequest,
    onSelectionChange,
    recording,
    onStrokeTap,
  },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const livePathRef = useRef<SVGPathElement | null>(null)
  const liveTipRef = useRef<SVGCircleElement | null>(null)
  /** Wet-ink canvas for the opaque pen: segments painted so far for the current stroke. */
  const wetRef = useRef<HTMLCanvasElement | null>(null)
  const wetDrawn = useRef(0)
  const holdTimer = useRef<number | null>(null)
  /** Set when `localStorage['tala:inkdebug']` is on: pointerdown time awaiting its first wet paint. */
  const latencyT0 = useRef(0)

  /** Cached getBoundingClientRect — refreshed once per event batch, never per
   *  coalesced sample (layout reads were the hottest no-op in the loop). */
  const svgRectRef = useRef<DOMRect | null>(null)

  const gestureRef = useRef<Gesture | null>(null)
  const rafRef = useRef<number | null>(null)
  /** Live-rebuild throttle bookkeeping (see renderLive). */
  const liveBuiltLenRef = useRef(0)
  const liveBuiltAtRef = useRef(-1e9)
  const touchIds = useRef<number[]>([])
  const lastNativeRef = useRef<Pt | null>(null)
  /** Active Apple Pencil pointer id — while set, touch contacts are treated as
   *  palm/mid-gesture noise and must not start draw/erase strokes. */
  const activePenId = useRef<number | null>(null)

  /**
   * Draft doc for brand-new notes: created locally on the very first stroke so
   * an untouched note is never written to IndexedDB just for opening pen mode.
   */
  const draftRef = useRef<InkDoc | null>(null)
  const effDoc = ink ?? draftRef.current

  const inkRef = useRef<InkDoc | null>(effDoc)
  inkRef.current = effDoc

  const [selected, setSelected] = useState<Set<string>>(new Set())

  // Surface selection size so the editor can show contextual actions.
  const selCount = selected.size
  useEffect(() => {
    onSelectionChange?.(selCount)
  }, [selCount, onSelectionChange])
  const [lasso, setLasso] = useState<InkPoint[] | null>(null)
  const [movePreview, setMovePreview] = useState<{ dx: number; dy: number } | null>(null)
  const [erasingStrokes, setErasingStrokes] = useState<InkStroke[] | null>(null)
  const [cursorPos, setCursorPos] = useState<{
    x: number
    y: number
    pen?: boolean
    mouse?: boolean
  } | null>(null)

  /**
   * Transient gesture visuals (eraser ring, erase preview, marquee, move
   * preview) are queued here and flushed at most once per animation frame —
   * pointermove fires far more often than paint.
   */
  interface UiPending {
    /** Pointer position while idle (eraser ring / brush preview ring). `pen`
     *  marks a hover-feeding Apple Pencil, `mouse` a desktop mouse — both show
     *  a brush-size preview ring so the tool feels ready before any stylus. */
    cursor?: { x: number; y: number; pen?: boolean; mouse?: boolean } | null
    erasing?: InkStroke[] | null
    lasso?: InkPoint[] | null
    move?: { dx: number; dy: number } | null
  }
  const uiFrameRef = useRef<number | null>(null)
  const uiPendingRef = useRef<UiPending>({})

  const flushUi = useCallback(() => {
    uiFrameRef.current = null
    const p = uiPendingRef.current
    uiPendingRef.current = {}
    if ('cursor' in p) setCursorPos(p.cursor ?? null)
    if ('erasing' in p) setErasingStrokes(p.erasing ?? null)
    if ('lasso' in p) setLasso(p.lasso ?? null)
    if ('move' in p) setMovePreview(p.move ?? null)
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

  // iPadOS gives a Pencil drag to its own gestures (Scribble, text selection,
  // the magnifier, scrolling) unless the touch is cancelled; WebKit then fires
  // pointercancel and the stroke ends early. Pointer events still arrive after
  // preventDefault, so drawing is unaffected; fingers are left to scroll/pinch.
  useEffect(() => {
    const el = wrapRef.current
    if (!el || !active) return
    const onTouch = (e: TouchEvent): void => {
      for (const t of Array.from(e.changedTouches)) {
        if ((t as Touch & { touchType?: string }).touchType === 'stylus') {
          e.preventDefault()
          return
        }
      }
    }
    el.addEventListener('touchstart', onTouch, { passive: false })
    el.addEventListener('touchmove', onTouch, { passive: false })
    return () => {
      el.removeEventListener('touchstart', onTouch)
      el.removeEventListener('touchmove', onTouch)
    }
  }, [active])

  // A pending draw/UI frame must not fire after unmount/deactivation.
  useEffect(
    () => () => {
      activePenId.current = null
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
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

  const zoom = useZoom()
  /** Screen px per capture unit: radii and handles stay a constant on-screen size when zoomed. */
  const scale = dispScale * zoom
  const strokes = erasingStrokes ?? effDoc?.strokes ?? EMPTY_STROKES

  // Size the wet canvas to the SVG's CSS box (crisp at the settled zoom); never
  // resize one in use mid-stroke (an empty one may be sized: the stroke so far
  // is repainted onto it). Other layers release their backing store: iOS blanks
  // canvases once their total memory passes a cap, and several pages are mounted.
  const wetCssW = box.w
  const wetCssH = Math.round(dispViewH * dispScale)
  useEffect(() => {
    const c = wetRef.current
    if (!c || (gestureRef.current?.kind === 'draw' && c.width > 0)) return
    const { w, h } =
      active && wet && wetCssW > 0 && wetCssH > 0
        ? wetCanvasSize(wetCssW, wetCssH, window.devicePixelRatio || 1, zoom)
        : { w: 0, h: 0 }
    if (c.width !== w || c.height !== h) {
      c.width = w
      c.height = h
    }
  }, [active, wet, wetCssW, wetCssH, zoom])

  /* -------------------------------- Commits -------------------------------- */

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
      onCommit({ ...doc, height, strokes: nextStrokes }, before)
    },
    [box.h, box.w, onCommit],
  )

  const deleteSelection = useCallback(() => {
    const doc = inkRef.current
    if (!doc || selected.size === 0) return
    commit(
      doc.strokes.filter((s) => !selected.has(s.id)),
      doc.strokes,
    )
    setSelected(new Set())
  }, [commit, selected])

  const recolorSelection = useCallback(
    (color: string) => {
      const doc = inkRef.current
      if (!doc || selected.size === 0) return
      commit(
        doc.strokes.map((s) => (selected.has(s.id) ? { ...s, color } : s)),
        doc.strokes,
      )
    },
    [commit, selected],
  )

  /** Copy the selection a little down-right of the original and select the copy. */
  const duplicateSelection = useCallback(() => {
    const doc = inkRef.current
    if (!doc || selected.size === 0) return
    const OFFSET = 16
    const copies = doc.strokes
      .filter((s) => selected.has(s.id))
      .map((s) => ({ ...translateStroke(s, OFFSET, OFFSET), id: createId() }))
    if (copies.length === 0) return
    commit(
      [...doc.strokes, ...copies],
      doc.strokes,
      Math.max(...copies.map((c) => strokeBBox(c).y1)),
    )
    setSelected(new Set(copies.map((c) => c.id)))
  }, [commit, selected])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  useImperativeHandle(
    ref,
    () => ({ deleteSelection, recolorSelection, duplicateSelection, clearSelection }),
    [deleteSelection, recolorSelection, duplicateSelection, clearSelection],
  )

  /* --------------------------- Coordinate mapping -------------------------- */

  /** Refresh the cached SVG rect once per event batch (down / each move). */
  const refreshSvgRect = useCallback(() => {
    svgRectRef.current = svgRef.current?.getBoundingClientRect() ?? null
  }, [])

  const toLocal = useCallback((e: Pt): InkPoint => {
    const rect = svgRectRef.current
    const s =
      rect && rect.width > 0 && inkRef.current ? inkRef.current.width / rect.width : 1
    const pressure =
      e.pointerType === 'pen' && e.pressure > 0 ? Math.round(e.pressure * 100) / 100 : undefined
    // Pens report tiltX/tiltY projections even for mouse (0). Only fold the
    // combined declination in for actual pen pointers so keyboard/mouse
    // drawings stay at the preset width.
    const tilt =
      e.pointerType === 'pen' &&
      typeof e.tiltX === 'number' &&
      typeof e.tiltY === 'number'
        ? Math.round(Math.hypot(e.tiltX, e.tiltY))
        : undefined
    return {
      x: r01((e.clientX - (rect?.left ?? 0)) * s),
      y: r01((e.clientY - (rect?.top ?? 0)) * s),
      ...(pressure !== undefined ? { p: pressure } : {}),
      ...(tilt !== undefined && tilt > 0 ? { t: tilt } : {}),
    }
  }, [])

  /* ------------------------------ Draw pipeline ---------------------------- */

  const clearWet = useCallback((): void => {
    const c = wetRef.current
    if (c) c.getContext('2d')?.clearRect(0, 0, c.width, c.height)
    wetDrawn.current = 0
  }, [])

  /** Clear once the committed SVG path has painted, so the stroke never blinks. */
  const clearWetSoon = useCallback((): void => {
    requestAnimationFrame(() => requestAnimationFrame(clearWet))
  }, [clearWet])

  /** Paint what was added since the last frame. Returns false when the canvas is unavailable. */
  const paintWet = useCallback((g: Extract<Gesture, { kind: 'draw' }>): boolean => {
    const c = wetRef.current
    const ctx = c?.getContext('2d', { desynchronized: true })
    const doc = inkRef.current
    if (!c || !ctx || !doc || c.width === 0) return false
    // shift-constrained lines replace their points instead of appending: redraw from scratch
    if (g.pts.length < wetDrawn.current) clearWet()
    ctx.setTransform(c.width / doc.width, 0, 0, c.width / doc.width, 0, 0)
    paintWetSegments(ctx, g.pts, wetDrawn.current > 0 ? wetDrawn.current - 1 : 0, g.stroke.size, g.stroke.color)
    wetDrawn.current = g.pts.length
    return true
  }, [clearWet])

  const renderLive = useCallback(() => {
    rafRef.current = null
    const g = gestureRef.current
    const pathEl = livePathRef.current
    if (!g || g.kind !== 'draw' || !pathEl) return

    // Opaque pen: paint incrementally on the wet canvas, leave the SVG path empty
    const wet = g.stroke.tool === 'pen' && paintWet(g)
    if (wet && latencyT0.current) {
      console.log(`[tala:ink] pointerdown -> first wet paint: ${(performance.now() - latencyT0.current).toFixed(1)} ms`)
      latencyT0.current = 0
    }

    if (!wet) {
      const n = g.stroke.points.length
      // Rebuilding the outline allocates; skip frames that only added a point or
      // two. The final stroke always gets a full rebuild on pointerup.
      const now = performance.now()
      if (n >= 8 && n - liveBuiltLenRef.current < 3 && now - liveBuiltAtRef.current < 32) return
      liveBuiltLenRef.current = n
      liveBuiltAtRef.current = now

      pathEl.setAttribute('d', strokeOutlineD(g.stroke))
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
  }, [paintWet, prefs.tool, toLocal])

  const scheduleRenderLive = useCallback(() => {
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(renderLive)
  }, [renderLive])

  const clearHold = useCallback((): void => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    holdTimer.current = null
  }, [])

  /** The pen has rested: if the stroke so far is a recognisable shape, replace it with the clean one. */
  const trySnap = useCallback((): void => {
    holdTimer.current = null
    const g = gestureRef.current
    if (!g || g.kind !== 'draw' || g.snapped) return
    const shape = classifyShape(g.pts)
    if (!shape) return
    const pressures = g.pts.filter((p) => p.p !== undefined).map((p) => p.p!)
    const p = pressures.length > 0 ? Math.round((pressures.reduce((a, b) => a + b, 0) / pressures.length) * 100) / 100 : undefined
    g.pts = shapeToPoints(shape).map((pt) => ({ x: r01(pt.x), y: r01(pt.y), ...(p !== undefined ? { p } : {}) }))
    g.stroke.points = g.pts
    g.snapped = true
    clearWet()
    liveBuiltLenRef.current = 0
    liveBuiltAtRef.current = -1e9
    liveTipRef.current?.setAttribute('r', '0')
    navigator.vibrate?.(8)
    if (rafRef.current === null) rafRef.current = requestAnimationFrame(renderLive)
  }, [clearWet, renderLive])

  const armHold = useCallback((): void => {
    clearHold()
    holdTimer.current = window.setTimeout(trySnap, SNAP_HOLD_MS)
  }, [clearHold, trySnap])

  const cancelCurrentDraw = useCallback(() => {
    clearHold()
    const g = gestureRef.current
    if (g && g.kind === 'draw') {
      gestureRef.current = null
      if (livePathRef.current) livePathRef.current.setAttribute('d', '')
      clearWet()
    }
  }, [clearHold, clearWet])

  const finishDraw = useCallback((g: Extract<Gesture, { kind: 'draw' }>): void => {
    if (livePathRef.current) livePathRef.current.setAttribute('d', '')
    if (liveTipRef.current) liveTipRef.current.setAttribute('r', '0')
    const pts = simplifyPoints(smoothPressure(g.pts))
    if (pts.length === 0) {
      clearWet()
      return
    }
    const finished: InkStroke = { ...g.stroke, points: pts }
    const doc = inkRef.current!
    commit([...doc.strokes, finished], doc.strokes, strokeBBox(finished).y1)
    clearWetSoon()
  }, [clearWet, clearWetSoon, commit])

  /* ------------------------------ Erase pipeline --------------------------- */

  /** Single source of truth: ring, hit-testing and the palette all read this. */
  const eraserRadiusCapture = useCallback(
    (): number => (sizesForTool('eraser')[prefs.sizeIdx] ?? 24) / 2 / (scale || 1),
    [prefs.sizeIdx, scale],
  )

  /** Brush preview ring radius for the active draw tool — mouse/pen hover. */
  const drawRadiusCapture = useCallback(
    (): number => (sizesForTool(prefs.tool)[prefs.sizeIdx] ?? PEN_SIZES[1]!) / 2 / (scale || 1),
    [prefs.tool, prefs.sizeIdx, scale],
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
      if (g.dx === 0 && g.dy === 0) {
        // a plain tap on handwriting written during a lecture plays the audio from that moment
        if (g.hit.ts !== undefined) onStrokeTap?.(g.hit.ts)
        return
      }
      const doc = inkRef.current!
      const next = doc.strokes.map((s) =>
        selected.has(s.id) ? translateStroke(s, g.dx, g.dy) : s,
      )
      // Moved selection may have grown downward
      commit(next, doc.strokes, (selectionBBox?.y1 ?? 0) + g.dy)
    },
    [commit, flushUi, onStrokeTap, selectionBBox, selected],
  )

  const finishSelectScale = useCallback(
    (g: Gesture & { kind: 'select-scale' }): void => {
      flushUi()
      const endPt = lastNativeRef.current
      if (!endPt) return
      const end = toLocal(endPt)
      const doc = inkRef.current!
      const MIN = 24
      const to = {
        x0: g.origin.x0,
        y0: g.origin.y0,
        x1: Math.max(end.x, g.anchor.x + MIN),
        y1: Math.max(end.y, g.anchor.y + MIN),
      }
      const next = doc.strokes.map((s) =>
        selected.has(s.id) ? scaleStrokeInto(s, g.origin, to) : s,
      )
      commit(next, doc.strokes, to.y1)
    },
    [commit, flushUi, selected, toLocal],
  )

  /* ------------------------------ Pointer events --------------------------- */

  const beginPanIfNeeded = (p: Pt): boolean => {
    if (p.pointerType !== 'touch') return false
    // While a Pencil pointer is active, ignore all touch contacts (palm rejection).
    if (activePenId.current !== null) return true
    touchIds.current = [...touchIds.current, p.pointerId]
    if (touchIds.current.length >= 2) {
      cancelCurrentDraw()
      // the two fingers belong to ZoomColumn (pinch / pan); ink just steps aside
      gestureRef.current = { kind: 'pinch' }
      return true
    }
    return false
  }

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!active) return
    // Primary button only — right-click opens the pen palette via
    // onContextMenu, and must never start a draw/erase gesture.
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onEngage?.()

    // Track Apple Pencil — while active, touch contacts are palm noise.
    if (e.pointerType === 'pen') {
      activePenId.current = e.pointerId
    }

    if (beginPanIfNeeded(e.nativeEvent)) return
    try {
      svgRef.current?.setPointerCapture(e.pointerId)
    } catch { /* ignore */ }

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

    refreshSvgRect()
    const p = toLocal(e.nativeEvent)

    // Alt = temporary eraser for the duration of this stroke, on any draw tool.
    if (prefs.tool === 'eraser' || (e.altKey && prefs.tool !== 'select')) {
      gestureRef.current = {
        kind: 'erase',
        base: inkRef.current.strokes,
        working: inkRef.current.strokes,
        changed: false,
      }
      uiPendingRef.current.cursor = p
      scheduleUi()
      eraseAt(p.x, p.y)
      return
    }

    if (prefs.tool === 'select') {
      if (selectionBBox) {
        const hr = 12 / (scale || 1)
        const ddx = p.x - selectionBBox.x1
        const ddy = p.y - selectionBBox.y1
        if (ddx * ddx + ddy * ddy <= hr * hr * 4) {
          gestureRef.current = {
            kind: 'select-scale',
            anchor: { x: selectionBBox.x0, y: selectionBBox.y0 },
            origin: selectionBBox,
          }
          return
        }
      }
      const hit = findTopmostStroke(inkRef.current.strokes, p.x, p.y)
      if (hit) {
        setSelected((prev) => {
          const next = new Set(e.shiftKey ? prev : [])
          next.add(hit.id)
          return next
        })
        gestureRef.current = { kind: 'select-move', dx: 0, dy: 0, last: p, hit }
      } else {
        setSelected(new Set())
        gestureRef.current = { kind: 'lasso', pts: [p] }
        uiPendingRef.current.lasso = [p]
        scheduleUi()
      }
      return
    }

    // Draw (pen / highlighter)
    const size =
      sizesForTool(prefs.tool)[prefs.sizeIdx] ?? PEN_SIZES[1]!
    liveBuiltLenRef.current = 0
    liveBuiltAtRef.current = -1e9
    wetDrawn.current = 0
    latencyT0.current = inkDebug() ? e.nativeEvent.timeStamp : 0
    gestureRef.current = {
      kind: 'draw',
      pts: [p],
      stroke: {
        id: createId(),
        tool: prefs.tool,
        color: prefs.color,
        size,
        points: [],
        ...(recording ? { ts: Date.now() } : {}),
      },
    }
    scheduleRenderLive()
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!active) return
    // While Pencil is active, ignore all touch movement (palm rejection).
    if (e.pointerType === 'touch' && activePenId.current !== null) return
    const native = e.nativeEvent
    lastNativeRef.current = native

    const g = gestureRef.current

    // One rect read per event batch — coalesced samples reuse the cache.
    refreshSvgRect()

    // Eraser ring (any pointer) and pen hover preview both follow the pointer
    // while idle — the canvas stays dominant and the instrument "sits" on it.
    if (
      !g &&
      (prefs.tool === 'eraser' ||
        (e.pointerType === 'pen' && prefs.pencilHover) ||
        (e.pointerType === 'mouse' && prefs.tool !== 'select'))
    ) {
      uiPendingRef.current.cursor = {
        ...toLocal(native),
        pen: e.pointerType === 'pen',
        mouse: e.pointerType === 'mouse',
      }
      scheduleUi()
      return
    }
    if (!g) return
    e.preventDefault()

    // Coalesced events deliver every input sample between frames (low latency)
    const events: Pt[] =
      typeof native.getCoalescedEvents === 'function'
        ? (native.getCoalescedEvents() as Pt[]).filter(Boolean)
        : []
    if (events.length === 0) events.push(native)

    if (g.kind === 'draw') {
      if (g.snapped) return // the shape is set; lifting the pen keeps it
      // Shift = straight-line constraint: snap to the nearest 0/45/90° from
      // the stroke's start instead of accumulating free-form points.
      if (e.shiftKey && g.pts.length > 0) {
        const start = g.pts[0]!
        const last = toLocal(events[events.length - 1]!)
        const dx = last.x - start.x
        const dy = last.y - start.y
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4)
        const dist = Math.hypot(dx, dy)
        const snapped = { ...last, x: r01(start.x + Math.cos(angle) * dist), y: r01(start.y + Math.sin(angle) * dist) }
        g.pts = [start, snapped]
        g.stroke.points = g.pts
        scheduleRenderLive()
        return
      }
      for (const ev of events) {
        const p = toLocal(ev)
        const prev = g.pts[g.pts.length - 1]
        if (prev) {
          const dx = p.x - prev.x
          const dy = p.y - prev.y
          if (dx * dx + dy * dy < MIN_DRAW_DIST_SQ) continue
        }
        g.pts.push(p)
      }
      g.stroke.points = g.pts
      scheduleRenderLive()
      // Resting the pen (barely moving) for a moment snaps a recognisable shape
      const tip = g.pts[g.pts.length - 1]!
      if (!g.anchor || Math.hypot(tip.x - g.anchor.x, tip.y - g.anchor.y) > SNAP_JITTER_PX / (scale || 1)) {
        g.anchor = tip
        armHold()
      }
      return
    }

    const p = toLocal(events[events.length - 1]!)

    switch (g.kind) {
      case 'erase':
        uiPendingRef.current.cursor = p
        eraseAt(p.x, p.y)
        scheduleUi()
        break
      case 'pinch':
        break
      case 'select-move':
        g.dx += p.x - g.last.x
        g.dy += p.y - g.last.y
        g.last = p
        uiPendingRef.current.move = { dx: g.dx, dy: g.dy }
        scheduleUi()
        break
      case 'select-scale':
        break
      case 'lasso': {
        const last = g.pts[g.pts.length - 1]!
        // coarse enough to stay light, fine enough to follow a looping hand
        if (Math.hypot(p.x - last.x, p.y - last.y) > 3 / (scale || 1)) {
          g.pts.push(p)
          uiPendingRef.current.lasso = [...g.pts]
          scheduleUi()
        }
        break
      }
    }
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>): void => {
    // Clear active Pencil tracking when the pen lifts.
    if (e.pointerType === 'pen' && e.pointerId === activePenId.current) {
      activePenId.current = null
    }
    if (e.pointerType === 'touch') {
      touchIds.current = touchIds.current.filter((id) => id !== e.pointerId)
    }
    const g = gestureRef.current
    if (!g) return
    e.preventDefault()
    e.stopPropagation()

    if (g.kind === 'pinch') {
      if (touchIds.current.length < 2) gestureRef.current = null
      return
    }
    gestureRef.current = null
    clearHold()

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
      case 'lasso': {
        setSelected(new Set(strokesInLasso(inkRef.current?.strokes ?? [], g.pts)))
        uiPendingRef.current.lasso = null
        setLasso(null)
        break
      }
    }
  }

  /* -------------------------------- Keyboard ------------------------------- */

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      // Never steal keys while the user is typing text or a dialog is up:
      // Backspace in the title field must not delete strokes. Undo/redo and
      // the tool keys are the note's (NoteEditor), since several pages are mounted.
      if (isTypingTarget(e.target)) return
      const ui = useUIStore.getState()
      if (ui.modalStack.length > 0 || ui.sidebarDrawerOpen) return
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0) {
        e.preventDefault()
        deleteSelection()
      } else if (e.key === 'Escape') setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, deleteSelection, selected.size])

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

  const renderStroke = (s: InkStroke): React.ReactNode => (
    <StrokePath
      key={s.id}
      stroke={s}
      previewDx={selected.has(s.id) ? (movePreview?.dx ?? 0) : 0}
      previewDy={selected.has(s.id) ? (movePreview?.dy ?? 0) : 0}
    />
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
          viewBox={`0 0 ${displayDoc.width} ${Math.max(displayDoc.height, box.h / (dispScale || 1))}`}
          role="application"
          aria-label="Handwriting canvas"          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => {
            // WebKit cancels when the OS claims the pointer; the stroke so far is kept
            if (inkDebug()) {
              const g = gestureRef.current
              console.log(
                `[tala:ink] pointercancel: ${e.pointerType} during ${g?.kind ?? 'no gesture'}` +
                  (g?.kind === 'draw' ? ` after ${g.pts.length} points` : '') +
                  `, ${touchIds.current.length} finger(s) down`,
              )
            }
            onPointerUp(e)
          }}
          onPointerLeave={() => {
            if (gestureRef.current) return
            uiPendingRef.current.cursor = null
            scheduleUi()
          }}
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
          />

          {/* Predicted-input ghost tip (pen only) — visual latency compensation */}
          <circle ref={liveTipRef} r={0} className="ink-live-tip" fill={prefs.color} />

          {lasso && <path d={lassoPath(lasso)} className="ink-marquee" vectorEffect="non-scaling-stroke" />}

          {selectionBBox && (
            <>
              <rect
                x={selectionBBox.x0 + (movePreview?.dx ?? 0)}
                y={selectionBBox.y0 + (movePreview?.dy ?? 0)}
                width={selectionBBox.x1 - selectionBBox.x0}
                height={selectionBBox.y1 - selectionBBox.y0}
                className="ink-selection"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={selectionBBox.x1 + (movePreview?.dx ?? 0)}
                cy={selectionBBox.y1 + (movePreview?.dy ?? 0)}
                r={7 / (scale || 1)}
                className="ink-handle"
                vectorEffect="non-scaling-stroke"
              />
            </>
          )}

          {active && cursorPos && (prefs.tool === 'eraser' || cursorPos.pen || cursorPos.mouse) && (
            <circle
              cx={cursorPos.x}
              cy={cursorPos.y}
              r={prefs.tool === 'eraser' ? eraserRadiusCapture() : drawRadiusCapture()}
              className="ink-cursor-ring"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}
      {/* Wet ink: the opaque pen paints here while the stroke is under the nib */}
      <canvas
        ref={wetRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-[1]"
        style={{ width: wetCssW, height: wetCssH }}
      />
    </div>
  )
})

/** `localStorage['tala:inkdebug']`: log input latency and cancelled pointers. */
function inkDebug(): boolean {
  try {
    return !!localStorage.getItem('tala:inkdebug')
  } catch {
    return false
  }
}

function findTopmostStroke(strokes: InkStroke[], x: number, y: number): InkStroke | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const s = strokes[i]!
    if (strokeHits(s, x, y, 8)) return s
  }
  return null
}

/** One memoized <path> per committed stroke — unchanged strokes never re-render. */
const StrokePath = memo(function StrokePath({
  stroke,
  previewDx = 0,
  previewDy = 0,
}: {
  stroke: InkStroke
  previewDx?: number
  previewDy?: number
}): React.ReactNode {
  const isHl = stroke.tool === 'highlighter'
  return (
    <path
      d={strokeOutlineD(stroke)}
      fill={stroke.color}
      className={
        isHl ? 'ink-hl-path' : stroke.tool === 'pencil' ? 'ink-pencil-path' : undefined
      }
      transform={
        previewDx !== 0 || previewDy !== 0 ? `translate(${previewDx} ${previewDy})` : undefined
      }
      pointerEvents="none"
    />
  )
})

