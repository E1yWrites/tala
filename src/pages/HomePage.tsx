import { useMemo } from 'react'
import { CheckSquare, Folder as FolderIcon, NotebookText, Plus, Search, Star, Clock } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNoteStore } from '@/store/noteStore'
import { useFolderStore } from '@/store/folderStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { displayTitle } from '@/utils/noteFilters'
import { docPreview, countTasks } from '@/utils/doc'
import { describeDocument } from '@/utils/documentPreview'
import { formatRelative, timeOfDayGreeting } from '@/utils/dates'
import { useTick } from '@/hooks/useTick'
import { Button } from '@/components/UI/Button'
import { cn } from '@/utils/cn'

/** Tiny per-card tilt keeps the sketchbook feel without looking messy. */
const STAT_TILTS = ['-rotate-[0.35deg]', 'rotate-[0.3deg]', '-rotate-[0.25deg]', 'rotate-[0.35deg]']

function StatCard({
  icon: Icon,
  value,
  label,
  index = 0,
}: {
  icon: LucideIcon
  value: number
  label: string
  index?: number
}): React.ReactNode {
  return (
    <div
      className={cn(
        'group rounded-wobbly-sm border border-lineSoft bg-panel px-3 py-2 outline-none',
        'transition-[transform,border-color,background-color] duration-150 ease-out',
        'hover:-translate-y-0.5 hover:rotate-0 hover:border-accent/60 hover:bg-canvas',
        STAT_TILTS[index % STAT_TILTS.length],
      )}
    >
      <div className="flex items-center gap-1.5 text-muted">
        <Icon size={18} strokeWidth={2.5} aria-hidden="true" />
        <span className="whitespace-nowrap text-2xs tracking-wide">{label}</span>
      </div>
      <p
        className={cn(
          'mt-1 font-display text-2xl leading-none tabular-nums transition-colors duration-150',
          'text-ink group-hover:text-accent',
        )}
      >
        {value}
      </p>
    </div>
  )
}

/** Home / dashboard screen. */
export function HomePage(): React.ReactNode {
  useTick(60_000) // keep greeting + relative times fresh

  const notes = useNoteStore((s) => s.notes)
  const documents = useNoteStore((s) => s.documents)
  const folderCount = useFolderStore((s) => s.folders.length)
  const openModal = useUIStore((s) => s.openModal)
  const firstName = useSettingsStore(
    (s) => s.settings.profile.name.split(/\s+/)[0] ?? '',
  )

  const stats = useMemo(() => {
    const live = notes.filter((n) => !n.isDeleted && !n.isArchived)
    let tasksDone = 0
    for (const n of live) tasksDone += countTasks(n.content).completed
    return {
      notes: live.length,
      favorites: live.filter((n) => n.isFavorite).length,
      folders: folderCount,
      tasksDone,
      recent: [...live].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5),
    }
  }, [notes, folderCount])

  return (
    <section aria-label="Dashboard" className="relative h-full overflow-y-auto">
      {/* Decorative doodles — notebook margin feel */}
      <svg aria-hidden="true" className="pointer-events-none absolute right-4 top-8 size-8 rotate-12 text-accent/20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 2l2.4 7.4H22l-6 4.4 2.3 7.2L12 16.6 5.7 21l2.3-7.2-6-4.4h7.6z" /></svg>
      <svg aria-hidden="true" className="pointer-events-none absolute left-2 top-40 size-5 -rotate-6 text-lineSoft/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M5 12h14M12 5l7 7-7 7" /></svg>
      <svg aria-hidden="true" className="pointer-events-none absolute right-8 bottom-16 size-6 rotate-[-8deg] text-faint/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 16c2-3 6-3 8 0s6 3 8 0" /><circle cx="12" cy="8" r="4" /></svg>
      <div className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10 animate-slide-up">
        {/* Greeting */}
        <header>
          <p className="inline-block -rotate-1 text-base text-accent underline decoration-wavy decoration-accent/40 underline-offset-4">
            {timeOfDayGreeting()}
          </p>
          <h1 className="mt-1 font-display text-4xl leading-tight">
            {firstName ? `Hey, ${firstName}` : 'Hey there'}
            <span className="ml-0.5 inline-block animate-wiggle text-accent">!</span>
          </h1>
          <p className="mt-1 text-sm text-muted">What are you thinking about?</p>
        </header>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => openModal({ kind: 'new-note' })}>
            <Plus size={16} />
            New note
          </Button>
          <Button onClick={() => openModal({ kind: 'search' })}>
            <Search size={16} />
            Search notes
          </Button>
          <Button onClick={() => openModal({ kind: 'folder-editor' })}>
            <FolderIcon size={16} />
            New folder
          </Button>
        </div>

        {/* Stats — 2-up inside the narrow desktop pane; 4-up only when the
            dashboard spans the full viewport (phones ≥420px, <768px) */}
        <div
          aria-label="Dashboard statistics"
          className="grid grid-cols-2 gap-3 [@media(min-width:420px)_and_(max-width:767px)]:grid-cols-4"
        >
          <StatCard icon={NotebookText} value={stats.notes} label="Notes" index={0} />
          <StatCard icon={Star} value={stats.favorites} label="Favorites" index={1} />
          <StatCard icon={FolderIcon} value={stats.folders} label="Folders" index={2} />
          <StatCard icon={CheckSquare} value={stats.tasksDone} label="Tasks done" index={3} />
        </div>

        {/* Recently edited */}
        <div>
          <h2 className="mb-2 flex items-center gap-2 px-1 text-[13px] text-muted underline decoration-wavy decoration-lineSoft/70 underline-offset-4">
            <Clock size={16} strokeWidth={2.5} aria-hidden="true" />
            Recently edited
          </h2>
          {stats.recent.length === 0 ? (
            <div className="rounded-wobbly-md border-2 border-dashed border-lineSoft bg-panel/60 px-6 py-8 text-center">
              <NotebookText size={28} className="mx-auto -rotate-6 text-accent" aria-hidden="true" />
              <p className="mt-2 font-display text-lg">Nothing here yet</p>
              <p className="mt-0.5 text-sm text-muted">
                Your recent notes will show up here once you start writing.
              </p>
              <Button
                variant="primary"
                size="sm"
                className="mt-4"
                onClick={() => openModal({ kind: 'new-note' })}
              >
                <Plus size={15} />
                Start writing
              </Button>
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {stats.recent.map((note) => (
                <li key={note.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setViewAllAndSelect(note.id)
                    }}
                    className="group flex w-full items-center gap-3 rounded-wobbly-sm border border-transparent px-3 py-2.5 text-left transition-colors hover:border-lineSoft hover:bg-panel"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px]">{displayTitle(note)}</p>
                      <p className="truncate text-xs text-faint">
                        {docPreview(note.content, 80) || describeDocument(note.documentId ? documents[note.documentId] : undefined) || 'Empty note'}
                      </p>
                    </div>
                    <time className="shrink-0 text-xs tabular-nums text-faint">
                      {formatRelative(note.updatedAt)}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

function setViewAllAndSelect(id: string): void {
  const ui = useUIStore.getState()
  ui.setView({ kind: 'all' })
  ui.selectNote(id)
}
