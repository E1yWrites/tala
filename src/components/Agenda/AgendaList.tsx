import { Bell, Check, Repeat2 } from 'lucide-react'
import type { Occurrence } from '@/entries/agenda'
import { formatDay, formatPeso, formatTime } from '@/entries/parse'
import { markDone, skipOccurrence } from '@/library/agenda'
import { toggleTask } from '@/library/tasks'
import { useNoteStore } from '@/store/noteStore'
import { useUIStore } from '@/store/uiStore'
import { displayTitle } from '@/utils/noteFilters'
import { cn } from '@/utils/cn'

/**
 * Rows of the Agenda: a time (or a checkbox for a task, a Done for a due-again
 * item), what it is, and where it was written. Tapping opens that page.
 */
export function AgendaList({ items, canSkip = false }: { items: Occurrence[]; canSkip?: boolean }): React.ReactNode {
  return (
    <ul className="overflow-hidden rounded-card border border-lineSoft bg-panel">
      {items.map((o) => (
        <AgendaRow key={o.key} o={o} canSkip={canSkip} />
      ))}
    </ul>
  )
}

function AgendaRow({ o, canSkip }: { o: Occurrence; canSkip: boolean }): React.ReactNode {
  const note = useNoteStore((s) => s.notes.find((n) => n.id === o.ref.noteId))
  const selectNote = useUIStore((s) => s.selectNote)
  const title = o.title || (o.kind === 'task' ? 'Untitled task' : 'Untitled')
  const late = o.overdue !== undefined
  const status = late
    ? o.overdue === 0
      ? 'due today'
      : `${o.overdue} day${o.overdue === 1 ? '' : 's'} overdue`
    : o.kind === 'again'
      ? `due ${formatDay(o.day)}`
      : ''
  // Where it was written, unless that's the journal (most lines are)
  const source = note && !note.journal ? displayTitle(note) : ''
  const income = o.ref.entry.kind === 'event' && o.ref.entry.income
  const meta = [status, o.end ? `until ${formatTime(o.end)}` : '', o.amount ? `${income ? '+' : ''}${formatPeso(o.amount)}` : '', source].filter(Boolean)

  return (
    <li className="flex items-stretch border-b border-lineSoft last:border-b-0">
      {o.kind === 'task' && !o.ref.ink ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={false}
          aria-label={`Mark done: ${title}`}
          onClick={() => void toggleTask({ ...o.ref, checked: false })}
          className="grid min-h-12 w-12 shrink-0 place-items-center"
        >
          <span className="size-5 rounded-md border-[1.5px] border-line bg-panel transition-colors hover:border-ink" />
        </button>
      ) : o.kind === 'again' ? (
        <button
          type="button"
          onClick={() => markDone(o.title)}
          aria-label={`Done today: ${title}`}
          title="Done today"
          className="grid min-h-12 w-12 shrink-0 place-items-center text-muted hover:text-accent"
        >
          <span className="grid size-6 place-items-center rounded-full border-[1.5px] border-current">
            <Check size={13} strokeWidth={2.6} aria-hidden="true" />
          </span>
        </button>
      ) : (
        <span className="flex w-12 shrink-0 justify-end pr-2 pt-3.5 text-xs font-semibold tabular-nums text-muted">
          {o.time ? formatTime(o.time) : ''}
        </span>
      )}
      <button
        type="button"
        onClick={() => selectNote(o.ref.noteId, o.ref.pageId)}
        className="min-w-0 flex-1 py-2.5 pr-3 text-left hover:bg-raise"
      >
        <span className="flex items-center gap-1.5">
          {(o.kind === 'task' || o.kind === 'again') && o.time && (
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{formatTime(o.time)}</span>
          )}
          <span className="truncate text-[14px] leading-snug">{title}</span>
          {o.repeats && o.kind === 'event' && <Repeat2 size={13} className="shrink-0 text-faint" aria-label="repeats" />}
          {o.remind !== undefined && <Bell size={12} className="shrink-0 text-faint" aria-label="reminder set" />}
        </span>
        {meta.length > 0 && (
          <span className={cn('mt-0.5 block truncate text-xs text-faint', late && o.overdue! > 0 && 'text-danger')}>{meta.join(' · ')}</span>
        )}
      </button>
      {canSkip && o.repeats && o.kind === 'event' && (
        <button
          type="button"
          onClick={() => void skipOccurrence(o.ref, o.day)}
          className="shrink-0 px-3 text-xs font-medium text-muted hover:text-ink"
          aria-label={`Skip ${title} on this day`}
        >
          Skip
        </button>
      )}
    </li>
  )
}
