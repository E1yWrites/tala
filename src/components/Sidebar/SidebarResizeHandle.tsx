import { useCallback, useEffect, useRef } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import {
  SIDEBAR_DEFAULT_WIDTH,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_SNAP_COLLAPSE_AT,
  useUIStore,
} from '@/store/uiStore'
import { cn } from '@/utils/cn'

const KEY_STEP = 8

/**
 * Draggable handle on the docked sidebar's right edge.
 * Pointer-drag resizes live (72–360px), snaps to the collapsed rail when dragged
 * below ~96px, and remembers the last expanded width. Double-click resets to 260px.
 * Fully keyboard operable via arrow keys / Home / End.
 */
export function SidebarResizeHandle(): React.ReactNode {
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)
  const commitSidebarWidth = useUIStore((s) => s.commitSidebarWidth)
  const setSidebarResizing = useUIStore((s) => s.setSidebarResizing)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)

  const dragRef = useRef<{ startX: number; startWidth: number; collapsed: boolean } | null>(null)

  // If we unmount mid-drag (focus-mode toggle, breakpoint crossing), the
  // global drag styling and store flag must not stick around forever.
  useEffect(
    () => () => {
      if (dragRef.current === null) return
      dragRef.current = null
      useUIStore.getState().setSidebarResizing(false)
      document.body.classList.remove('sidebar-resizing')
    },
    [],
  )

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      if (e.button !== 0) return
      e.preventDefault()
      e.currentTarget.setPointerCapture(e.pointerId)
      dragRef.current = {
        startX: e.clientX,
        startWidth: useUIStore.getState().sidebarWidth,
        collapsed: useUIStore.getState().sidebarCollapsed,
      }
      setSidebarResizing(true)
      document.body.classList.add('sidebar-resizing')
    },
    [setSidebarResizing],
  )

  const onPointerMove = useCallback(
    (e: PointerEvent<HTMLDivElement>): void => {
      const drag = dragRef.current
      if (!drag) return
      const dx = e.clientX - drag.startX
      if (drag.collapsed) {
        // Dragging right from the collapsed rail re-expands it. Anchor the
        // width at the minimum and keep the original press point so the
        // width grows continuously with the pointer instead of jumping to
        // the pre-collapse width mid-gesture.
        if (dx > KEY_STEP) {
          toggleSidebar()
          drag.collapsed = false
          drag.startWidth = SIDEBAR_MIN_WIDTH
        }
        return
      }
      const next = Math.min(SIDEBAR_MAX_WIDTH, drag.startWidth + dx)
      if (next < SIDEBAR_SNAP_COLLAPSE_AT) {
        // Snap closed but keep the width for when the rail is re-expanded.
        toggleSidebar()
        drag.collapsed = true
        drag.startX = e.clientX
        return
      }
      setSidebarWidth(next)
    },
    [setSidebarWidth, toggleSidebar],
  )

  const endDrag = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return
      dragRef.current = null
      try {
        e.currentTarget.releasePointerCapture(e.pointerId)
      } catch {
        /* capture may already be gone (pointercancel) */
      }
      setSidebarResizing(false)
      document.body.classList.remove('sidebar-resizing')
      commitSidebarWidth()
    },
    [commitSidebarWidth, setSidebarResizing],
  )

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>): void => {
      let next: number | null = null
      switch (e.key) {
        case 'ArrowLeft':
          next = useUIStore.getState().sidebarWidth - KEY_STEP
          break
        case 'ArrowRight':
          next = useUIStore.getState().sidebarWidth + KEY_STEP
          break
        case 'Home':
          next = SIDEBAR_MIN_WIDTH
          break
        case 'End':
          next = SIDEBAR_MAX_WIDTH
          break
        case 'Enter':
        case ' ':
          next = SIDEBAR_DEFAULT_WIDTH
          break
        default:
          return
      }
      e.preventDefault()
      e.stopPropagation()
      // Arrow keys double as an expander when the rail is collapsed.
      if ((e.key === 'ArrowRight' || e.key === 'Home') && useUIStore.getState().sidebarCollapsed) {
        toggleSidebar()
      }
      setSidebarWidth(Math.max(SIDEBAR_MIN_WIDTH, next))
      commitSidebarWidth()
    },
    [commitSidebarWidth, setSidebarWidth, toggleSidebar],
  )

  // Kept mounted while collapsed so an in-flight drag never loses pointer
  // capture, and so dragging right from the rail re-expands it.
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuemin={SIDEBAR_MIN_WIDTH}
      aria-valuemax={SIDEBAR_MAX_WIDTH}
      aria-valuenow={sidebarWidth}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => {
        setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)
        commitSidebarWidth()
        if (useUIStore.getState().sidebarCollapsed) toggleSidebar()
      }}
      onKeyDown={onKeyDown}
      className="group/handle relative z-10 -ml-1.5 h-full w-1.5 shrink-0 cursor-col-resize touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ballpoint/60"
    >
      {/* Grip line — dashed pencil stroke that inks in on hover/drag */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-1/2 top-1/2 h-16 w-0 -translate-x-1/2 -translate-y-1/2',
          'border-l-2 border-dashed border-lineSoft transition-colors duration-150',
          'group-hover/handle:border-accent group-focus-visible/handle:border-ballpoint',
        )}
      />
    </div>
  )
}
