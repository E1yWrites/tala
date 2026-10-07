import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  Download,
  FlaskConical,
  HardDrive,
  Import,
  Keyboard,
  Moon,
  Palette,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Star,
  Sun,
  SunMoon,
  Trash2,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import type { SortKey, ThemeMode, ViewDensity } from '@/types/models'
import { useSettingsStore } from '@/store/settingsStore'
import { useUIStore } from '@/store/uiStore'
import { usePrefsStore } from '@/store/prefsStore'
import { detectEnv } from '@/coach/env'
import { BITUIN } from '@/coach/copy'
import { MAX_WEEKLY_GOAL } from '@/coach/study'
import { setWeeklyGoal, useStudyStore } from '@/library/study'
import { getEngine, indexAllInk, unindexedPages } from '@/library/inkText'
import { isPersisted } from '@/library/storage'
import { formatRelative } from '@/utils/dates'
import { wipe } from '@/library/snapshot'
import { downloadBackup, importBackupFile, restoreBackup, type BackupFile } from '@/utils/exportImport'
import { Button } from '@/components/UI/Button'
import { cn } from '@/utils/cn'
import { Avatar } from '@/components/UI/Avatar'
import { MOD } from '@/utils/keys'

/* ------------------------------ Small pieces ------------------------------ */

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  title: string
  description?: string
  children: React.ReactNode
}): React.ReactNode {
  return (
    <section className="rounded-card border border-lineSoft bg-panel p-4 shadow-rest sm:p-5">
      <header className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full border border-line bg-canvas text-accent">
          <Icon className="size-5" strokeWidth={2.5} />
        </span>
        <div>
          <h2 className="font-bold tracking-[-0.02em] text-xl leading-snug">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-snug text-muted">{description}</p>}
        </div>
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function SettingRow({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}): React.ReactNode {
  return (
    <div
      data-row
      className="grid grid-cols-1 items-center gap-x-6 gap-y-2 sm:grid-cols-[minmax(0,1fr)_var(--control-w,15rem)]"
    >
      <div className="min-w-0">
        <p className="text-[13px] font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-snug text-faint">{hint}</p>}
      </div>
      {/* Shared control column — every control in the card lands on the same
          right edge; sliders/inputs stretch to fill it. */}
      <div className="flex min-w-0 items-center justify-start sm:justify-end [&>*]:max-w-full">
        {children}
      </div>
    </div>
  )
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
}: {
  value: T
  options: { value: T; label: string; icon?: React.ComponentType<{ className?: string; strokeWidth?: number }> }[]
  onChange: (v: T) => void
  ariaLabel: string
}): React.ReactNode {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-control border border-lineSoft bg-canvas p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-control px-3 py-1.5 text-xs transition-colors',
            value === opt.value ? 'bg-selected text-selected-ink' : 'text-muted hover:text-ink',
          )}
        >
          {opt.icon && <opt.icon className="size-4" strokeWidth={2.5} />}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
  disabled?: boolean
}): React.ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-7 w-12 rounded-full border border-line transition-colors disabled:pointer-events-none disabled:opacity-40',
        checked ? 'border-accent bg-accent' : 'bg-canvas',
      )}
    >
      <span
        className={cn(
          'absolute left-[3px] top-[3px] size-5 rounded-full bg-panel shadow-rest transition-transform',
          checked && 'translate-x-5',
        )}
      />
    </button>
  )
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'updated-desc', label: 'Last edited first' },
  { value: 'updated-asc', label: 'Oldest edited first' },
  { value: 'created-desc', label: 'Newest created' },
  { value: 'title-asc', label: 'Title A → Z' },
  { value: 'title-desc', label: 'Title Z → A' },
]

/** Sidebar width slider — stays in sync with dragging the resize handle. */

/* -------------------------------- The page -------------------------------- */

