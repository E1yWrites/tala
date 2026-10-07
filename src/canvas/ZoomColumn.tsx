import { createContext, forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { CSSProperties, ReactNode, RefObject } from 'react'
import { MAX_ZOOM, MIN_ZOOM, clampZoom, pinchOf, zoomAbout } from './geometry'

/* ---------------------------------------------------------------------------
   Pinch / ctrl+wheel zoom for the page column.

   The scroller keeps doing the scrolling: a "sizer" takes the scaled layout
   size and the column inside is scaled with a CSS transform from its top-left
   corner, so scroll extents, text selection and the ink SVG (which measures
   itself with getBoundingClientRect) all stay correct. During a gesture only
   inline styles change (no React render per frame); the settled zoom reaches
   children through context once the gesture rests, so the PDF can re-render
   crisply and ink radii can stay a constant on-screen size.
--------------------------------------------------------------------------- */

const ZoomContext = createContext(1)

/** Settled zoom of the surrounding ZoomColumn (1 = fit width). */
export const useZoom = (): number => useContext(ZoomContext)

export interface ZoomHandle {
  zoomBy: (factor: number) => void
  reset: () => void
}

interface ZoomColumnProps {
  scrollRef: RefObject<HTMLDivElement | null>
  /** Layout width cap of the column at zoom 1. */
  maxWidth: number
  className?: string
  style?: CSSProperties
  onZoomChange?: (zoom: number) => void
  children: ReactNode
}

const SETTLE_MS = 140

export const ZoomColumn = forwardRef<ZoomHandle, ZoomColumnProps>(function ZoomColumn(
  { scrollRef, maxWidth, className, style, onZoomChange, children },
  ref,
) {
  const sizerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const live = useRef(1)
  const naturalH = useRef(0)
  const settleTimer = useRef<number | null>(null)
  const [settled, setSettled] = useState(1)
  const onChangeRef = useRef(onZoomChange)
  onChangeRef.current = onZoomChange

  /** Layout width of the column at zoom 1 (matches `mx-auto w-full max-w-*`). */
  const naturalW = (): number => Math.min(maxWidth, scrollRef.current?.clientWidth ?? maxWidth)

  /** Write the layout for zoom `z`; keep the page point under `focus` (scroller px) still. */
  const apply = (z: number, focus?: { x: number; y: number }): void => {
    const sc = scrollRef.current
    const sizer = sizerRef.current
    const inner = innerRef.current
    if (!sc || !sizer || !inner) return
    const prev = live.current
    z = z < 1.01 ? 1 : clampZoom(z)
    live.current = z
    const w = naturalW()
    const margin = (zz: number): number => Math.max(0, (sc.clientWidth - w * zz) / 2)
    const before = { scale: prev, tx: margin(prev) - sc.scrollLeft, ty: -sc.scrollTop }

    if (z === 1) {
      sizer.style.width = sizer.style.height = ''
      inner.style.width = inner.style.maxWidth = inner.style.marginInline = ''
      inner.style.transform = inner.style.transformOrigin = ''
    } else {
      sizer.style.width = `${w * z}px`
      sizer.style.height = `${naturalH.current * z}px`
      inner.style.width = `${w}px`
      inner.style.maxWidth = 'none'
      inner.style.marginInline = '0'
      inner.style.transformOrigin = '0 0'
      inner.style.transform = `scale(${z})`
    }

    if (focus) {
      const next = zoomAbout(before, focus, z)
      sc.scrollLeft = margin(z) - next.tx
      sc.scrollTop = -next.ty
    }

    if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => {
      settleTimer.current = null
      setSettled(z)
      onChangeRef.current?.(z)
    }, SETTLE_MS)
  }

  const centre = (): { x: number; y: number } => {
    const sc = scrollRef.current
    return { x: (sc?.clientWidth ?? 0) / 2, y: (sc?.clientHeight ?? 0) / 2 }
  }

  useImperativeHandle(ref, () => ({
    zoomBy: (f) => apply(live.current * f, centre()),
    reset: () => apply(1, centre()),
  }))

  // Track the column's natural height so the sizer follows typing / new content.
  useEffect(() => {
    const inner = innerRef.current
    if (!inner) return
    naturalH.current = inner.offsetHeight
    const ro = new ResizeObserver(() => {
      naturalH.current = inner.offsetHeight
      if (live.current > 1 && sizerRef.current) sizerRef.current.style.height = `${naturalH.current * live.current}px`
    })
    ro.observe(inner)
    return () => ro.disconnect()
  }, [])

  // Keep the layout valid when the pane resizes (rotation, sidebar toggle).
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    const ro = new ResizeObserver(() => {
      if (live.current > 1) apply(live.current)
    })
    ro.observe(sc)
    return () => ro.disconnect()
  }, [scrollRef])

  // Gestures: two-finger pinch/pan, ctrl+wheel. One finger and the pen are left alone.
  useEffect(() => {
    const sc = scrollRef.current
    if (!sc) return
    let penDown = false
    let pinch: { dist: number; zoom: number; mid: { x: number; y: number } } | null = null

    const local = (t: Touch): { x: number; y: number } => {
      const r = sc.getBoundingClientRect()
      return { x: t.clientX - r.left, y: t.clientY - r.top }
    }
    const pair = (e: TouchEvent): ReturnType<typeof pinchOf> =>
      pinchOf(local(e.touches[0]!), local(e.touches[1]!))

    const onPointer = (e: PointerEvent): void => {
      if (e.pointerType !== 'pen') return
      penDown = e.type === 'pointerdown'
    }
    const onTouchStart = (e: TouchEvent): void => {
      if (e.touches.length === 2 && !penDown) {
        const { dist, mid } = pair(e)
        pinch = { dist, zoom: live.current, mid }
      } else pinch = null
    }
    const onTouchMove = (e: TouchEvent): void => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const { dist, mid } = pair(e)
      apply(pinch.zoom * (dist / (pinch.dist || 1)), mid)
      // two fingers also pan: follow the midpoint
      sc.scrollLeft -= mid.x - pinch.mid.x
      sc.scrollTop -= mid.y - pinch.mid.y
      pinch.mid = mid
    }
    const onTouchEnd = (e: TouchEvent): void => {
      if (e.touches.length < 2) pinch = null
    }
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey) return
      e.preventDefault()
      const r = sc.getBoundingClientRect()
      apply(live.current * Math.exp(-e.deltaY * 0.01), { x: e.clientX - r.left, y: e.clientY - r.top })
    }

    sc.addEventListener('pointerdown', onPointer, true)
    sc.addEventListener('pointerup', onPointer, true)
    sc.addEventListener('pointercancel', onPointer, true)
    sc.addEventListener('touchstart', onTouchStart, { passive: true })
    sc.addEventListener('touchmove', onTouchMove, { passive: false })
    sc.addEventListener('touchend', onTouchEnd)
    sc.addEventListener('touchcancel', onTouchEnd)
    sc.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      sc.removeEventListener('pointerdown', onPointer, true)
      sc.removeEventListener('pointerup', onPointer, true)
      sc.removeEventListener('pointercancel', onPointer, true)
      sc.removeEventListener('touchstart', onTouchStart)
      sc.removeEventListener('touchmove', onTouchMove)
      sc.removeEventListener('touchend', onTouchEnd)
      sc.removeEventListener('touchcancel', onTouchEnd)
      sc.removeEventListener('wheel', onWheel)
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current)
    }
  }, [scrollRef])

  return (
    <ZoomContext.Provider value={settled}>
      <div ref={sizerRef} className="mx-auto">
        <div ref={innerRef} className={className} style={style}>
          {children}
        </div>
      </div>
    </ZoomContext.Provider>
  )
})

export { MAX_ZOOM, MIN_ZOOM }
