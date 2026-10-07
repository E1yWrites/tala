import { useMemo, useState } from 'react'
import { Check, CheckSquare, ChevronRight } from 'lucide-react'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { useUIStore } from '@/store/uiStore'
import { listTasks, toggleTask, type TaskRef } from '@/library/tasks'
import { displayTitle } from '@/utils/noteFilters'
import { cn } from '@/utils/cn'
import { EmptyState } from '@/components/UI/EmptyState'
import { SidebarToggle } from '@/components/layout/SidebarToggle'

/** Every checklist item in the Library, grouped by note. Tick here or open the page it lives on. */
export function TasksPage(): React.ReactNode {
  const notes = useNoteStore((s) => s.notes)
  const pagesByNote = usePageStore((s) => s.pagesByNote)
  const selectNote = useUIStore((s) => s.selectNote)
  const [showDone, setShowDone] = useState(false)

  const tasks = useMemo(() => listTasks(notes, pagesByNote), [notes, pagesByNote])
  const open = tasks.filter((t) => !t.checked)
  const done = tasks.filter((t) => t.checked)

  const noteById = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  const groups = (list: TaskRef[]): Array<[string, TaskRef[]]> => {
    const byNote = new Map<string, TaskRef[]>()
    for (const t of list) byNote.set(t.noteId, [...(byNote.get(t.noteId) ?? []), t])
    return [...byNote].sort(
      ([a], [b]) => (noteById.get(b)?.updatedAt ?? 0) - (noteById.get(a)?.updatedAt ?? 0),
    )
  }

  return (
    <section aria-label="Tasks" className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <SidebarToggle className="-ml-1" />
        <div className="min-w-0">
          <h1 className="font-bold tracking-[-0.02em] text-xl leading-snug">Tasks</h1>
          <p className="text-xs text-faint">
            {tasks.length === 0 ? 'Checklists from all your notes' : `${open.length} open · ${done.length} done`}
          </p>
        </div>
      </header>

      {tasks.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="No tasks yet"
          description={'Start a checklist in any note by typing "[ ] " at the start of a line.'}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-24">
          {open.length === 0 && (
            <p className="px-3 py-6 text-center text-sm text-muted">Everything is ticked off. Nice work.</p>
          )}
          {groups(open).map(([noteId, refs]) => (
            <TaskGroup key={noteId} title={displayTitle(noteById.get(noteId)!)} refs={refs} onOpen={selectNote} />
          ))}

          {done.length > 0 && (
            <div className="mt-3 px-1">
              <button
                type="button"
                onClick={() => setShowDone((v) => !v)}
                aria-expanded={showDone}
                className="flex min-h-10 w-full items-center gap-1.5 rounded-control px-2 text-sm text-muted hover:bg-raise hover:text-ink"
              >
                <ChevronRight size={14} className={cn('transition-transform', showDone && 'rotate-90')} aria-hidden="true" />
                Done ({done.length})
              </button>
              {showDone &&
                groups(done).map(([noteId, refs]) => (
                  <TaskGroup key={noteId} title={displayTitle(noteById.get(noteId)!)} refs={refs} onOpen={selectNote} />
                ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function TaskGroup({
  title,
  refs,
  onOpen,
}: {
  title: string
  refs: TaskRef[]
  onOpen: (noteId: string, pageId: string) => void
}): React.ReactNode {
  return (
    <div className="mt-3 rounded-card border border-lineSoft bg-panel py-1">
      <p className="truncate px-3 pb-1 pt-2 text-xs font-medium text-muted">{title}</p>
      <ul>
        {refs.map((ref) => (
          <li key={`${ref.pageId}:${ref.path.join('.')}`} className="flex items-stretch">
            <button
              type="button"
              role="checkbox"
              aria-checked={ref.checked}
              aria-label={`${ref.checked ? 'Mark not done' : 'Mark done'}: ${ref.text || 'Untitled task'}`}
              onClick={() => void toggleTask(ref)}
              className="grid min-h-11 w-11 shrink-0 place-items-center"
            >
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-md border-[1.5px] transition-colors',
                  ref.checked ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-panel',
                )}
              >
                {ref.checked && <Check size={13} strokeWidth={3} aria-hidden="true" />}
              </span>
            </button>
            <button
              type="button"
              onClick={() => onOpen(ref.noteId, ref.pageId)}
              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-control pr-3 text-left hover:bg-raise"
            >
              <span className={cn('min-w-0 flex-1 text-[14px] leading-snug', ref.checked && 'text-faint line-through')}>
                {ref.text || 'Untitled task'}
              </span>
              {ref.pageNumber > 1 && <span className="shrink-0 text-2xs text-faint">p.{ref.pageNumber}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
