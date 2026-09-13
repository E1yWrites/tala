import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { PenTool } from 'lucide-react'
import type { InkPointerMode } from '@/types/ink'
import { cn } from '@/utils/cn'
import { Tooltip } from '../../UI/Tooltip'
import { TOOL_BY_ID } from '../ink/PenPopover'
import type { ToolButtonSize } from './ToolButton'

/* ---------------------------------------------------------------------------
   The ONE Draw control. Idle (text mode) it is the way into handwriting;
   active it shows the current tool with its ink colour and opens the Draw
   popover. Never hides which tool is live.
--------------------------------------------------------------------------- */

interface DrawControlProps {
  active: boolean
  tool: InkPointerMode
  color: string
  open: boolean
  size?: ToolButtonSize
  onClick: () => void
  noTooltip?: boolean
}

export const DrawControl = forwardRef<HTMLButtonElement, DrawControlProps>(function DrawControl(
  { active, tool, color, open, size = 'sm', onClick, noTooltip = false },
  ref,
) {
  const lg = size === 'lg'
  const spec = TOOL_BY_ID[tool]
  const Icon = active ? spec.icon : PenTool
  const showInk = active && tool !== 'eraser' && tool !== 'select'
  const label = active ? `${spec.label} — tools & colours` : 'Draw'

  const button = (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-haspopup="dialog"
      aria-expanded={open}
      data-active={active || undefined}
      onClick={onClick}
      className={cn(
        'relative flex shrink-0 items-center justify-center gap-1 rounded-wobbly-sm transition-[background-color,color,transform] duration-100 active:scale-95',
        lg ? 'h-11 w-[58px]' : 'h-8 w-[46px]',
        active
          ? 'bg-postit text-postit-ink'
          : 'text-muted hover:bg-raise hover:text-ink',
        open && !active && 'bg-raise text-ink',
      )}
    >
      <span className="relative grid place-items-center" aria-hidden="true">
        <Icon size={lg ? 22 : 18} strokeWidth={active ? 2.5 : 2} />
        {showInk && (
          <span
            className={cn(
              'absolute rounded-full border-[1.5px] border-postit',
              lg ? '-bottom-1.5 -right-1.5 size-3' : '-bottom-1 -right-1 size-2.5',
            )}
            style={{ backgroundColor: color }}
          />
        )}
      </span>
      <svg aria-hidden="true" viewBox="0 0 8 8" className={cn('opacity-70', lg ? 'size-2.5' : 'size-2')}>
        <path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  )
  return noTooltip ? button : <Tooltip label={label} side={lg ? 'top' : 'bottom'}>{button}</Tooltip>
})

/** Small helper so selection/other toolbars can show the live ink. */
export function InkDot({ color, className }: { color: string; className?: string }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block size-3 rounded-full border border-black/15 dark:border-white/20', className)}
      style={{ backgroundColor: color }}
    />
  )
}
