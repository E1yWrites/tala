import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/** Keyboard key chip used in shortcut hints and menus. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return <kbd className={cn('kbd', className)}>{children}</kbd>
}
