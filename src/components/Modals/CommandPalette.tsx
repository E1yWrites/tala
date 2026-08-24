import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowLeftRight,
  Command,
  FileText,
  FolderPlus,
  Home,
  Import,
  Moon,
  Notebook,
  Pin,
  Settings,
  Bookmark,
  Sun,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { downloadBackup } from '@/utils/exportImport'
import { Modal } from '@/components/UI/Modal'
import { cn } from '@/utils/cn'

interface CommandEntry {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  run: () => void
}

/** Fuzzy subsequence match: returns score or -1. */
function fuzzyScore(query: string, target: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const t = target.toLowerCase()
  const direct = t.indexOf(q)
  if (direct >= 0) return 100 - direct // contiguous beats scattered
  let ti = 0
  let score = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return -1
    score += found === ti ? 2 : 1
    ti = found + 1
  }
  return score
}

export function CommandPalette(): React.ReactNode {
  const closeAllModals = useUIStore((s) => s.closeAllModals)
  const openModal = useUIStore((s) => s.openModal)
  const setView = useUIStore((s) => s.setView)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const toggleFocusMode = useUIStore((s) => s.toggleFocusMode)
  const theme = useSettingsStore((s) => s.settings.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  const commands = useMemo<CommandEntry[]>(
    () => [
      {
        id: 'new-note',
        label: 'New note',
        hint: 'Ctrl N',
        icon: FileText,
        run: () => {
          closeAllModals()
          openModal({ kind: 'new-note' })
        },
      },
      {
        id: 'search',
        label: 'Search notes',
        hint: 'Ctrl K',
        icon: Notebook,
        run: () => {
          closeAllModals()
          openModal({ kind: 'search' })
        },
      },
      { id: 'go-home', label: 'Go to Home', icon: Home, run: () => { closeAllModals(); setView({ kind: 'home' }) } },
      { id: 'go-all', label: 'Go to All Notes', icon: Notebook, run: () => { closeAllModals(); setView({ kind: 'all' }) } },
      { id: 'go-favorites', label: 'Go to Favorites', icon: Bookmark, run: () => { closeAllModals(); setView({ kind: 'favorites' }) } },
      { id: 'go-pinned', label: 'Go to Pinned', icon: Pin, run: () => { closeAllModals(); setView({ kind: 'pinned' }) } },
      { id: 'go-recent', label: 'Go to Recent', icon: ArrowLeftRight, run: () => { closeAllModals(); setView({ kind: 'recent' }) } },
      { id: 'go-archive', label: 'Go to Archive', icon: Archive, run: () => { closeAllModals(); setView({ kind: 'archive' }) } },
      { id: 'go-trash', label: 'Go to Trash', icon: Trash2, run: () => { closeAllModals(); setView({ kind: 'trash' }) } },
      { id: 'new-folder', label: 'New folder', icon: FolderPlus, run: () => { closeAllModals(); openModal({ kind: 'folder-editor' }) } },
      {
        id: 'toggle-theme',
        label: theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode',
        icon: theme === 'dark' ? Sun : Moon,
        run: () => {
          closeAllModals()
          setTheme(theme === 'dark' ? 'light' : 'dark')
        },
      },
      { id: 'focus-mode', label: 'Toggle distraction-free mode', icon: Moon, run: () => { closeAllModals(); toggleFocusMode() } },
      { id: 'toggle-sidebar', label: 'Toggle sidebar', icon: Notebook, run: () => { closeAllModals(); toggleSidebar() } },
      {
        id: 'export',
        label: 'Export backup (JSON)',
        icon: Import,
        run: () => {
          closeAllModals()
          void downloadBackup()
        },
      },
      { id: 'settings', label: 'Open Settings', icon: Settings, run: () => { closeAllModals(); setView({ kind: 'settings' }) } },
    ],
    [closeAllModals, openModal, setView, theme, setTheme, toggleFocusMode, toggleSidebar],
  )

  const filtered = useMemo(() => {
    return commands
      .map((c) => ({ c, score: fuzzyScore(query.trim(), c.label) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .map((x) => x.c)
  }, [commands, query])

  useEffect(() => setActiveIdx(0), [query])

  // Keep the active command visible while arrowing past the scrolled edge
  const activeId = filtered[activeIdx]?.id
  useEffect(() => {
    if (!activeId) return
    document.getElementById(`palette-cmd-${activeId}`)?.scrollIntoView({ block: 'nearest' })
  }, [activeId])

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (filtered.length > 0) setActiveIdx((i) => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (filtered.length > 0) setActiveIdx((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[activeIdx]?.run()
    }
  }

  return (
    <Modal
      title={null}
      onClose={() => closeAllModals()}
      size="md"
      onKeyDownCapture={onKeyDown}
      initialFocus={false}
    >
      <div className="flex items-center gap-2 border-b-2 border-line px-4">
        <Command className="size-4 shrink-0 text-faint" aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type a command…"
          aria-label="Command palette"
          role="combobox"
          aria-expanded
          aria-controls="palette-commands-list"
          aria-activedescendant={
            filtered[activeIdx] ? `palette-cmd-${filtered[activeIdx]!.id}` : undefined
          }
          autoComplete="off"
          spellCheck={false}
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-faint"
        />
      </div>

      <div id="palette-commands-list" className="max-h-[46vh] overflow-y-auto p-1.5" role="listbox" aria-label="Commands">
        {filtered.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted">No matching command</p>
        ) : (
          filtered.map((cmd, i) => (
            <button
              key={cmd.id}
              type="button"
              id={`palette-cmd-${cmd.id}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseMove={() => setActiveIdx(i)}
              onClick={cmd.run}
              className={cn(
                'flex w-full items-center gap-3 rounded-wobbly-sm px-2.5 py-2 text-left transition',
                i === activeIdx ? 'bg-postit text-postit-ink' : 'hover:bg-canvas',
              )}
            >
              <cmd.icon className="size-4 shrink-0 text-muted" aria-hidden="true" />
              <span className="flex-1 truncate text-[13px]">{cmd.label}</span>
              {cmd.hint && (
                <span className="shrink-0 font-mono text-[10px] text-faint">{cmd.hint}</span>
              )}
            </button>
          ))
        )}
      </div>
    </Modal>
  )
}