export function SettingsPage(): React.ReactNode {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const openModal = useUIStore((s) => s.openModal)
  const setView = useUIStore((s) => s.setView)

  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const env = detectEnv()
  const quietMode = usePrefsStore((s) => s.quietMode)
  const weeklyGoal = useStudyStore((st) => st.goal)
  const toggleQuietMode = usePrefsStore((s) => s.toggleQuietMode)
  const leftHanded = usePrefsStore((s) => s.leftHanded)
  const setLeftHanded = usePrefsStore((s) => s.setLeftHanded)
  const handwritingSearch = usePrefsStore((s) => s.handwritingSearch)
  const setHandwritingSearch = usePrefsStore((s) => s.setHandwritingSearch)
  const [recognizer, setRecognizer] = useState<'checking' | 'built-in' | 'none'>('checking')
  const [reading, setReading] = useState<string | null>(null)
  useEffect(() => {
    let stale = false
    void getEngine().then((e) => !stale && setRecognizer(e ? 'built-in' : 'none'))
    return () => {
      stale = true
    }
  }, [])
  const lastBackupAt = usePrefsStore((s) => s.coach.lastBackupAt)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef<BackupFile | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)

  useEffect(() => {
    void isPersisted().then(setPersisted)
    navigator.storage
      ?.estimate?.()
      .then((est) => setStorage({ usage: est.usage ?? 0, quota: est.quota ?? 0 }))
      .catch(() => setStorage(null))
  }, [])

  function fmtBytes(n: number): string {
    if (n < 1024) return `${n} B`
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
    return `${(n / (1024 * 1024)).toFixed(1)} MB`
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const backup = await importBackupFile(file)
      pendingRef.current = backup
      setPendingName(file.name)
      toast.info(`Backup read: ${backup.notes.length} notes`, {
        description: 'Choose Merge or Replace below.',
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not read that file.')
    }
  }

  async function applyPending(mode: 'merge' | 'replace'): Promise<void> {
    const backup = pendingRef.current
    if (!backup) return
    try {
      const counts = await restoreBackup(backup, mode)
      toast.success(
        `Restored ${counts.notes} notes, ${counts.folders} folders, ${counts.tags} tags`,
        { description: mode === 'replace' ? 'Library replaced.' : 'Merged into your library.' },
      )
    } catch (err) {
      console.error(err)
      toast.error('Restore failed — see console for details.')
    } finally {
      pendingRef.current = null
      setPendingName(null)
    }
  }

  function confirmClearAll(): void {
    openModal({
      kind: 'confirm',
      title: 'Delete everything?',
      message:
        'This permanently erases all notes, folders and tags stored in this browser. This cannot be undone — export a backup first if you might want your data later.',
      confirmLabel: 'Delete everything',
      danger: true,
      onConfirm: async () => {
        await wipe()
        try {
          localStorage.clear()
          sessionStorage.clear()
        } catch {
          /* ignore */
        }
        window.location.reload()
      },
    })
  }

  /** Dev-safe onboarding replay — flips setupCompleted only; nothing is erased. */
  function confirmResetSetup(): void {
    openModal({
      kind: 'confirm',
      title: 'Re-run the setup wizard?',
      message: 'The welcome flow will play again on the next launch. Your notes, folders and profile are kept.',
      confirmLabel: 'Re-run wizard',
      onConfirm: () => {
        update({ setupCompleted: false })
        setView({ kind: 'home' })
      },
    })
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Content grid: begins right after the sidebar with a stable gutter and
          a bounded column — never centered into a wide dead zone. */}
      <div className="w-full max-w-[47rem] space-y-4 px-5 py-6 pb-16 sm:px-10 sm:py-8">
        {/* Header */}
        <header className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setView({ kind: 'all' })}
            aria-label="Back to notes"
          >
            <ChevronLeft className="size-4" />
            Back
          </Button>
          <h1 className="font-bold tracking-[-0.02em] text-2xl">Settings</h1>
        </header>

        {/* Profile */}
        <Section
          icon={User}
          title="Profile"
          description="Shown on the home greeting and sidebar."
        >
          <SettingRow label="Profile picture" hint="Managed here — click the picture to change or remove it">
            <div className="flex max-w-full items-center gap-3">
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => openModal({ kind: 'profile-picture' })}
                  aria-label="Change profile picture"
                  className="relative block rounded-full outline-none"
                >
                  <Avatar
                    src={settings.profile.avatar}
                    name={settings.profile.name}
                    size="lg"
                    showEditOverlay
                  />
                </button>
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {settings.profile.name || 'No name set'}
                </p>
                <p className="truncate text-xs text-faint">
                  {settings.profile.avatar ? 'Click the picture to change' : 'Click to add a picture'}
                </p>
              </div>
            </div>
          </SettingRow>
          <SettingRow label="Name" hint="Used for the greeting, e.g. “Good morning, Sam”">
            <input
              type="text"
              value={settings.profile.name}
              onChange={(e) => update({ profile: { ...settings.profile, name: e.target.value } })}
              placeholder="Your name"
              aria-label="Profile name"
              maxLength={40}
              className="h-9 w-full rounded-card border border-lineSoft bg-canvas px-2.5 text-sm outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
            />
          </SettingRow>
          <SettingRow label="Role or tagline" hint="Optional — shown under your name in the sidebar">
            <input
              type="text"
              value={settings.profile.role}
              onChange={(e) => update({ profile: { ...settings.profile, role: e.target.value } })}
              placeholder="Student, Writer…"
              aria-label="Profile role"
              maxLength={40}
              className="h-9 w-full rounded-card border border-lineSoft bg-canvas px-2.5 text-sm outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
            />
          </SettingRow>
        </Section>

        {/* Appearance */}
        <Section
          icon={Palette}
          title="Appearance"
          description="Theme and how dense your note lists feel."
        >
          <SettingRow label="Theme" hint="Follows your system when set to Auto">
            <Segmented<ThemeMode>
              ariaLabel="Theme"
              value={settings.theme}
              onChange={(theme) => update({ theme })}
              options={[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'system', label: 'Auto', icon: SunMoon },
              ]}
            />
          </SettingRow>
          <SettingRow label="List density">
            <Segmented<ViewDensity>
              ariaLabel="List density"
              value={settings.viewDensity}
              onChange={(viewDensity) => update({ viewDensity })}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
                { value: 'grid', label: 'Grid' },
              ]}
            />
          </SettingRow>
        </Section>

        {/* Editor */}
        <Section
          icon={SlidersHorizontal}
          title="Editor"
          description="Typography of the note editor."
        >
          <SettingRow label="Font size" hint={`${settings.editorFontSize}px`}>
            <input
              type="range"
              min={13}
              max={19}
              step={1}
              value={settings.editorFontSize}
              onChange={(e) => update({ editorFontSize: Number(e.target.value) })}
              aria-label="Editor font size"
              className="w-full accent-[rgb(var(--c-accent))]"
            />
          </SettingRow>
          <SettingRow label="Line height">
            <Segmented<string>
              ariaLabel="Line height"
              value={String(settings.editorLineHeight)}
              onChange={(v) => update({ editorLineHeight: Number(v) })}
              options={[
                { value: '1.5', label: 'Cozy' },
                { value: '1.7', label: 'Normal' },
                { value: '1.9', label: 'Roomy' },
              ]}
            />
          </SettingRow>
        </Section>

        {/* Behavior */}
        <Section
          icon={Settings2}
          title="Behavior"
          description="How saving, deleting and sorting work by default."
        >
          <SettingRow label="Autosave" hint="Save changes automatically as you type">
            <Switch
              checked={settings.autosaveEnabled}
              onChange={(autosaveEnabled) => update({ autosaveEnabled })}
              label="Autosave"
            />
          </SettingRow>
          <SettingRow label="Confirm before delete" hint="Show a confirmation when deleting notes">
            <Switch
              checked={settings.confirmBeforeDelete}
              onChange={(confirmBeforeDelete) => update({ confirmBeforeDelete })}
              label="Confirm before delete"
            />
          </SettingRow>
          <SettingRow label="Default sort order">
            <select
              value={settings.sortKey}
              onChange={(e) => update({ sortKey: e.target.value as SortKey })}
              aria-label="Default sort order"
              className="h-10 w-full rounded-card border border-lineSoft bg-canvas px-2.5 text-sm outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </SettingRow>
        </Section>

        {/* Bituin and writing */}
        <Section
          icon={Star}
          title="Bituin and writing"
          description="How the star coach behaves, and how the pen tools sit for your hand."
        >
          <SettingRow
            label="Quiet mode"
            hint="Bituin stops reacting and reminding you. Your notes and backups are unaffected."
          >
            <Switch checked={quietMode} onChange={toggleQuietMode} label="Quiet mode" />
          </SettingRow>
          <SettingRow label={BITUIN.week.goalLabel} hint={BITUIN.week.goalHint}>
            <select
              value={weeklyGoal}
              onChange={(e) => setWeeklyGoal(Number(e.target.value))}
              aria-label={BITUIN.week.goalLabel}
              className="h-10 w-full rounded-card border border-lineSoft bg-canvas px-2.5 text-sm outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
            >
              {Array.from({ length: MAX_WEEKLY_GOAL }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n} study {n === 1 ? 'day' : 'days'} a week
                </option>
              ))}
            </select>
          </SettingRow>
          <SettingRow
            label="Left-handed layout"
            hint="Mirrors the phone tab bar, the pen bar and Bituin's corner."
          >
            <Switch checked={leftHanded} onChange={setLeftHanded} label="Left-handed layout" />
          </SettingRow>
        </Section>

        {/* Experiments */}
        <Section
          icon={FlaskConical}
          title="Experiments"
          description="Things that work on some devices and may change or go away."
        >
          <SettingRow
            label="Handwriting search"
            hint={
              recognizer === 'none'
                ? 'This browser has no handwriting recognition (Chrome on ChromeOS and some Android devices does; Safari on iPad does not yet). Nothing is downloaded or sent anywhere.'
                : 'Reads your handwriting in the background so search can find it. It uses your browser’s built-in recognizer, so nothing leaves this device. Accuracy varies.'
            }
          >
            <Switch
              checked={handwritingSearch && recognizer === 'built-in'}
              onChange={setHandwritingSearch}
              label="Handwriting search"
              disabled={recognizer !== 'built-in'}
            />
          </SettingRow>
          {handwritingSearch && recognizer === 'built-in' && (
            <SettingRow
              label="Read existing handwriting"
              hint="Notes written before you turned this on are not searchable by their handwriting until they are read."
            >
              <Button
                variant="outline"
                size="sm"
                disabled={reading !== null}
                onClick={() => {
                  const todo = unindexedPages().length
                  if (todo === 0) return void toast.info('All your handwriting has been read.')
                  setReading(`Reading 0 of ${todo}…`)
                  void indexAllInk((done, total) => setReading(`Reading ${done} of ${total}…`))
                    .then((n) => toast.success(`Read ${n} page${n === 1 ? '' : 's'} of handwriting.`))
                    .catch(() => toast.error('Could not read the handwriting.'))
                    .finally(() => setReading(null))
                }}
              >
                {reading ?? 'Read it now'}
              </Button>
            </SettingRow>
          )}
        </Section>

        {/* Shortcuts */}
        <Section icon={Keyboard} title="Keyboard shortcuts" description="Fast navigation for keyboard people.">
          <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
            {SHORTCUTS.map(([keys, desc]) => (
              <div key={desc} className="flex items-center justify-between gap-3 py-0.5">
                <span className="text-[13px] text-muted">{desc}</span>
                <kbd className="kbd shrink-0">{keys}</kbd>
              </div>
            ))}
          </div>
        </Section>

        {/* Data */}
        <Section
          icon={HardDrive}
          title="Data"
          description={
            storage
              ? `Everything lives in this browser only. Using ${fmtBytes(storage.usage)} of ${fmtBytes(storage.quota)} available.`
              : 'Everything lives in this browser only.'
          }
        >
          <SettingRow label="Export backup" hint="Download a .tala archive you can re-import anywhere">
            <Button variant="outline" size="sm" onClick={() => void downloadBackup()}>
              <Download className="size-4" />
              Export .tala
            </Button>
          </SettingRow>

          <SettingRow
            label="Last backup"
            hint="Counted on this device. Tala reminds you weekly unless Quiet mode is on."
          >
            <span className="text-sm text-muted">{lastBackupAt ? formatRelative(lastBackupAt) : 'Never'}</span>
          </SettingRow>

          <SettingRow
            label="Storage protection"
            hint={
              persisted
                ? 'Your browser keeps this data when space runs low.'
                : 'Your browser may clear this data when space runs low. Back up regularly.'
            }
          >
            {!env.standalone && (env.platform === 'ios' || env.platform === 'android') ? (
              <Button variant="outline" size="sm" onClick={() => openModal({ kind: 'install-guide' })}>
                Add to Home Screen
              </Button>
            ) : (
              <span className="text-sm text-muted">{persisted ? 'Protected' : 'Not protected'}</span>
            )}
          </SettingRow>

          <SettingRow label="Import backup" hint="Merge into your library or replace everything">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Import className="size-4" />
              Choose file…
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json,.tala"
              className="hidden"
              onChange={(e) => void onFileChosen(e)}
            />
          </SettingRow>

          {pendingName && (
            <div className="rounded-card border border-accent/50 bg-accent-soft/50 p-3">
              <p className="text-[13px] font-medium text-accent">
                  Ready to restore <span className="font-mono">{pendingName}</span>
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => void applyPending('merge')}>
                  Merge into library
                </Button>
                <Button variant="danger-outline" size="sm" onClick={() => void applyPending('replace')}>
                  Replace everything
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    pendingRef.current = null
                    setPendingName(null)
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          <SettingRow
            label="Clear all data"
            hint="Erase every note, folder and tag from this browser"
          >
            <Button variant="danger-outline" size="sm" onClick={confirmClearAll}>
              <Trash2 className="size-4" />
              Clear…
            </Button>
          </SettingRow>

          <SettingRow
            label="Re-run setup wizard"
            hint="Replays the welcome flow. Your notes and profile are kept."
          >
            <Button variant="outline" size="sm" onClick={confirmResetSetup}>
              <RotateCcw className="size-4" />
              Re-run…
            </Button>
          </SettingRow>
        </Section>

        {/* About */}
        <section className="relative -rotate-[0.5deg] rounded-card border border-lineSoft bg-selected p-5 text-center text-selected-ink shadow-rest sm:p-5">
          <p className="font-bold tracking-[-0.02em] text-xl">Tala</p>
          <p className="mt-0.5 text-xs text-selected-ink/60">Version 1.0.1 · Offline-first notes</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-selected-ink/70">
            Your notes are stored locally in your browser&rsquo;s IndexedDB. Nothing is uploaded,
            synced or shared — export a backup regularly to keep it safe.
          </p>
          <p className="mt-2 text-xs italic text-selected-ink/50">Isulat mo. Itala mo.</p>
        </section>
      </div>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  [`${MOD} N / Alt N`, 'New note'],
  [`${MOD} K`, 'Search notes'],
  [`${MOD} ⇧ F`, 'Search notes (alt)'],
  [`${MOD} ⇧ P`, 'Command palette'],
  [`${MOD} S`, 'Force save'],
  [`${MOD} ⇧ D`, 'Toggle dark mode'],
  [`${MOD} ,`, 'Open settings'],
  ['/', 'Search in list'],
  ['Esc', 'Close / go back'],
]
