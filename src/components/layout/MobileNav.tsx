import { CheckSquare, NotebookText, Plus, Search } from 'lucide-react'
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
 * Phone bottom bar: Notes, Tasks, a big green New note, Search, and the
 * profile menu (Settings lives under the picture). Left-handed mode mirrors it.
 */
export function MobileNav(): React.ReactNode {
  const activeView = useUIStore((s) => s.activeView)
  const setView = useUIStore((s) => s.setView)
  const openModal = useUIStore((s) => s.openModal)
  const leftHanded = usePrefsStore((s) => s.leftHanded)
  const quietMode = usePrefsStore((s) => s.quietMode)
  const toggleQuietMode = usePrefsStore((s) => s.toggleQuietMode)
  const profile = useSettingsStore((s) => s.settings.profile)

  // Every library view (all, starred, folders, tags, ...) counts as the Notes tab
  const notesActive = activeView.kind !== 'tasks' && activeView.kind !== 'settings'

  return (
    <nav
      aria-label="Primary"
      style={{ height: `calc(${MOBILE_NAV_HEIGHT} + env(safe-area-inset-bottom))` }}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-lineSoft bg-panel pb-[env(safe-area-inset-bottom)] md:hidden',
        leftHanded && 'flex-row-reverse',
      )}
    >
      <NavTab
        label="Notes"
        icon={NotebookText}
        active={notesActive}
        onClick={() => setView({ kind: 'all' })}
      />
      <NavTab
        label="Tasks"
        icon={CheckSquare}
        active={activeView.kind === 'tasks'}
        onClick={() => setView({ kind: 'tasks' })}
      />

      <div className="flex flex-1 items-start justify-center">
        <button
          type="button"
          onClick={() => openModal({ kind: 'new-note' })}
          aria-label="New note"
          className="btn-primary -mt-5 size-14 rounded-full shadow-raise ring-4 ring-panel"
        >
          <Plus size={28} strokeWidth={2.5} aria-hidden="true" />
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
                activeView.kind === 'settings' ? 'text-accent' : 'text-faint hover:text-muted',
              )}
            >
              <Avatar src={profile.avatar} name={profile.name} size="xs" />
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
        active ? 'text-accent' : 'text-faint hover:text-muted',
      )}
    >
      <Icon size={20} strokeWidth={active ? 2.75 : 2} aria-hidden="true" />
      <span
        className={cn(
          'text-[11px] font-medium',
          active && 'underline decoration-wavy decoration-accent decoration-[1.5px] underline-offset-4',
        )}
      >
        {label}
      </span>
    </button>
  )
}
