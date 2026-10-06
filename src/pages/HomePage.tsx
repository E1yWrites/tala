import { useMemo } from 'react'
import { Plus, Search, Folder as FolderIcon } from 'lucide-react'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { displayTitle } from '@/utils/noteFilters'
import { pagesText, textPreview } from '@/utils/doc'
import { formatRelative, timeOfDayGreeting } from '@/utils/dates'
import { useTick } from '@/hooks/useTick'
import { Bituin } from '@/coach/Bituin'
import { BituinNudge } from '@/coach/BituinNudge'
import { BITUIN } from '@/coach/copy'
import { Button } from '@/components/UI/Button'

/** Home: a greeting from Bituin, the quick actions, and the notes to pick up again. */
export function HomePage(): React.ReactNode {
  useTick(60_000) // keep greeting + relative times fresh

  const notes = useNoteStore((s) => s.notes)
  const pagesByNote = usePageStore((s) => s.pagesByNote)
  const openModal = useUIStore((s) => s.openModal)
  const firstName = useSettingsStore((s) => s.settings.profile.name.split(/\s+/)[0] ?? '')

  const recent = useMemo(
    () =>
      notes
        .filter((n) => !n.isDeleted && !n.isArchived)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 6),
    [notes],
  )

  return (
    <section aria-label="Home" className="h-full overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-5 py-8 animate-slide-up">
        <header className="flex items-center gap-3">
          <Bituin size={64} motion="wave" blink />
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-tight">
              {timeOfDayGreeting()}
              {firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="font-hand text-[18px] leading-tight text-muted">{BITUIN.home.line}</p>
          </div>
        </header>

        <BituinNudge placement="card" className="" />

        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => openModal({ kind: 'new-note' })}>
            <Plus size={16} />
            New note
          </Button>
          <Button onClick={() => openModal({ kind: 'search' })}>
            <Search size={16} />
            Search
          </Button>
          <Button variant="ghost" onClick={() => openModal({ kind: 'folder-editor' })}>
            <FolderIcon size={16} />
            New folder
          </Button>
        </div>

        {recent.length === 0 ? (
          <div className="rounded-card border border-lineSoft bg-panel px-6 py-8 text-center">
            <p className="font-display text-xl">{BITUIN.empty.notes.title}</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted">{BITUIN.empty.notes.body}</p>
          </div>
        ) : (
          <div>
            <h2 className="mb-1 px-1 text-[13px] font-medium text-muted">Pick up where you left off</h2>
            <ul className="flex flex-col">
              {recent.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => openNote(note.id)}
                    className="group flex min-h-14 w-full items-center gap-3 rounded-card px-3 py-2 text-left transition-colors hover:bg-panel"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium">{displayTitle(note)}</p>
                      <p className="truncate text-[13px] text-faint">
                        {textPreview(pagesText(pagesByNote[note.id] ?? []), 80) || 'Empty note'}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs tabular-nums text-faint">{formatRelative(note.updatedAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

function openNote(id: string): void {
  const ui = useUIStore.getState()
  ui.setView({ kind: 'all' })
  ui.selectNote(id)
}
