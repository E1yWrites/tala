import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { addDays } from '@/entries/dates'
import { formatDay } from '@/entries/parse'
import type { EntryRef } from '@/entries/scan'
import { ISIP } from '@/isip/copy'
import { deleteEntries, editEntry, restoreEntries } from '@/library/isip'
import { chipLabel } from '@/library/workouts'
import { useIsipStore } from '@/store/isipStore'
import { useUIStore } from '@/store/uiStore'
import type { IsipEntry } from '@/types/models'
import { useEntries } from '@/components/Agenda/useAgenda'
import { CARD, PlannerSection } from '@/components/Planner/PlannerView'
import { cn } from '@/utils/cn'

const ARROW =
  'grid size-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-raise hover:text-ink [@media(pointer:coarse)]:size-11'
const FIELD = 'h-9 min-w-0 rounded-control border border-lineSoft bg-canvas px-2.5 text-sm text-ink [@media(pointer:coarse)]:h-11'

/** The Entries written for one day (today, or another picked with ‹ ›), each with what it reads as. Edit in place; delete with Undo. */
export function DayEntries(): React.ReactNode {
  const { refs, today } = useEntries()
  const entries = useIsipStore((s) => s.entries)
  const pending = useUIStore((s) => s.pendingEntryId)
  const clearPending = useUIStore((s) => s.clearPendingEntry)
  const [day, setDay] = useState(today)
  const [editing, setEditing] = useState<string | null>(null)

  // Money, Workouts and the Agenda open an Entry here
  useEffect(() => {
    if (!pending) return
    const e = entries.find((x) => x.id === pending)
    if (e) {
      setDay(e.day)
      setEditing(e.id)
    }
    clearPending()
  }, [pending, entries, clearPending])

  const readings = useMemo(() => {
    const byEntry = new Map<string, EntryRef[]>()
    for (const r of refs) if (r.isip) byEntry.set(r.isip, [...(byEntry.get(r.isip) ?? []), r])
    return byEntry
  }, [refs])
  const list = entries.filter((e) => e.day === day)
  const go = (d: string): void => {
    setDay(d)
    setEditing(null)
  }

  return (
    <PlannerSection
      id="home-entries"
      title={`${ISIP.day.title} · ${formatDay(day)}`}
      action={day !== today ? { label: ISIP.day.today, onClick: () => go(today) } : undefined}
    >
      <div className="mb-2 flex items-center gap-1">
        <button type="button" onClick={() => go(addDays(day, -1))} aria-label={ISIP.day.prev} className={ARROW}>
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <input type="date" value={day} onChange={(e) => e.target.value && go(e.target.value)} aria-label={ISIP.day.pick} className={cn(FIELD, 'tabular-nums')} />
        <button type="button" onClick={() => go(addDays(day, 1))} aria-label={ISIP.day.next} className={ARROW}>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
      </div>
      {list.length > 0 ? (
        <ul className={CARD}>
          {list.map((e) =>
            editing === e.id ? (
              <EntryForm
                key={e.id}
                entry={e}
                onDone={(moved) => {
                  setEditing(null)
                  if (moved) setDay(moved)
                }}
              />
            ) : (
              <EntryRow key={e.id} entry={e} readings={readings.get(e.id) ?? []} onEdit={() => setEditing(e.id)} />
            ),
          )}
        </ul>
      ) : (
        <p className="rounded-card border border-dashed border-lineSoft px-4 py-3 text-sm text-muted">
          {day === today ? ISIP.day.emptyToday : ISIP.day.empty}
        </p>
      )}
    </PlannerSection>
  )
}

function EntryRow({ entry, readings, onEdit }: { entry: IsipEntry; readings: EntryRef[]; onEdit: () => void }): React.ReactNode {
  return (
    <li className="border-b border-lineSoft last:border-b-0">
      <button
        type="button"
        onClick={onEdit}
        aria-label={ISIP.entry.edit(entry.text)}
        className="flex min-h-12 w-full flex-wrap items-center gap-x-2 gap-y-1 px-3.5 py-2.5 text-left hover:bg-raise"
      >
        <span className="min-w-0 break-words text-[14px] leading-snug">{entry.text}</span>
        {readings.map((r, i) => {
          const label = chipLabel(r.entry)
          return label ? (
            <span key={i} className={`entry-chip entry-chip-${r.entry.kind} !ml-0`}>
              {label}
            </span>
          ) : null
        })}
      </button>
    </li>
  )
}

/** Edits an Entry's line and day. An emptied line is deleted (with Undo). `onDone` gets the new day when it moved. */
function EntryForm({ entry, onDone }: { entry: IsipEntry; onDone: (movedTo?: string) => void }): React.ReactNode {
  const [text, setText] = useState(entry.text)
  const [day, setDay] = useState(entry.day)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => input.current?.focus(), [])

  const remove = (): void => {
    const gone = deleteEntries([entry.id])
    toast(ISIP.entry.deleted, { action: { label: ISIP.undo, onClick: () => restoreEntries(gone) } })
    onDone()
  }

  return (
    <li className="border-b border-lineSoft bg-raise/40 last:border-b-0">
      <form
        className="flex flex-col gap-2 px-3.5 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!text.trim()) return remove()
          editEntry(entry.id, { text, day })
          onDone(day !== entry.day ? day : undefined)
        }}
        onKeyDown={(e) => {
          if (e.key !== 'Escape') return
          e.stopPropagation()
          onDone()
        }}
      >
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} aria-label={ISIP.entry.text} autoComplete="off" className={cn(FIELD, 'w-full')} />
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label={ISIP.entry.day} required className={cn(FIELD, 'tabular-nums')} />
          <button type="button" onClick={remove} className="min-h-9 px-1 text-xs font-medium text-danger hover:underline [@media(pointer:coarse)]:min-h-11">
            {ISIP.entry.delete}
          </button>
          <button type="button" onClick={() => onDone()} className="ml-auto min-h-9 px-2 text-xs font-medium text-muted hover:text-ink [@media(pointer:coarse)]:min-h-11">
            {ISIP.entry.cancel}
          </button>
          <button type="submit" className="min-h-9 rounded-control bg-accent px-3 text-xs font-semibold text-accent-fg [@media(pointer:coarse)]:min-h-11">
            {ISIP.entry.save}
          </button>
        </div>
      </form>
    </li>
  )
}
