import { Menu, PanelLeft } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { usePrefsStore } from '@/store/prefsStore'
import { useMediaQuery, BREAKPOINTS } from '@/hooks/useMediaQuery'
import { Tooltip } from '@/components/UI/Tooltip'
import { cn } from '@/utils/cn'

/**
 * The way back to a hidden sidebar, placed first in each top-level view's
 * header so it sits where the sidebar's own "Hide sidebar" button was.
 * Docked layouts (≥1024px) show it only while the sidebar is hidden; smaller
 * screens always show it and open the drawer. Focus mode keeps its own exit.
 */
export function SidebarToggle({ className }: { className?: string }): React.ReactNode {
  const isDesktop = useMediaQuery(BREAKPOINTS.desktop)
  const collapsed = usePrefsStore((s) => s.sidebarCollapsed)
  const toggleSidebar = usePrefsStore((s) => s.toggleSidebar)
  const focusMode = useUIStore((s) => s.focusMode)
  const setSidebarDrawer = useUIStore((s) => s.setSidebarDrawer)

  if (focusMode || (isDesktop && !collapsed)) return null
  const label = isDesktop ? 'Show sidebar' : 'Open navigation'
  const Icon = isDesktop ? PanelLeft : Menu

  return (
    <Tooltip label={label} side="right">
      <button
        type="button"
        onClick={isDesktop ? toggleSidebar : () => setSidebarDrawer(true)}
        aria-label={label}
        className={cn(
          'grid size-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-raise hover:text-ink [@media(pointer:coarse)]:size-11',
          className,
        )}
      >
        <Icon size={18} strokeWidth={isDesktop ? 2 : 2.5} />
      </button>
    </Tooltip>
  )
}
