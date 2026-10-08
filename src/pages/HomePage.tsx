import { useMemo } from 'react'
import { Search } from 'lucide-react'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { listTasks, toggleTask } from '@/library/tasks'
import { displayTitle } from '@/utils/noteFilters'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { timeOfDayGreeting } from '@/utils/dates'
import { useTick } from '@/hooks/useTick'
import { Bituin } from '@/coach/Bituin'
import { BituinNudge } from '@/coach/BituinNudge'
import { BITUIN } from '@/coach/copy'
import { SidebarToggle } from '@/components/layout/SidebarToggle'
import { QuickCapture } from '@/components/QuickCapture'

/**
 * Home: a greeting from Bituin, a line for today's journal, any nudge and the tasks still open. The rail
 * shows the week; the editor pane beside it shows the notes to pick up again.
 */
export function HomePage(): React.ReactNode {
  useTick(60_000) // keep greeting + relative times fresh
  const hasNotes = useNoteStore((s) => s.notes.some((n) => !n.isDeleted && !n.isArchived))
  const openModal = useUIStore((s) => s.openModal)
  const firstName = useSettingsStore((s) => s.settings.profile.name.split(/\s+/)[0] ?? '')

  return (
    <section aria-label="Home" className="h-full overflow-y-auto bg-shelf">
      <div className="px-3 pt-4 empty:hidden">
        <SidebarToggle />
      </div>
      <div className="mx-auto flex max-w-[560px] flex-col gap-6 px-5 py-8 animate-slide-up">
        <header className="flex items-center gap-3">
          <Bituin size={48} motion="wave" blink />
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.025em]">
              {timeOfDayGreeting()}
              {firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-sm text-muted">{BITUIN.home.line}</p>
          </div>
          <button
            type="button"
            onClick={() => openModal({ kind: 'search' })}
            aria-label="Search notes"
            className="grid size-10 shrink-0 place-items-center rounded-control border border-lineSoft bg-panel text-muted transition-colors hover:border-line hover:text-ink [@media(pointer:coarse)]:size-11"
          >
            <Search size={17} />
          </button>
        </header>

        <QuickCapture />

        <BituinNudge placement="card" className="" />

        {hasNotes && <OpenTasks />}
      </div>
    </section>
  )
}

/** The first unticked tasks across notes: tick them here or jump to the note. */
function OpenTasks(): React.ReactNode {
  const notes = useNoteStore((s) => s.notes)
  const pagesByNote = usePageStore((s) => s.pagesByNote)
  const selectNote = useUIStore((s) => s.selectNote)
  const setView = useUIStore((s) => s.setView)
  const open = useMemo(() => listTasks(notes, pagesByNote).filter((t) => !t.checked), [notes, pagesByNote])
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  if (open.length === 0) return null
  return (
    <section aria-labelledby="home-tasks">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 id="home-tasks" className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
          Still to do
        </h2>
        <button type="button" onClick={() => setView({ kind: 'tasks' })} className="text-xs font-medium text-accent hover:underline">
          All {open.length} tasks
        </button>
      </div>
      <ul className="overflow-hidden rounded-card border border-lineSoft bg-panel">
        {open.slice(0, 5).map((t) => (
          <li key={`${t.pageId}:${t.path.join('.')}`} className="flex items-start gap-3 border-b border-lineSoft px-3.5 py-2.5 last:border-b-0">
            <button
              type="button"
              onClick={() => void toggleTask(t)}
              aria-label={`Tick “${t.text}”`}
              className="mt-0.5 size-[18px] shrink-0 rounded-[5px] border-[1.5px] border-line transition-colors hover:border-ink"
            />
            <button type="button" onClick={() => selectNote(t.noteId)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[14px]">{t.text || 'Untitled task'}</span>
              <span className="block truncate text-xs text-faint">{displayTitle(byId.get(t.noteId)!)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
