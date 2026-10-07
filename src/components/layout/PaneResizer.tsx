import { useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

const KEY_STEP = 16

/**
 * Drag handle on the right edge of a pane (the parent must be `relative`).
 * Pointer drag, arrow keys (Home/End jump to the limits), double-click resets.
 * With `onCollapse`, letting go below `snapBelow` closes the pane and keeps
 * the width the drag started from for when it reopens.
 */
export function PaneResizer({
  label,
  value,
  min,
  max,
  onChange,
  onReset,
  snapBelow,
  onCollapse,
}: {
  label: string
  value: number
  min: number
  max: number
  onChange: (width: number) => void
  onReset: () => void
  snapBelow?: number
  onCollapse?: () => void
}): React.ReactNode {
  const drag = useRef<{ x: number; width: number; start: number } | null>(null)
  const clamp = (w: number): number => Math.round(Math.min(max, Math.max(min, w)))
  const raw = (e: PointerEvent): number => (drag.current ? drag.current.width + e.clientX - drag.current.x : value)

  const onKeyDown = (e: KeyboardEvent): void => {
    const next =
      e.key === 'ArrowLeft' ? value - KEY_STEP
      : e.key === 'ArrowRight' ? value + KEY_STEP
      : e.key === 'Home' ? min
      : e.key === 'End' ? max
      : null
    if (next === null) return
    e.preventDefault()
    onChange(clamp(next))
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      className="group absolute inset-y-0 -right-1.5 z-10 flex w-3 cursor-col-resize touch-none justify-center outline-none [@media(pointer:coarse)]:-right-2.5 [@media(pointer:coarse)]:w-5"
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.preventDefault()
        e.currentTarget.setPointerCapture(e.pointerId)
        // start from what is on screen: flex may have shrunk the pane below its stored width
        const width = e.currentTarget.parentElement?.getBoundingClientRect().width ?? value
        drag.current = { x: e.clientX, width, start: value }
      }}
      onPointerMove={(e) => {
        if (drag.current) onChange(clamp(raw(e)))
      }}
      onPointerUp={(e) => {
        const start = drag.current?.start
        const snap = snapBelow !== undefined && raw(e) < snapBelow
        drag.current = null
        if (snap && onCollapse && start !== undefined) {
          onChange(start)
          onCollapse()
        }
      }}
      onPointerCancel={() => {
        drag.current = null
      }}
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
    >
      <span
        aria-hidden="true"
        className="h-full w-0.5 transition-colors group-hover:bg-line group-active:bg-accent group-focus-visible:w-[3px] group-focus-visible:bg-ballpoint"
      />
    </div>
  )
}
