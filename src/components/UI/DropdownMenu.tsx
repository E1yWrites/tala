import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/utils/cn'

export interface MenuItem {
  id: string
  label: string
  onSelect: () => void
  danger?: boolean
  disabled?: boolean
  /** Shows a trailing checkmark (for toggles like sort options) */
  checked?: boolean
}

interface DropdownMenuProps {
  items: MenuItem[]
  /** Render-prop for the trigger; receives open state + handlers. */
  trigger: (props: {
    onClick: (e: React.MouseEvent) => void
    onKeyDown: (e: React.KeyboardEvent) => void
    'aria-haspopup': 'menu'
    'aria-expanded': boolean
    ref: React.Ref<HTMLButtonElement>
  }) => ReactNode
  align?: 'start' | 'end'
  side?: 'top' | 'bottom'
  className?: string
}

/** Small keyboard-accessible menu. Esc / outside click close it. */
export function DropdownMenu({
  items,
  trigger,
  align = 'end',
  side = 'bottom',
  className,
}: DropdownMenuProps): ReactNode {
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  /** Flipped to open upward when there isn't room below (viewport edge). */
  const [flipped, setFlipped] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Horizontal offset from default CSS position to keep menu inside viewport.
  const [horizShift, setHorizShift] = useState(0)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  // Flip upward when the menu would overflow the bottom of the viewport,
  // and shift horizontally when it would overflow the left or right edges.
  // On mobile layouts a fixed bottom nav overlays ~64px of that space, so
  // menus near it must flip even though they technically fit.
  useLayoutEffect(() => {
    if (!open) return
    const root = rootRef.current
    const menu = menuRef.current
    if (!root || !menu) return
    const triggerRect = root.getBoundingClientRect()
    const menuRect = menu.getBoundingClientRect()
    const menuH = menuRect.height
    const menuW = menuRect.width
    const bottomNav = window.innerWidth < 1024 ? 64 : 0

    // Vertical flip
    setFlipped(
      side === 'bottom' &&
        triggerRect.bottom + menuH > window.innerHeight - bottomNav &&
        triggerRect.top > menuH,
    )

    // Horizontal clamping — default align="end" means CSS sets right:0,
    // placing the menu's right edge at the trigger's right edge. Shift if
    // the menu would extend past the viewport left or right boundary.
    const pad = 8
    const defaultRight = triggerRect.right
    const wouldOverflowLeft = defaultRight - menuW < pad
    const wouldOverflowRight = defaultRight > window.innerWidth - pad

    if (wouldOverflowLeft) {
      setHorizShift(Math.max(0, menuW - defaultRight + pad))
    } else if (wouldOverflowRight) {
      setHorizShift(Math.min(0, window.innerWidth - defaultRight - menuW - pad))
    } else {
      setHorizShift(0)
    }
  }, [open, items.length, side])

  useEffect(() => {
    if (open) setActiveIndex(Math.max(0, items.findIndex((i) => !i.disabled)))
  }, [open, items])

  const select = (item: MenuItem): void => {
    if (item.disabled) return
    setOpen(false)
    triggerRef.current?.focus()
    item.onSelect()
  }

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        onClick: () => setOpen((o) => !o),
        onKeyDown: (e) => {
          // Mouse users leave focus on the trigger; Escape must close only
          // the menu here instead of bubbling up to a host modal.
          if (open && e.key === 'Escape') {
            e.preventDefault()
            e.stopPropagation()
            setOpen(false)
            return
          }
          if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
            if (!open) {
              e.preventDefault()
              setOpen(true)
            }
          }
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        ref: triggerRef,
      })}
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-orientation="vertical"
          style={{
            // Override CSS right:0 with viewport-clamped horizontal position
            ...(horizShift !== 0 ? { transform: `translateX(${horizShift}px)` } : undefined),
          } as CSSProperties | undefined}
          className={cn(
            'absolute z-50 min-w-[180px] overflow-hidden rounded-wobbly-md border-2 border-line bg-overlay p-1.5 shadow-sketch animate-scale-in',
            align === 'end' ? 'right-0' : 'left-0',
            side === 'top' || flipped
              ? 'bottom-[calc(100%+4px)]'
              : 'top-[calc(100%+4px)]',
            className,
          )}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation()
              setOpen(false)
              triggerRef.current?.focus()
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActiveIndex((i) => {
                let next = i
                for (let step = 0; step < items.length; step++) {
                  next = (next + 1) % items.length
                  if (!items[next].disabled) break
                }
                return next
              })
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActiveIndex((i) => {
                let next = i
                for (let step = 0; step < items.length; step++) {
                  next = (next - 1 + items.length) % items.length
                  if (!items[next].disabled) break
                }
                return next
              })
            } else if (e.key === 'Enter') {
              e.preventDefault()
              const item = items[activeIndex]
              if (item) select(item)
            }
          }}
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false)
          }}
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              tabIndex={index === activeIndex ? 0 : -1}
              autoFocus={index === activeIndex}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(item)}
              className={cn(
                'flex w-full items-center rounded-wobbly-sm px-2.5 py-1.5 text-left text-xs font-medium transition-colors duration-100',
                item.danger
                  ? 'text-accent'
                  : 'text-muted',
                index === activeIndex &&
                  (item.danger
                    ? 'bg-accent/10 text-accent'
                    : 'bg-postit text-postit-ink'),
                item.disabled && 'opacity-40 pointer-events-none',
              )}
            >
              <span className="flex-1">{item.label}</span>
              {item.checked && <Check size={13} aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
