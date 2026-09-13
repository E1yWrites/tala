import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface TooltipProps {
  label: string
  children: ReactNode
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
}

const GAP = 8
const VIEWPORT_PAD = 8

type Placement = { top: number; left: number; transform: string }

/**
 * Positions the tooltip relative to the trigger rect using the tooltip's
 * *measured* size (no width guessing), then clamps it inside the viewport so
 * labels near screen edges never get cut off. Coordinates are viewport-fixed.
 */
function computePlacement(
  rect: DOMRect,
  size: { width: number; height: number },
  side: TooltipProps['side'],
): Placement {
  const centerX = rect.left + rect.width / 2
  const centerY = rect.top + rect.height / 2

  let placement: Placement
  switch (side) {
    case 'bottom':
      placement = { top: rect.bottom + GAP, left: centerX, transform: 'translateX(-50%)' }
      break
    case 'right':
      placement = { top: centerY, left: rect.right + GAP, transform: 'translateY(-50%)' }
      break
    case 'left':
      placement = {
        top: centerY,
        left: rect.left - GAP - size.width,
        transform: 'translateY(-50%)',
      }
      break
    case 'top':
    default:
      placement = {
        top: rect.top - GAP - size.height,
        left: centerX,
        transform: 'translateX(-50%)',
      }
      break
  }

  // Clamp into the viewport (the tooltip is rendered at the document root).
  const minX = VIEWPORT_PAD
  const maxX = document.documentElement.clientWidth - VIEWPORT_PAD - size.width
  const minY = VIEWPORT_PAD
  const maxY = document.documentElement.clientHeight - VIEWPORT_PAD - size.height

  return {
    top: Math.min(Math.max(placement.top, minY), Math.max(minY, maxY)),
    left: Math.min(Math.max(placement.left, minX), Math.max(minX, maxX)),
    transform: placement.transform,
  }
}

/**
 * Tooltip rendered through a portal to document.body — never clipped by
 * sidebar/panel overflow. Shows on hover and keyboard focus. Measured on a
 * hidden first paint, then placed and clamped to the viewport.
 */
export function Tooltip({
  label,
  children,
  side = 'top',
  className,
}: TooltipProps): ReactNode {
  const tooltipId = useId()
  const triggerRef = useRef<HTMLElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const [placement, setPlacement] = useState<Placement | null>(null)

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const tip = tipRef.current
    if (!trigger || !tip) return
    setPlacement(
      computePlacement(
        trigger.getBoundingClientRect(),
        { width: tip.offsetWidth, height: tip.offsetHeight },
        side,
      ),
    )
  }, [side])

  useLayoutEffect(() => {
    if (!isVisible) return
    updatePosition()
    // Re-measure once webfonts settle so clamping uses final text metrics.
    const raf = requestAnimationFrame(updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [isVisible, updatePosition])

  useEffect(() => {
    if (isVisible) updatePosition()
  }, [label, isVisible, updatePosition])

  // The child may carry its own ref (toolbar buttons anchor popovers to
  // themselves) — keep it wired alongside ours.
  const childRef =
    typeof children === 'object' && children !== null && 'props' in children
      ? ((children as React.ReactElement<any>).props.ref as React.Ref<HTMLElement> | undefined)
      : undefined
  const mergedRef = useCallback(
    (node: HTMLElement | null) => {
      ;(triggerRef as React.MutableRefObject<HTMLElement | null>).current = node
      if (typeof childRef === 'function') childRef(node)
      else if (childRef && typeof childRef === 'object')
        (childRef as React.MutableRefObject<HTMLElement | null>).current = node
    },
    [childRef],
  )

  // Clone the child to add ref, aria-describedby and hover/focus listeners.
  const childWithProps =
    typeof children === 'object' && children !== null && 'props' in children
      ? Object.assign({}, children, {
          props: Object.assign({}, (children as React.ReactElement<any>).props, {
            ref: mergedRef,
            'aria-describedby': isVisible ? tooltipId : undefined,
            onMouseEnter: ((e: React.MouseEvent) => {
              setIsVisible(true)
              ;(children as React.ReactElement<any>).props.onMouseEnter?.(e)
            }) as React.MouseEventHandler,
            onMouseLeave: ((e: React.MouseEvent) => {
              setIsVisible(false)
              ;(children as React.ReactElement<any>).props.onMouseLeave?.(e)
            }) as React.MouseEventHandler,
            onFocus: ((e: React.FocusEvent) => {
              // Scripted focus after pointer clicks shouldn't pop tooltips —
              // only genuine keyboard interaction (focus-visible) does.
              const kb = e.target instanceof Element && e.target.matches(':focus-visible')
              setIsVisible(kb)
              ;(children as React.ReactElement<any>).props.onFocus?.(e)
            }) as React.FocusEventHandler,
            onBlur: ((e: React.FocusEvent) => {
              setIsVisible(false)
              ;(children as React.ReactElement<any>).props.onBlur?.(e)
            }) as React.FocusEventHandler,
          }),
        })
      : children

  const tooltipContent = isVisible ? (
    <span
      ref={tipRef}
      id={tooltipId}
      role="tooltip"
      className={cn(
        'pointer-events-none fixed z-[90] whitespace-nowrap rounded-wobbly-sm px-2 py-0.5 text-xs',
        'bg-ink text-canvas shadow-sketch-sm',
        'animate-fade-in',
      )}
      style={
        placement
          ? {
              top: placement.top,
              left: placement.left,
              // Playful tilt folded into the placement transform (inline style
              // wins over utility classes, so it must live here).
              transform: `${placement.transform} rotate(-1deg)`,
            }
          : // Hidden first paint — present so offsetWidth/Height are measurable.
            { top: 0, left: 0, visibility: 'hidden' }
      }
    >
      {label}
    </span>
  ) : null

  return (
    <span className={cn('relative inline-flex', className)}>
      {childWithProps}
      {createPortal(tooltipContent, document.body)}
    </span>
  )
}
