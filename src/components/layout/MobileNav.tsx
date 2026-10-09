import { CalendarCheck, NotebookText, Plus, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { usePrefsStore } from '@/store/prefsStore'
import { useSettingsStore } from '@/store/settingsStore'
import { downloadBackup } from '@/utils/exportImport'
import { Avatar } from '@/components/UI/Avatar'
import { DropdownMenu } from '@/components/UI/DropdownMenu'
import { cn } from '@/utils/cn'

/** Height of the bar itself; the page above reserves this plus the safe area. */
export const MOBILE_NAV_HEIGHT = '3.75rem'

/**
 * Phone bottom bar on the green rail: Notes, Today (with Upcoming, Tasks and Money inside),
 * the gold New note, Search, and the profile menu (Settings lives under the
 * picture). Left-handed mode mirrors it.
 */
export function MobileNav(): React.ReactNode {
  const activeView = useUIStore((s) => s.activeView)
  const setView = useUIStore((s) => s.setView)
  const openModal = useUIStore((s) => s.openModal)
  const leftHanded = usePrefsStore((s) => s.leftHanded)
  const quietMode = usePrefsStore((s) => s.quietMode)
  const toggleQuietMode = usePrefsStore((s) => s.toggleQuietMode)
  const profile = useSettingsStore((s) => s.settings.profile)

  // Today, Upcoming, Tasks and Money are the Today tab; every library view (all, starred, folders, ...) is Notes
  const todayActive = activeView.kind === 'home' || activeView.kind === 'agenda' || activeView.kind === 'tasks' || activeView.kind === 'money'
  const notesActive = !todayActive && activeView.kind !== 'settings'

  return (
    <nav
      aria-label="Primary"
      style={{ height: `calc(${MOBILE_NAV_HEIGHT} + env(safe-area-inset-bottom))` }}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-rail-line bg-rail pb-[env(safe-area-inset-bottom)] text-rail-fg md:hidden',
        leftHanded && 'flex-row-reverse',
      )}
    >
      <NavTab
        label="Notes"
        icon={NotebookText}
        active={notesActive}
        onClick={() => setView({ kind: 'all' })}
      />
      <NavTab label="Today" icon={CalendarCheck} active={todayActive} onClick={() => setView({ kind: 'home' })} />

      <div className="flex flex-1 items-start justify-center">
        <button
          type="button"
          onClick={() => openModal({ kind: 'new-note' })}
          aria-label="New note"
          className="-mt-5 grid size-14 place-items-center rounded-full bg-gold text-gold-fg shadow-raise ring-4 ring-rail transition-transform active:scale-95"
        >
          <Plus size={26} strokeWidth={2.4} aria-hidden="true" />
        </button>
      </div>

      <NavTab label="Search" icon={Search} active={false} onClick={() => openModal({ kind: 'search' })} />

      <div className="flex flex-1 items-stretch [&>div]:flex-1">
        <DropdownMenu
          side="top"
          align={leftHanded ? 'start' : 'end'}
          items={[
            { id: 'settings', label: 'Settings', onSelect: () => setView({ kind: 'settings' }) },
            {
              id: 'quiet',
              label: 'Quiet mode (Bituin)',
              checked: quietMode,
              onSelect: toggleQuietMode,
            },
            { id: 'sep', label: '', type: 'separator', onSelect: () => {} },
            { id: 'backup', label: 'Back up now', onSelect: () => void downloadBackup() },
          ]}
          trigger={(props) => (
            <button
              {...props}
              type="button"
              aria-label={`${profile.name || 'Profile'}: settings and more`}
              className={cn(
                'flex w-full flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 transition-colors',
                activeView.kind === 'settings' ? 'text-rail-fg' : 'text-rail-muted hover:text-rail-fg',
              )}
            >
              <Avatar src={profile.avatar} name={profile.name} size="xs" className="border-transparent bg-gold font-semibold text-gold-fg" />
              <span className="text-[11px]">You</span>
            </button>
          )}
        />
      </div>
    </nav>
  )
}

function NavTab({
  label,
  icon: Icon,
  active,
  onClick,
}: {
  label: string
  icon: LucideIcon
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
        active ? 'text-rail-fg' : 'text-rail-muted hover:text-rail-fg',
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" className={active ? 'text-gold' : undefined} />
      <span
        className={cn(
          'text-[11px] font-medium',
          active && 'font-semibold',
        )}
      >
        {label}
      </span>
    </button>
  )
}
