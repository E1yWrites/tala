import { House, NotebookText, Search, Settings as SettingsIcon, Star } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import type { ViewKind } from '@/types/models'
import { cn } from '@/utils/cn'

interface Tab {
  kind: ViewKind
  label: string
  icon: LucideIcon
}

const TABS: Tab[] = [
  { kind: 'home', label: 'Home', icon: House },
  { kind: 'all', label: 'Notes', icon: NotebookText },
  { kind: 'favorites', label: 'Favorites', icon: Star },
]

/** Mobile bottom navigation. Search opens the global search modal. */
export function MobileNav(): React.ReactNode {
  const activeView = useUIStore((s) => s.activeView)
  const setView = useUIStore((s) => s.setView)
  const openModal = useUIStore((s) => s.openModal)

  const isActive = (kind: ViewKind): boolean => activeView.kind === kind

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-30 flex h-[calc(3.75rem+env(safe-area-inset-bottom))] items-stretch border-t-2 border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.slice(0, 2).map((tab) => (
        <NavTab key={tab.kind} tab={tab} active={isActive(tab.kind)} onClick={() => setView({ kind: tab.kind })} />
      ))}
      <div className="flex flex-1 items-center justify-center">
        <button
          type="button"
          onClick={() => openModal({ kind: 'search' })}
          aria-label="Search notes"
          className="grid size-12 -rotate-2 place-items-center rounded-wobbly border-[3px] border-line bg-postit text-postit-ink shadow-sketch transition-all duration-100 hover:rotate-0 hover:bg-accent hover:text-accent-fg hover:shadow-sketch-sm active:translate-x-[3px] active:translate-y-[3px] active:shadow-none"
        >
          <Search size={20} strokeWidth={2.5} />
        </button>
      </div>
      <NavTab tab={TABS[2]} active={isActive('favorites')} onClick={() => setView({ kind: 'favorites' })} />
      <NavTab
        tab={{ kind: 'settings', label: 'Settings', icon: SettingsIcon }}
        active={isActive('settings')}
        onClick={() => setView({ kind: 'settings' })}
      />
    </nav>
  )
}

function NavTab({
  tab,
  active,
  onClick,
}: {
  tab: Tab
  active: boolean
  onClick: () => void
}): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 transition-colors',
        active ? 'text-accent' : 'text-faint hover:text-muted',
      )}
    >
      <tab.icon size={18} strokeWidth={active ? 2.75 : 2} aria-hidden="true" />
      <span
        className={cn(
          'text-[11px]',
          active && 'underline decoration-wavy decoration-accent underline-offset-4',
        )}
      >
        {tab.label}
      </span>
    </button>
  )
}
