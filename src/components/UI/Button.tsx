import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'

type Variant = 'primary' | 'subtle' | 'outline' | 'ghost' | 'danger' | 'danger-outline'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

/** Hard-shadow buttons "press flat": shadow shrinks on hover, vanishes on press. */
const PRESS =
  'hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-sketch-sm active:translate-x-[4px] active:translate-y-[4px] active:shadow-none'

const variantClasses: Record<Variant, string> = {
  // Post-it yellow at rest, fills with red marker ink on hover.
  primary: cn(
    'border-[3px] border-line bg-postit text-postit-ink shadow-sketch',
    PRESS,
    'hover:bg-accent hover:text-accent-fg',
  ),
  // Muted paper that takes ballpoint blue on hover.
  subtle: cn(
    'border-2 border-line bg-panel text-ink shadow-sketch-sm',
    PRESS,
    'hover:bg-ballpoint hover:text-canvas',
  ),
  outline: cn(
    'border-2 border-dashed border-line bg-transparent text-ink',
    PRESS,
    'hover:border-solid hover:bg-raise',
  ),
  ghost:
    'text-muted hover:bg-raise hover:text-ink active:scale-[0.97]',
  danger: cn(
    'border-[3px] border-line bg-accent text-accent-fg shadow-sketch',
    PRESS,
    'hover:bg-accent-strong',
  ),
  'danger-outline': cn(
    'border-2 border-dashed border-accent/70 bg-transparent text-accent',
    PRESS,
    'hover:bg-accent/10',
  ),
}

const sizeClasses: Record<Size, string> = {
  sm: 'h-7 gap-1.5 rounded-wobbly-sm px-3 text-[13px]',
  md: 'h-9 gap-2 rounded-wobbly px-4 text-[15px]',
}

/** Standard labeled button. */
export function Button({
  variant = 'subtle',
  size = 'md',
  className,
  children,
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap transition-all duration-100 disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
