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

/* ---------------------------------------------------------------------------
   The handwriting canvas: an SVG overlay covering the note's content column.
   Committed strokes are one <path> each (memoized); the in-progress stroke is
   mutated directly inside requestAnimationFrame so drawing never re-renders
   React. Coordinates are captured in "capture space" (the content-column width
   at first stroke); the SVG viewBox scales strokes when the note resizes.
--------------------------------------------------------------------------- */

/** Thickness presets (capture-space px) — S/M/L */
export const PEN_SIZES = [2.5, 4.5, 8]
export const HIGHLIGHTER_SIZES = [14, 20, 28]

const ERASER_RADIUS_CSS = { stroke: 8, pixel: 14 } satisfies Record<InkEraserMode, number>
/** Extra room kept below the lowest stroke. */
const HEIGHT_SLACK = 96
const MIN_DRAW_DIST_SQ = 1.2 * 1.2

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
}

const EMPTY_STROKES: InkStroke[] = []

export const InkLayer = forwardRef<InkLayerHandle, InkLayerProps>(function InkLayer(
  { ink, onChange, scrollRef, active, prefs, onHistoryChange },
  ref,
) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const livePathRef = useRef<SVGPathElement | null>(null)

  const gestureRef = useRef<Gesture | null>(null)
  const rafRef = useRef<number | null>(null)
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

  /** Observed content-box size in CSS px. */
  const [box, setBox] = useState<{ w: number; h: number }>({ w: 0, h: 0 })

  useEffect(() => {
    const el = wrapRef.current
    if (!el || !active) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [active])

  // A pending draw frame must not fire after unmount/deactivation.
  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
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
    (nextStrokes: InkStroke[], before: InkStroke[]) => {
      const doc = inkRef.current
      if (!doc) return
      let maxY = 0
      for (const s of nextStrokes) {
        const b = strokeBBox(s)
        if (b.y1 > maxY) maxY = b.y1
      }
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

  const toLocal = useCallback((e: Pt): InkPoint => {
    const rect = svgRef.current?.getBoundingClientRect()
    const s =
      rect && rect.width > 0 && inkRef.current ? inkRef.current.width / rect.width : 1
    const pressure =
      e.pointerType === 'pen' && e.pressure > 0 ? Math.round(e.pressure * 100) / 100 : undefined
    return {
      x: (e.clientX - (rect?.left ?? 0)) * s,
      y: (e.clientY - (rect?.top ?? 0)) * s,
      ...(pressure !== undefined ? { p: pressure } : {}),
    }
  }, [])

  /* ------------------------------ Draw pipeline ---------------------------- */

  const renderLive = useCallback(() => {
    rafRef.current = null
    const g = gestureRef.current
    const pathEl = livePathRef.current
    if (!g || g.kind !== 'draw' || !pathEl) return
    pathEl.setAttribute('d', strokeOutlineD(g.stroke))
  }, [])

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
    const pts = simplifyPoints(g.pts)
    if (pts.length === 0) return
    const finished: InkStroke = { ...g.stroke, points: pts }
    const doc = inkRef.current!
    commit([...doc.strokes, finished], doc.strokes)
  }, [commit])

  /* ------------------------------ Erase pipeline --------------------------- */

  const eraserRadiusCapture = (): number =>
    ERASER_RADIUS_CSS[prefs.eraserMode] / (scale || 1)

  const eraseAt = useCallback(
    (x: number, y: number) => {
      const g = gestureRef.current
      if (!g || g.kind !== 'erase') return
      const r = ERASER_RADIUS_CSS[prefs.eraserMode] / (scale || 1)
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
        setErasingStrokes(working)
      }
    },
    [prefs.eraserMode, scale],
  )

  const finishErase = useCallback((g: Gesture & { kind: 'erase' }): void => {
    setErasingStrokes(null)
    if (!g.changed) return
    commit(g.working, g.base)
  }, [commit])

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

  const finishSelectMove = useCallback((g: Gesture & { kind: 'select-move' }): void => {
    setMovePreview(null)
    if (g.dx === 0 && g.dy === 0) return
    const doc = inkRef.current!
    const next = doc.strokes.map((s) =>
      selected.has(s.id) ? translateStroke(s, g.dx, g.dy) : s,
    )
    commit(next, doc.strokes)
  }, [commit, selected])

  const finishSelectScale = useCallback((g: Gesture & { kind: 'select-scale' }): void => {
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
    commit(next, doc.strokes)
  }, [commit, selected, toLocal])

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
    if (e.pointerType !== 'mouse' && e.button !== 0) return
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

    const p = toLocal(e.nativeEvent)

    if (prefs.tool === 'eraser') {
      gestureRef.current = {
        kind: 'erase',
        base: inkRef.current.strokes,
        working: inkRef.current.strokes,
        changed: false,
      }
      setCursorPos(p)
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
        setMarquee({ x0: p.x, y0: p.y, x1: p.x, y1: p.y })
      }
      return
    }

    // Draw (pen / highlighter)
    const size =
      (prefs.tool === 'highlighter' ? HIGHLIGHTER_SIZES : PEN_SIZES)[prefs.sizeIdx] ??
      PEN_SIZES[1]!
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

    // Eraser ring follows the pointer even before pressing
    if (!g && prefs.tool === 'eraser') {
      setCursorPos(toLocal(native))
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
        setCursorPos(p)
        eraseAt(p.x, p.y)
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
        setMovePreview({ dx: g.dx, dy: g.dy })
        break
      case 'select-scale':
        break
      case 'marquee':
        g.x1 = p.x
        g.y1 = p.y
        setMarquee({ x0: g.x0, y0: g.y0, x1: g.x1, y1: g.y1 })
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
      {active && displayDoc && box.w > 0 && (
        <svg
          ref={svgRef}
          className={`ink-svg ink-tool-${prefs.tool}`}
          width="100%"
          height={dispViewH * dispScale}
          viewBox={`0 0 ${displayDoc.width} ${Math.max(displayDoc.height, box.h / (scale || 1))}`}
          role="application"
          aria-label="Handwriting canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onContextMenu={(e) => e.preventDefault()}
        >
          {/* Highlighters beneath pen strokes */}
          {highlights.map(renderStroke)}
          {pens.map(renderStroke)}

          {/* In-progress stroke */}
          <path
            ref={livePathRef}
            className={`ink-live${prefs.tool === 'highlighter' ? ' ink-hl-path' : ''}`}
            fill={prefs.color}
          />

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

          {cursorPos && prefs.tool === 'eraser' && (
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
      className={isHl ? 'ink-hl-path' : undefined}
      transform={
        previewDx !== 0 || previewDy !== 0 ? `translate(${previewDx} ${previewDy})` : undefined
      }
      pointerEvents="none"
    />
  )
})

