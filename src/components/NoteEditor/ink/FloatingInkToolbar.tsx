import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from 'react'
import { GripVertical } from 'lucide-react'
import { useInkGestureActive } from '@/lib/inkSession'
import { cn } from '@/utils/cn'
import {
  SelectionTools,
  WriteTools,
  type InkToolbarActions,
  type InkToolbarState,
  type SelectionActions,
} from '../toolbar/WriteTools'

/* ---------------------------------------------------------------------------
   Floating compact toolbar for touch / iPad. A single pill that hovers over
   the page like a pen tray: draggable by its grip, remembers where you left
   it (as a fraction of the editor so portrait ↔ landscape keeps it in reach),
   never leaves the editor bounds, and fades out of the way while the pen is
   down. Not a shrunken desktop bar — only the handful of controls that matter
   mid-stroke, at finger size. Leaving draw mode stays in the header ("Done"),
   which never moves or fades.
--------------------------------------------------------------------------- */

const POS_KEY = 'tala:float-toolbar'
const MARGIN = 12

interface Frac {
  fx: number
  fy: number
}

function readPos(): Frac {
  try {
    const raw = localStorage.getItem(POS_KEY)
    if (!raw) return { fx: 0.5, fy: 1 }
    const p = JSON.parse(raw) as Partial<Frac>
    const ok = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
    return { fx: ok(p.fx) ? Math.min(1, Math.max(0, p.fx)) : 0.5, fy: ok(p.fy) ? Math.min(1, Math.max(0, p.fy)) : 1 }
  } catch {
    return { fx: 0.5, fy: 1 }
  }
}

function writePos(p: Frac): void {
  try {
    localStorage.setItem(POS_KEY, JSON.stringify(p))
  } catch {
    /* ignore */
  }
}

interface FloatingInkToolbarProps {
  /** Element the pill floats within (the editor root, position: relative). */
  boundsRef: RefObject<HTMLElement | null>
  mode: 'write' | 'select'
  state: InkToolbarState
  actions: InkToolbarActions
  selection: SelectionActions
  selectionCount: number
  drawRef: RefObject<HTMLButtonElement | null>
}

export function FloatingInkToolbar({
  boundsRef,
  mode,
  state,
  actions,
  selection,
  selectionCount,
  drawRef,
}: FloatingInkToolbarProps): ReactNode {
  const pillRef = useRef<HTMLDivElement>(null)
  const fracRef = useRef<Frac>(readPos())
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [dragging, setDragging] = useState(false)
  const writing = useInkGestureActive()
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null)

  /** Convert stored fractions into px inside the current bounds. */
  const layout = useCallback(() => {
    const bounds = boundsRef.current
    const pill = pillRef.current
    if (!bounds || !pill) return
    const bw = bounds.clientWidth
    const bh = bounds.clientHeight
    const pw = pill.offsetWidth
    const ph = pill.offsetHeight
    const safe = Number.parseFloat(getComputedStyle(pill).getPropertyValue('--safe-bottom')) || 0
    const maxX = Math.max(MARGIN, bw - pw - MARGIN)
    const maxY = Math.max(MARGIN, bh - ph - MARGIN - safe)
    setPos({
      left: Math.round(MARGIN + (maxX - MARGIN) * fracRef.current.fx),
      top: Math.round(MARGIN + (maxY - MARGIN) * fracRef.current.fy),
    })
  }, [boundsRef])

  useLayoutEffect(layout, [layout, mode, selectionCount])

  useEffect(() => {
    const bounds = boundsRef.current
    if (!bounds) return
    const ro = new ResizeObserver(() => layout())
    ro.observe(bounds)
    if (pillRef.current) ro.observe(pillRef.current)
    window.addEventListener('orientationchange', layout)
    return () => {
      ro.disconnect()
      window.removeEventListener('orientationchange', layout)
    }
  }, [boundsRef, layout])

  /* --------------------------------- Drag --------------------------------- */

  const onGripDown = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    if (!pos) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    dragRef.current = { id: e.pointerId, dx: e.clientX - pos.left, dy: e.clientY - pos.top }
    setDragging(true)
  }

  const onGripMove = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const d = dragRef.current
    const bounds = boundsRef.current
    const pill = pillRef.current
    if (!d || d.id !== e.pointerId || !bounds || !pill) return
    const bw = bounds.clientWidth
    const bh = bounds.clientHeight
    const pw = pill.offsetWidth
    const ph = pill.offsetHeight
    const left = Math.min(Math.max(e.clientX - d.dx, MARGIN), Math.max(MARGIN, bw - pw - MARGIN))
    const top = Math.min(Math.max(e.clientY - d.dy, MARGIN), Math.max(MARGIN, bh - ph - MARGIN))
    setPos({ left, top })
  }

  const onGripUp = (e: ReactPointerEvent<HTMLButtonElement>): void => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    dragRef.current = null
    setDragging(false)
    const bounds = boundsRef.current
    const pill = pillRef.current
    if (!bounds || !pill || !pos) return
    const maxX = Math.max(MARGIN, bounds.clientWidth - pill.offsetWidth - MARGIN)
    const maxY = Math.max(MARGIN, bounds.clientHeight - pill.offsetHeight - MARGIN)
    fracRef.current = {
      fx: maxX > MARGIN ? (pos.left - MARGIN) / (maxX - MARGIN) : 0.5,
      fy: maxY > MARGIN ? (pos.top - MARGIN) / (maxY - MARGIN) : 1,
    }
    writePos(fracRef.current)
  }

  const style: CSSProperties = pos
    ? { left: pos.left, top: pos.top }
    : { left: -9999, top: -9999, visibility: 'hidden' }

  return (
    <div
      ref={pillRef}
      role="toolbar"
      aria-label={mode === 'select' ? 'Selection tools' : 'Drawing tools'}
      data-writing={writing || undefined}
      className={cn(
        'float-toolbar absolute z-40 flex max-w-[calc(100%-24px)] items-center gap-0.5 rounded-[30px] border-2 border-line bg-overlay/95 px-1.5 py-1 shadow-sketch backdrop-blur-md',
        'transition-[opacity,transform] duration-150 ease-out',
        writing && !dragging && 'pointer-events-none scale-95 opacity-0 delay-0',
        !writing && 'delay-150',
        dragging && 'transition-none',
      )}
      style={style}
    >
      <button
        type="button"
        aria-label="Move toolbar"
        onPointerDown={onGripDown}
        onPointerMove={onGripMove}
        onPointerUp={onGripUp}
        onPointerCancel={onGripUp}
        className={cn(
          'grid h-11 w-6 shrink-0 cursor-grab touch-none place-items-center rounded-full text-faint',
          dragging && 'cursor-grabbing text-ink',
        )}
      >
        <GripVertical size={16} />
      </button>
      {/* Selection actions outnumber a phone's width — let them wrap into a
          second row rather than hide behind a scroll nobody discovers. */}
      <div
        className={cn(
          'flex items-center gap-0.5',
          mode === 'select' ? 'flex-wrap justify-center' : 'no-scrollbar overflow-x-auto',
        )}
      >
        {mode === 'select' ? (
          <SelectionTools
            size="lg"
            count={selectionCount}
            state={state}
            actions={actions}
            selection={selection}
            drawRef={drawRef}
            noTooltips
          />
        ) : (
          <WriteTools size="lg" state={state} actions={actions} drawRef={drawRef} noTooltips />
        )}
      </div>
    </div>
  )
}
