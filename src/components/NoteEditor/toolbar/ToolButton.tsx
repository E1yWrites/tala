import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/utils/cn'
import { Tooltip } from '../../UI/Tooltip'

/* ---------------------------------------------------------------------------
   The one button every editor toolbar is built from. Two sizes:
     sm — 32px, desktop header rows (mouse)
     lg — 44px, floating touch toolbar (finger / stylus)
   Active state is the app-wide "picked" contract: post-it fill, dark ink.
--------------------------------------------------------------------------- */

export type ToolButtonSize = 'sm' | 'lg'

interface ToolButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon?: LucideIcon
  label: string
  active?: boolean
  size?: ToolButtonSize
  /** Renders a small chevron — the button opens a menu. */
  menu?: boolean
  /** Custom glyph instead of `icon` (colour dots, stroke previews). */
  children?: ReactNode
  /** Skip the tooltip (touch surfaces show none). */
  noTooltip?: boolean
  tooltipSide?: 'top' | 'bottom'
}

export const ToolButton = forwardRef<HTMLButtonElement, ToolButtonProps>(function ToolButton(
  {
    icon: Icon,
    label,
    active = false,
    size = 'sm',
    menu = false,
    children,
    noTooltip = false,
    tooltipSide = 'bottom',
    className,
    disabled,
    type,
    ...rest
  },
  ref,
) {
  const lg = size === 'lg'
  const button = (
    <button
      ref={ref}
      type={type ?? 'button'}
      aria-label={label}
      aria-pressed={rest['aria-haspopup'] ? undefined : active}
      disabled={disabled}
      className={cn(
        'relative grid shrink-0 place-items-center rounded-wobbly-sm transition-[background-color,color,transform,opacity] duration-100 active:scale-95',
        lg ? 'size-11' : 'size-8',
        menu && (lg ? 'w-[52px]' : 'w-10'),
        active
          ? 'bg-postit text-postit-ink'
          : 'text-muted hover:bg-raise hover:text-ink',
        disabled && 'pointer-events-none opacity-35',
        className,
      )}
      {...rest}
    >
      <span className="grid place-items-center" aria-hidden="true">
        {children ?? (Icon ? <Icon size={lg ? 22 : 17} strokeWidth={active ? 2.5 : 2} /> : null)}
      </span>
      {menu && (
        <svg
          aria-hidden="true"
          viewBox="0 0 8 8"
          className={cn('absolute bottom-1 right-1 opacity-70', lg ? 'size-2.5' : 'size-2')}
        >
          <path d="M1 2.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  )
  if (noTooltip) return button
  return (
    <Tooltip label={label} side={tooltipSide}>
      {button}
    </Tooltip>
  )
})

/** Hairline divider between toolbar groups. */
export function ToolSeparator({ size = 'sm' }: { size?: ToolButtonSize }): ReactNode {
  return (
    <span
      aria-hidden="true"
      className={cn('mx-0.5 w-px shrink-0 bg-lineSoft', size === 'lg' ? 'h-6' : 'h-5')}
    />
  )
}
