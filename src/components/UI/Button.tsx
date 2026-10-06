import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '@/utils/cn'

type Variant = 'primary' | 'subtle' | 'outline' | 'ghost' | 'danger' | 'danger-outline'
type Size = 'sm' | 'md'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  children: ReactNode
}

const variantClasses: Record<Variant, string> = {
  primary: 'btn-primary',
  subtle: 'border border-lineSoft bg-panel text-ink shadow-rest hover:bg-raise',
  outline: 'border border-line bg-transparent text-ink hover:bg-raise',
  ghost: 'text-muted hover:bg-raise hover:text-ink active:scale-[0.97]',
  danger: 'bg-danger text-panel shadow-rest hover:opacity-90',
  'danger-outline': 'border border-danger/60 bg-transparent text-danger hover:bg-danger-soft',
}

// Coarse pointers (fingers, stylus on a tablet) get 44px-class hit areas
const sizeClasses: Record<Size, string> = {
  sm: 'h-8 gap-1.5 rounded-control px-3 text-[13px] font-medium [@media(pointer:coarse)]:min-h-10',
  md: 'h-10 gap-2 rounded-card px-4 text-[14px] font-medium [@media(pointer:coarse)]:min-h-11',
}

/** Standard labeled button. */
export function Button({
  variant = 'subtle',
  size = 'md',
  className,
  children,
  type: typeProp,
  ...rest
}: ButtonProps): ReactNode {
  return (
    <button
      type={typeProp ?? 'button'}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap transition-[background-color,border-color,color,opacity,transform] duration-150 disabled:pointer-events-none disabled:opacity-50',
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
