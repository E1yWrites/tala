import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

interface TooltipProps {
  label: string
  children: ReactNode
  side?: 'top' | 'bottom'
  className?: string
}

/**
 * Lightweight CSS-only tooltip. Shows on hover and keyboard focus.
 * The child must be a single focusable element (e.g. IconButton).
 */
export function Tooltip({
  label,
  children,
  side = 'top',
  className,
}: TooltipProps): ReactNode {
  return (
    <span className={cn('group/tt relative inline-flex', className)}>
      {children}
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-wobbly-sm px-2 py-0.5 text-xs opacity-0 scale-95 transition-all duration-150',
          'bg-ink text-canvas shadow-sketch-sm -rotate-1',
          '[@media(hover:hover)]:group-hover/tt:opacity-100 [@media(hover:hover)]:group-hover/tt:scale-100 group-focus-visible/tt:opacity-100',
          side === 'top' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]',
        )}
      >
        {label}
      </span>
    </span>
  )
}
