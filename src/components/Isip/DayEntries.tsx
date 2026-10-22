import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'
import { CATEGORIES, categoryLabel } from '@/entries/categories'
import { addDays } from '@/entries/dates'
import { formatDay } from '@/entries/parse'
import { ISIP } from '@/isip/copy'
import { read } from '@/isip/read'
import type { Reading } from '@/isip/read'
import { decide, deleteEntries, editEntry, restoreEntries, setAlias } from '@/library/isip'
import { setCategory } from '@/library/money'
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
export function DayEntries({ day, onDay: setDay }: { day: string; onDay: (day: string) => void }): React.ReactNode {
  // Re-renders when the words that decide a reading change (accounts, corrections)
  const { today } = useEntries()
  const entries = useIsipStore((s) => s.entries)
  const pending = useUIStore((s) => s.pendingEntryId)
  const clearPending = useUIStore((s) => s.clearPendingEntry)
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
  }, [pending, entries, clearPending, setDay])

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
              <EntryRow key={e.id} entry={e} onEdit={() => setEditing(e.id)} />
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

/** An Entry and what Isip read in it, each Reading a chip: counted ones can be undone, unsure ones confirmed or dismissed. */
function EntryRow({ entry, onEdit }: { entry: IsipEntry; onEdit: () => void }): React.ReactNode {
  const [fixing, setFixing] = useState<number | null>(null)
  const readings = read(entry).filter((r) => chipLabel(r.entry))
  const fix = fixing === null ? undefined : readings[fixing]
  return (
    <li className="border-b border-lineSoft last:border-b-0">
      <button
        type="button"
        onClick={onEdit}
        aria-label={ISIP.entry.edit(entry.text)}
        className="block min-h-11 w-full break-words px-3.5 pb-1 pt-2.5 text-left text-[14px] leading-snug hover:bg-raise"
      >
        {entry.text}
      </button>
      {readings.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3.5 pb-2.5">
          {readings.map((r, i) => (
            <ReadingChip key={i} id={entry.id} span={entry.text.slice(...r.span)} reading={r} onFix={() => setFixing(fixing === i ? null : i)} />
          ))}
        </div>
      )}
      {fix && <FixForm reading={fix} onDone={() => setFixing(null)} />}
    </li>
  )
}

const CHIP_BTN = 'inline-flex min-h-7 items-center rounded-full px-2 hover:bg-ink/10 [@media(pointer:coarse)]:min-h-11'

function ReadingChip({ id, span, reading: r, onFix }: { id: string; span: string; reading: Reading; onFix: () => void }): React.ReactNode {
  const label = chipLabel(r.entry)
  const fixable = r.key && (r.entry.kind === 'money' || r.entry.kind === 'lift') && r.status !== 'dismissed'
  const cls = cn(`entry-chip entry-chip-${r.entry.kind} !m-0 inline-flex items-center !p-0 !text-[11px]`, r.status === 'suggested' && 'entry-chip-suggested', r.status === 'dismissed' && 'entry-chip-dismissed')
  if (r.status === 'dismissed') {
    return (
      <span className={cls}>
        <button type="button" onClick={() => decide(id, span, null)} aria-label={ISIP.reading.restore(label)} className={CHIP_BTN}>
          {label}
        </button>
      </span>
    )
  }
  return (
    <span className={cls}>
      {fixable ? (
        <button type="button" onClick={onFix} aria-label={ISIP.reading.fix(label)} className={CHIP_BTN}>
          {label}
        </button>
      ) : (
        <span className="px-2">{label}</span>
      )}
      {r.status === 'suggested' && (
        <button type="button" onClick={() => decide(id, span, 'confirmed')} aria-label={ISIP.reading.confirmLabel(label)} className={cn(CHIP_BTN, 'font-semibold text-accent-strong')}>
          {ISIP.reading.confirm}
        </button>
      )}
      <button type="button" onClick={() => decide(id, span, 'dismissed')} aria-label={ISIP.reading.dismiss(label)} className={cn(CHIP_BTN, 'px-1.5')}>
        <X size={12} aria-hidden="true" />
      </button>
    </span>
  )
}

/** Corrects how Isip reads a word from now on: a category (by place or first word), a place's or an exercise's name. Never edits the line. */
function FixForm({ reading: r, onDone }: { reading: Reading; onDone: () => void }): React.ReactNode {
  const e = r.entry
  const key = r.key!
  const [category, setCat] = useState(e.kind === 'money' ? (e.category ?? '') : '')
  const [name, setName] = useState(e.kind === 'money' ? (e.merchant ?? '') : e.kind === 'lift' ? e.name : '')
  return (
    <form
      className="flex flex-col gap-2 border-t border-lineSoft bg-raise/40 px-3.5 py-3"
      onSubmit={(ev) => {
        ev.preventDefault()
        if (e.kind === 'money') {
          if (category && category !== e.category) setCategory(key, category)
          if (e.merchant && name.trim() && name.trim() !== e.merchant) setAlias('merchant', key, name)
        } else if (e.kind === 'lift' && name.trim() && name.trim() !== e.name) setAlias('exercise', key, name)
        onDone()
      }}
      onKeyDown={(ev) => {
        if (ev.key !== 'Escape') return
        ev.stopPropagation()
        onDone()
      }}
    >
      {e.kind === 'money' && (
        <select value={category} onChange={(ev) => setCat(ev.target.value)} aria-label={ISIP.reading.category} className={cn(FIELD, 'w-full')}>
          {!e.category && <option value="">{ISIP.reading.pick}</option>}
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {categoryLabel(c)}
            </option>
          ))}
        </select>
      )}
      {(e.kind === 'lift' || (e.kind === 'money' && e.merchant)) && (
        <input
          value={name}
          onChange={(ev) => setName(ev.target.value)}
          aria-label={e.kind === 'lift' ? ISIP.reading.exercise : ISIP.reading.merchant}
          autoComplete="off"
          className={cn(FIELD, 'w-full')}
        />
      )}
      <p className="text-xs text-faint">{ISIP.reading.from(key)}</p>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onDone} className="min-h-9 px-2 text-xs font-medium text-muted hover:text-ink [@media(pointer:coarse)]:min-h-11">
          {ISIP.reading.cancel}
        </button>
        <button type="submit" className="min-h-9 rounded-control bg-accent px-3 text-xs font-semibold text-accent-fg [@media(pointer:coarse)]:min-h-11">
          {ISIP.reading.save}
        </button>
      </div>
    </form>
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
