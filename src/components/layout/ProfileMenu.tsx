import { useUIStore } from '@/store/uiStore'
import { usePrefsStore } from '@/store/prefsStore'
import { useSettingsStore } from '@/store/settingsStore'
import { downloadBackup } from '@/utils/exportImport'
import { Avatar } from '@/components/UI/Avatar'
import { DropdownMenu } from '@/components/UI/DropdownMenu'

/** The profile picture as a menu: Settings, Quiet mode and Back up now. On phones it sits in each top-level header. */
export function ProfileMenu(): React.ReactNode {
  const setView = useUIStore((s) => s.setView)
  const leftHanded = usePrefsStore((s) => s.leftHanded)
  const quietMode = usePrefsStore((s) => s.quietMode)
  const toggleQuietMode = usePrefsStore((s) => s.toggleQuietMode)
  const profile = useSettingsStore((s) => s.settings.profile)

  return (
    <DropdownMenu
      side="bottom"
      align={leftHanded ? 'start' : 'end'}
      items={[
        { id: 'settings', label: 'Settings', onSelect: () => setView({ kind: 'settings' }) },
        { id: 'quiet', label: 'Quiet mode (Bituin)', checked: quietMode, onSelect: toggleQuietMode },
        { id: 'sep', label: '', type: 'separator', onSelect: () => {} },
        { id: 'backup', label: 'Back up now', onSelect: () => void downloadBackup() },
      ]}
      trigger={(props) => (
        <button
          {...props}
          type="button"
          aria-label={`${profile.name || 'Profile'}: settings and more`}
          className="grid size-11 shrink-0 place-items-center rounded-control transition-transform duration-150 ease-out active:scale-[0.94]"
        >
          <Avatar src={profile.avatar} name={profile.name} size="sm" className="border-lineSoft bg-rail font-semibold text-rail-fg" />
        </button>
      )}
    />
  )
}
