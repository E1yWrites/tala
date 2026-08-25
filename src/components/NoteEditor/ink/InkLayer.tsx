import { memo, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { forwardRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { createId } from '@/utils/id'
import { useUIStore } from '@/store/uiStore'

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
}

export interface InkLayerHandle {
  undo: () => void
  redo: () => void
  clearAll: () => void
  deleteSelection: () => void
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
}

interface InkOp {
  before: InkStroke[]
  after: InkStroke[]
}

type Gesture =
  | { kind: 'draw'; stroke: InkStroke; pts: InkPoint[] }
  | { kind: 'erase'; base: InkStroke[]; working: InkStroke[]; changed: boolean }
  | { kind: 'pan'; lastY: number }
  | { kind: 'select-move'; dx: number; dy: number; last: InkPoint }
  | {
      kind: 'select-scale'
      anchor: InkPoint
      origin: { x0: number; y0: number; x1: number; y1: number }
    }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number }

/** Minimal pointer shape so native coalesced events need no casting. */
interface Pt {
  clientX: number
  clientY: number
  pointerType: string
  pressure: number
  pointerId: number
  getCoalescedEvents?(): Pt[]
  getPredictedEvents?(): Pt[]
}

const EMPTY_STROKES: InkStroke[] = []

export const InkLayer = forwardRef<InkLayerHandle, InkLayerProps>(function InkLayer(
  { ink, onChange, scrollRef, active, prefs, onHistoryChange, onPaletteRequest },
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
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  )
  const [movePreview, setMovePreview] = useState<{ dx: number; dy: number } | null>(null)
  const [erasingStrokes, setErasingStrokes] = useState<InkStroke[] | null>(null)
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null)

  /**
   * Transient gesture visuals (eraser ring, erase preview, marquee, move
   * preview) are queued here and flushed at most once per animation frame —
   * pointermove fires far more often than paint.
   */
  interface UiPending {
    cursor?: { x: number; y: number } | null
    erasing?: InkStroke[] | null
    marquee?: { x0: number; y0: number; x1: number; y1: number } | null
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
    if ('marquee' in p) setMarquee(p.marquee ?? null)
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

  // A pending draw/UI frame must not fire after unmount/deactivation.
  useEffect(
    () => () => {
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

  useImperativeHandle(ref, () => ({ undo, redo, clearAll, deleteSelection }), [
    undo,
    redo,
    clearAll,
    deleteSelection,
  ])

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
    return {
      x: r01((e.clientX - (rect?.left ?? 0)) * s),
      y: r01((e.clientY - (rect?.top ?? 0)) * s),
      ...(pressure !== undefined ? { p: pressure } : {}),
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

    pathEl.setAttribute('d', strokeOutlineD(g.stroke))

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

  const cancelCurrentDraw = useCallback(() => {
    const g = gestureRef.current
    if (g && g.kind === 'draw') {
      gestureRef.current = null
      if (livePathRef.current) livePathRef.current.setAttribute('d', '')
    }
  }, [])

  const finishDraw = useCallback((g: Extract<Gesture, { kind: 'draw' }>): void => {
    if (livePathRef.current) livePathRef.current.setAttribute('d', '')
    if (liveTipRef.current) liveTipRef.current.setAttribute('r', '0')
    const pts = simplifyPoints(smoothPressure(g.pts))
    if (pts.length === 0) return
    const finished: InkStroke = { ...g.stroke, points: pts }
    const doc = inkRef.current!
    commit([...doc.strokes, finished], doc.strokes, strokeBBox(finished).y1)
  }, [commit])

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
    touchIds.current = [...touchIds.current, p.pointerId]
    if (touchIds.current.length >= 2) {
      cancelCurrentDraw()
      gestureRef.current = { kind: 'pan', lastY: toLocal(p).y }
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

    if (prefs.tool === 'eraser') {
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
        gestureRef.current = { kind: 'select-move', dx: 0, dy: 0, last: p }
      } else {
        setSelected(new Set())
        gestureRef.current = { kind: 'marquee', x0: p.x, y0: p.y, x1: p.x, y1: p.y }
        uiPendingRef.current.marquee = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }
        scheduleUi()
      }
      return
    }

    // Draw (pen / highlighter)
    const size =
      sizesForTool(prefs.tool)[prefs.sizeIdx] ?? PEN_SIZES[1]!
    liveBuiltLenRef.current = 0
    liveBuiltAtRef.current = -1e9
    gestureRef.current = {
      kind: 'draw',
      pts: [p],
      stroke: { id: createId(), tool: prefs.tool, color: prefs.color, size, points: [] },
    }
    scheduleRenderLive()
  }

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (!active) return
    const native = e.nativeEvent
    lastNativeRef.current = native

    const g = gestureRef.current

    // One rect read per event batch — coalesced samples reuse the cache.
    refreshSvgRect()

    // Eraser ring follows the pointer even before pressing
    if (!g && prefs.tool === 'eraser') {
      uiPendingRef.current.cursor = toLocal(native)
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
      return
    }

    const p = toLocal(events[events.length - 1]!)

    switch (g.kind) {
      case 'erase':
        uiPendingRef.current.cursor = p
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
      case 'select-scale':
        break
      case 'marquee':
        g.x1 = p.x
        g.y1 = p.y
        uiPendingRef.current.marquee = { x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1 }
        scheduleUi()
        break
    }
  }

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>): void => {
    if (e.pointerType === 'touch') {
      touchIds.current = touchIds.current.filter((id) => id !== e.pointerId)
    }
    const g = gestureRef.current
    if (!g) return
    e.preventDefault()

    if (g.kind === 'pan') {
      if (touchIds.current.length < 2) gestureRef.current = null
      return
    }
    gestureRef.current = null

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
      case 'marquee': {
        const x0 = Math.min(g.x0, g.x1)
        const x1 = Math.max(g.x0, g.x1)
        const y0 = Math.min(g.y0, g.y1)
        const y1 = Math.max(g.y0, g.y1)
        const picked = new Set<string>()
        if (x1 - x0 > 4 || y1 - y0 > 4) {
          for (const s of inkRef.current?.strokes ?? []) {
            const b = strokeBBox(s)
            if (b.x0 < x1 && b.x1 > x0 && b.y0 < y1 && b.y1 > y0) picked.add(s.id)
          }
        }
        setSelected(picked)
        uiPendingRef.current.marquee = null
        setMarquee(null)
        break
      }
    }
  }

  /* -------------------------------- Keyboard ------------------------------- */

  useEffect(() => {
    if (!active) return
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0) {
        e.preventDefault()
        deleteSelection()
        return
      }
      if (e.key === 'Escape') setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, deleteSelection, redo, selected.size, undo])

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
          viewBox={`0 0 ${displayDoc.width} ${Math.max(displayDoc.height, box.h / (scale || 1))}`}
          role="application"
          aria-label="Handwriting canvas"          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
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

          {marquee && (
            <rect
              x={Math.min(marquee.x0, marquee.x1)}
              y={Math.min(marquee.y0, marquee.y1)}
              width={Math.abs(marquee.x1 - marquee.x0)}
              height={Math.abs(marquee.y1 - marquee.y0)}
              className="ink-marquee"
              vectorEffect="non-scaling-stroke"
            />
          )}

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

          {active && cursorPos && prefs.tool === 'eraser' && (
            <circle
              cx={cursorPos.x}
              cy={cursorPos.y}
              r={eraserRadiusCapture()}
              className="ink-cursor-ring"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
      )}
    </div>
  )
})

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

