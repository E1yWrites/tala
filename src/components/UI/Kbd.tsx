import type { ReactNode } from 'react'

/** Keyboard key chip used in shortcut hints and menus. */
export function Kbd({ children }: { children: ReactNode }): ReactNode {
  return <kbd className="kbd">{children}</kbd>
}
