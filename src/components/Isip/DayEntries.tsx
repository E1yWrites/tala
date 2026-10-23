import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { toast } from 'sonner'
import { CATEGORIES, categoryLabel } from '@/entries/categories'
import { addDays } from '@/entries/dates'
import { formatDay, formatTime } from '@/entries/parse'
import { ISIP } from '@/isip/copy'
import { read } from '@/isip/read'
import type { Reading } from '@/isip/read'
import { decide, deleteEntries, editEntry, restoreEntries, setAlias } from '@/library/isip'
import { setCategory } from '@/library/money'
import { chipLabel, liftHint } from '@/library/workouts'
import { useHabitStore } from '@/library/habits'
import { reply } from '@/isip/reply'
import { useIsipStore } from '@/store/isipStore'
import { useUIStore } from '@/store/uiStore'
import type { IsipEntry } from '@/types/models'
import { useEntries } from '@/components/Agenda/useAgenda'
import { Bituin } from '@/coach/Bituin'
import { cn } from '@/utils/cn'

const ARROW =
  'grid size-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-raise hover:text-ink [@media(pointer:coarse)]:size-11'
const FIELD = 'h-9 min-w-0 rounded-control border border-lineSoft bg-canvas px-2.5 text-sm text-ink [@media(pointer:coarse)]:h-11'

/**
 * The Entries written for one day (today, or another picked with ‹ ›), as a
 * thread: each line on the right, and under it Bituin saying what it read,
 * every Reading a chip. Tap a line to edit it in place; delete with Undo.
 */
export function DayEntries({ day, onDay: setDay }: { day: string; onDay: (day: string) => void }): React.ReactNode {
  // Re-renders when the words that decide a reading change (accounts, corrections)
  const { today } = useEntries()
  const entries = useIsipStore((s) => s.entries)
  const pending = useUIStore((s) => s.pendingEntryId)
  const clearPending = useUIStore((s) => s.clearPendingEntry)
  const [editing, setEditing] = useState<string | null>(null)
  // Lines written after Today opened arrive with a little motion; the rest just sit there
  const openedAt = useRef(Date.now())

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

  // A line just written scrolls into view above the box (not when the day changes)
  const thread = useRef<HTMLUListElement>(null)
  const seen = useRef({ day, n: list.length })
  useEffect(() => {
    const was = seen.current
    seen.current = { day, n: list.length }
    if (was.day !== day || list.length <= was.n) return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    thread.current?.lastElementChild?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }, [day, list.length])

  return (
    <section aria-labelledby="home-entries">
      <h2 id="home-entries" className="sr-only">
        {`${ISIP.day.title} · ${formatDay(day)}`}
      </h2>
      <div className="mb-4 flex items-center justify-center gap-1">
        <button type="button" onClick={() => go(addDays(day, -1))} aria-label={ISIP.day.prev} className={ARROW}>
          <ChevronLeft size={17} aria-hidden="true" />
        </button>
        <input
          type="date"
          value={day}
          onChange={(e) => e.target.value && go(e.target.value)}
          aria-label={ISIP.day.pick}
          className="h-8 rounded-full border border-lineSoft bg-panel px-3 text-xs font-semibold tabular-nums text-muted [@media(pointer:coarse)]:h-11"
        />
        <button type="button" onClick={() => go(addDays(day, 1))} aria-label={ISIP.day.next} className={ARROW}>
          <ChevronRight size={17} aria-hidden="true" />
        </button>
        {day !== today && (
          <button
            type="button"
            onClick={() => go(today)}
            className="ml-1 min-h-8 rounded-full px-3 text-xs font-semibold text-accent hover:bg-raise [@media(pointer:coarse)]:min-h-11"
          >
            {ISIP.day.today}
          </button>
        )}
      </div>
      {list.length > 0 ? (
        <ul ref={thread} className="flex flex-col gap-4">
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
              <EntryRow key={e.id} entry={e} day={list} fresh={e.createdAt >= openedAt.current} onEdit={() => setEditing(e.id)} />
            ),
          )}
        </ul>
      ) : (
        <Said>{day === today ? ISIP.day.emptyToday : ISIP.day.empty}</Said>
      )}
    </section>
  )
}

/** Bituin's bubble on the left of the thread. */
function Said({ children, className }: { children: React.ReactNode; className?: string }): React.ReactNode {
  return (
    <div className={cn('flex items-end gap-2.5', className)}>
      <Bituin size={32} className="shrink-0" />
      <div className="min-w-0 max-w-[85%] overflow-hidden rounded-[18px] rounded-bl-md border border-lineSoft bg-panel px-3.5 py-2.5 text-[14.5px] leading-snug">
        {children}
      </div>
    </div>
  )
}

/** A line (a green bubble on the right) and Bituin's reply under it (isip/reply.ts) over what it read: counted Readings can be undone, unsure ones confirmed or dismissed. */
function EntryRow({ entry, day, fresh, onEdit }: { entry: IsipEntry; day: IsipEntry[]; fresh: boolean; onEdit: () => void }): React.ReactNode {
  const [fixing, setFixing] = useState<number | null>(null)
  const habits = useHabitStore((s) => s.habits)
  const readings = read(entry).filter((r) => chipLabel(r.entry))
  const fix = fixing === null ? undefined : readings[fixing]
  const { today } = useEntries()
  const lift = readings.find((r) => r.entry.kind === 'lift')?.entry
  const targets = Object.fromEntries(habits.map((h) => [h.name.toLowerCase(), h.target]))
  const says = reply(entry, readings, { day, today, targets, liftNote: lift?.kind === 'lift' ? liftHint(lift) : undefined })
  return (
    <li className="flex flex-col gap-2">
      <div className={cn('flex items-end justify-end gap-2', fresh && 'thread-in thread-in-mine')}>
        <time dateTime={new Date(entry.createdAt).toISOString()} className="shrink-0 pb-2.5 text-xs tabular-nums text-faint">
          {formatClock(entry.createdAt)}
        </time>
        <button
          type="button"
          onClick={onEdit}
          aria-label={ISIP.entry.edit(entry.text)}
          className="min-h-11 min-w-0 max-w-[80%] break-words rounded-[18px] rounded-br-md bg-accent px-3.5 py-2.5 text-left text-[15px] leading-snug text-accent-fg transition-[background-color,transform] duration-150 ease-out hover:bg-accent-strong active:scale-[0.98]"
        >
          {entry.text}
        </button>
      </div>
      <Said className={fresh ? 'thread-in thread-in-reply' : undefined}>
        {says}
        {readings.length > 0 && (
          <span className="mt-2 flex flex-wrap gap-1.5">
            {readings.map((r, i) => (
              <ReadingChip key={i} id={entry.id} span={entry.text.slice(...r.span)} reading={r} onFix={() => setFixing(fixing === i ? null : i)} />
            ))}
          </span>
        )}
        {fix && <FixForm reading={fix} onDone={() => setFixing(null)} />}
      </Said>
    </li>
  )
}

/** "8:05am", the time a line was written. */
const formatClock = (ms: number): string => {
  const d = new Date(ms)
  return formatTime(`${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`)
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
      className="form-in -mx-3.5 -mb-2.5 mt-2.5 flex flex-col gap-2 border-t border-lineSoft bg-raise/40 px-3.5 py-3"
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
    <li className="form-in rounded-surface border border-line bg-panel shadow-raise">
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
