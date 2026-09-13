import { useEffect, useRef, useState } from 'react'
import {
  ChevronLeft,
  Download,
  HardDrive,
  Import,
  Keyboard,
  Moon,
  Palette,
  RotateCcw,
  Settings2,
  SlidersHorizontal,
  Sun,
  SunMoon,
  Trash2,
  User,
} from 'lucide-react'
import { toast } from 'sonner'
import type { SortKey, ThemeMode, ViewDensity } from '@/types/models'
import { useSettingsStore } from '@/store/settingsStore'
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  useUIStore,
} from '@/store/uiStore'
import { useMediaQuery, BREAKPOINTS } from '@/hooks/useMediaQuery'
import { db } from '@/database/db'
import { downloadBackup, parseBackup, restoreBackup, type BackupFile } from '@/utils/exportImport'
import { downloadPackage } from '@/lib/package/download'
import { Button } from '@/components/UI/Button'
import { cn } from '@/utils/cn'
import { Avatar } from '@/components/UI/Avatar'

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
    <section className="rounded-wobbly-md border-2 border-line bg-panel p-4 shadow-sketch-sm sm:p-5">
      <header className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 -rotate-3 place-items-center rounded-full border-2 border-dashed border-line bg-canvas text-accent">
          <Icon className="size-5" strokeWidth={2.5} />
        </span>
        <div>
          <h2 className="font-display text-xl leading-snug">{title}</h2>
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
        <p className="text-xs font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-[11px] leading-snug text-faint">{hint}</p>}
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
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-wobbly-sm border-2 border-line bg-canvas p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-[6px_3px_7px_3px] px-3 py-1.5 text-xs transition-colors',
            value === opt.value ? 'bg-postit text-postit-ink' : 'text-muted hover:text-ink',
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
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: string
}): React.ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-6 w-10 rounded-full border-2 border-line transition-colors',
        checked ? 'bg-accent' : 'bg-canvas',
      )}
    >
      <span
        className={cn(
          'absolute top-[3px] left-[3px] size-4 rounded-full border border-line bg-panel transition-transform',
          checked && 'translate-x-4',
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
function SidebarWidthRow(): React.ReactNode {
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const setSidebarWidth = useUIStore((s) => s.setSidebarWidth)
  const commitSidebarWidth = useUIStore((s) => s.commitSidebarWidth)
  return (
    <SettingRow
      label="Sidebar width"
      hint={`${sidebarWidth}px · drag the handle or use this slider (${SIDEBAR_MIN_WIDTH}–${SIDEBAR_MAX_WIDTH})`}
    >
      <input
        type="range"
        min={SIDEBAR_MIN_WIDTH}
        max={SIDEBAR_MAX_WIDTH}
        step={4}
        value={sidebarWidth}
        onChange={(e) => setSidebarWidth(Number(e.target.value))}
        onPointerUp={commitSidebarWidth}
        onKeyUp={commitSidebarWidth}
        aria-label="Sidebar width"
        className="w-full accent-[rgb(var(--c-accent))]"
      />
    </SettingRow>
  )
}

/* -------------------------------- The page -------------------------------- */

export function SettingsPage(): React.ReactNode {
  const settings = useSettingsStore((s) => s.settings)
  const update = useSettingsStore((s) => s.update)
  const openModal = useUIStore((s) => s.openModal)
  const setView = useUIStore((s) => s.setView)
  const isDesktop = useMediaQuery(BREAKPOINTS.desktop)

  const [storage, setStorage] = useState<{ usage: number; quota: number } | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const pendingRef = useRef<BackupFile | null>(null)
  const [pendingName, setPendingName] = useState<string | null>(null)

  useEffect(() => {
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
      const backup = parseBackup(await file.text())
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
        // db.delete() blocks forever if another tab still holds the database —
        // race a timeout so we always reload instead of hanging the UI.
        const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, 6000))
        await Promise.race([db.delete().catch(() => undefined), timeout])
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
          <h1 className="font-display text-2xl">Settings</h1>
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
              className="h-9 w-full rounded-wobbly-md border-2 border-line bg-canvas px-2.5 font-body text-sm outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
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
              className="h-9 w-full rounded-wobbly-md border-2 border-line bg-canvas px-2.5 font-body text-sm outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
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
          {isDesktop && <SidebarWidthRow />}
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
              className="h-10 w-full rounded-wobbly-md border-2 border-line bg-canvas px-2.5 font-body text-sm outline-none transition focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </SettingRow>
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
          <SettingRow label="Export library" hint="A complete .zip package: notes, handwriting, imported documents and annotations">
            <Button variant="outline" size="sm" onClick={() => void downloadPackage({})}>
              <Download className="size-4" />
              Export .zip
            </Button>
          </SettingRow>

          <SettingRow label="Import package" hint="Restore a .zip library backup or add shared notes">
            <Button variant="outline" size="sm" onClick={() => openModal({ kind: 'import-package' })}>
              <Import className="size-4" />
              Choose .zip…
            </Button>
          </SettingRow>

          <SettingRow label="Export JSON (legacy)" hint="Text-only snapshot — imported PDF/Word/PowerPoint files are not included">
            <Button variant="outline" size="sm" onClick={() => void downloadBackup()}>
              <Download className="size-4" />
              Export JSON
            </Button>
          </SettingRow>

          <SettingRow label="Import JSON backup" hint="Merge into your library or replace everything">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Import className="size-4" />
              Choose file…
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => void onFileChosen(e)}
            />
          </SettingRow>

          {pendingName && (
            <div className="rounded-wobbly-md border-2 border-dashed border-accent/50 bg-accent-soft/50 p-3">
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
        <section className="relative -rotate-[0.5deg] rounded-wobbly-md border-2 border-line bg-postit p-5 text-center text-postit-ink shadow-sketch-sm sm:p-5">
          <span aria-hidden="true" className="tape absolute left-1/2 top-[-11px] h-[22px] w-24 -translate-x-1/2" />
          <p className="font-display text-xl">Tala</p>
          <p className="mt-0.5 text-xs text-postit-ink/60">Version 1.0.1 · Offline-first notes</p>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-relaxed text-postit-ink/70">
            Your notes are stored locally in your browser&rsquo;s IndexedDB. Nothing is uploaded,
            synced or shared — export a backup regularly to keep it safe.
          </p>
          <p className="mt-2 text-xs italic text-postit-ink/50">Isulat mo. Itala mo.</p>
        </section>
      </div>
    </div>
  )
}

const SHORTCUTS: [string, string][] = [
  ['Ctrl N / Alt N', 'New note'],
  ['Ctrl K', 'Search notes'],
  ['Ctrl ⇧ F', 'Search notes (alt)'],
  ['Ctrl ⇧ P', 'Command palette'],
  ['Ctrl S', 'Force save'],
  ['Ctrl ⇧ D', 'Toggle dark mode'],
  ['Ctrl ,', 'Open settings'],
  ['Ctrl .', 'Draw / type toggle'],
  ['1 · 2 · 3', 'Pen · pencil · highlighter (drawing)'],
  ['E / L', 'Eraser / lasso (drawing)'],
  ['[ / ]', 'Thinner / thicker stroke (drawing)'],
  ['Ctrl C · X · V · D', 'Copy · cut · paste · duplicate ink'],
  ['/', 'Search in list'],
  ['Esc', 'Close / go back'],
]
