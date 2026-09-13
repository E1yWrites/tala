import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import { cn } from '@/utils/cn'

/* ---------------------------------------------------------------------------
   Anchored popover — the one floating surface every toolbar menu uses
   (pen palette, text style, alignment, lists, insert, recolor…).

   • Portals to <body>, so panel overflow never clips it.
   • Anchors to an element rect or a viewport point (right-click on canvas).
   • Measures itself on a hidden first paint, then places + clamps inside the
     viewport (flipping above the anchor when there is no room below).
   • Dismisses on outside press, Escape (captured, so the global Esc chain
     never also fires) and viewport resize.
--------------------------------------------------------------------------- */

export type PopoverAnchor = HTMLElement | SVGElement | { x: number; y: number }

interface PopoverProps {
  open: boolean
  anchor: PopoverAnchor | null
  onClose: () => void
  children: ReactNode
  /** Preferred side; flips when it does not fit. */
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  ariaLabel: string
  className?: string
  /** Close when the page scrolls (point anchors drift with content). */
  closeOnScroll?: boolean
  /** Gap between anchor and panel, px. */
  offset?: number
  /** Element to focus on open; default = first [data-autofocus] or first control. */
  initialFocus?: boolean
}

const PAD = 8

function anchorRect(anchor: PopoverAnchor): { left: number; top: number; right: number; bottom: number; width: number } {
  if ('getBoundingClientRect' in anchor) {
    const r = anchor.getBoundingClientRect()
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width }
  }
  return { left: anchor.x, top: anchor.y, right: anchor.x, bottom: anchor.y, width: 0 }
}

function place(
  anchor: PopoverAnchor,
  side: 'top' | 'bottom',
  align: 'start' | 'center' | 'end',
  w: number,
  h: number,
  offset: number,
): { left: number; top: number; side: 'top' | 'bottom' } {
  const a = anchorRect(anchor)
  const vw = document.documentElement.clientWidth
  const vh = document.documentElement.clientHeight

  let left = align === 'start' ? a.left : align === 'end' ? a.right - w : a.left + a.width / 2 - w / 2
  left = Math.min(Math.max(left, PAD), Math.max(PAD, vw - w - PAD))

  const below = a.bottom + offset
  const above = a.top - offset - h
  let resolved = side
  if (side === 'bottom' && below + h > vh - PAD && above >= PAD) resolved = 'top'
  if (side === 'top' && above < PAD && below + h <= vh - PAD) resolved = 'bottom'
  let top = resolved === 'bottom' ? below : above
  top = Math.min(Math.max(top, PAD), Math.max(PAD, vh - h - PAD))
  return { left, top, side: resolved }
}

export function Popover({
  open,
  anchor,
  onClose,
  children,
  side = 'bottom',
  align = 'center',
  ariaLabel,
  className,
  closeOnScroll = false,
  offset = 8,
  initialFocus = true,
}: PopoverProps): ReactNode {
  const shellRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number; side: 'top' | 'bottom' } | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  const measure = useCallback(() => {
    const el = shellRef.current
    if (!open || !anchor || !el) return
    setPos(place(anchor, side, align, el.offsetWidth, el.offsetHeight, offset))
  }, [align, anchor, offset, open, side])

  useLayoutEffect(() => {
    if (!open) {
      setPos(null)
      return
    }
    measure()
    // Content (fonts, async rows) can settle a frame later — re-place once.
    const raf = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(raf)
  }, [measure, open])

  // Re-measure when the panel's own size changes (view swaps inside it).
  useEffect(() => {
    if (!open || !shellRef.current) return
    const ro = new ResizeObserver(() => measure())
    ro.observe(shellRef.current)
    return () => ro.disconnect()
  }, [measure, open])

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent): void => {
      const target = e.target as Node
      if (shellRef.current?.contains(target)) return
      // Clicking the trigger again is the trigger's business (toggle).
      if (anchor && 'contains' in anchor && (anchor as HTMLElement).contains(target)) return
      onCloseRef.current()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape' || e.ctrlKey || e.metaKey || e.altKey) return
      e.preventDefault()
      e.stopPropagation()
      onCloseRef.current()
    }
    const onScroll = (e: Event): void => {
      if (shellRef.current?.contains(e.target as Node)) return
      if (closeOnScroll) onCloseRef.current()
      else measure()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', measure)
    }
  }, [anchor, closeOnScroll, measure, open])

  useEffect(() => {
    if (!open || !pos || !initialFocus) return
    const el = shellRef.current
    if (!el) return
    const target =
      el.querySelector<HTMLElement>('[data-autofocus]') ??
      el.querySelector<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select, [tabindex]:not([tabindex="-1"])',
      )
    // Only move focus when it is not already inside (re-placements must not steal it).
    if (target && !el.contains(document.activeElement)) target.focus({ preventScroll: true })
  }, [initialFocus, open, pos])

  if (!open || !anchor) return null

  const style: CSSProperties = pos
    ? { left: pos.left, top: pos.top }
    : { left: -9999, top: -9999, visibility: 'hidden' }

  return createPortal(
    <div
      ref={shellRef}
      role="dialog"
      aria-label={ariaLabel}
      data-side={pos?.side ?? side}
      className={cn(
        'popover-shell fixed z-[80] select-none rounded-wobbly-md border-2 border-line bg-overlay/95 shadow-sketch backdrop-blur-md',
        pos && 'animate-popover-in',
        className,
      )}
      style={style}
      onContextMenu={(e) => e.preventDefault()}
    >
      {children}
    </div>,
    document.body,
  )
}
