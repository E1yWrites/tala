import { dayKey } from '@/coach/study'
import { addDays, toDate } from './dates'
import type { DayKey, Repeat } from './dates'
import type { EntryRef } from './scan'

/*
  The Agenda: what the lines on your pages put on each day. Pure: give it the
  scanned entries and a window of days, get back occurrences.

  - A task's planned day never goes overdue: if it passed, the task waits on
    Today. Only a deadline ("due fri") turns overdue.
  - An event is on its day; a repeat (MWF, every 15th) is expanded inside the
    window, minus "skip" days, until its "until".
  - A due-again tracker ("@ haircut every ~6w") is due that long after it was
    last ticked ("✓ haircut"), or after the date on its line, or the day it was written.
*/

export interface Occurrence {
  /** Stable for this line on this day (list keys, reminders). */
  key: string
  day: DayKey
  time?: string
  end?: string
  title: string
  kind: 'event' | 'task' | 'again'
  /** A bill: the event carries an amount. */
  amount?: number
  /** Task deadline. */
  due?: DayKey
  /** Days past a deadline or a due-again date (0: due today). */
  overdue?: number
  repeats: boolean
  /** Minutes before the time (see parse.ts `!`). */
  remind?: number
  ref: EntryRef
}

const diffDays = (a: DayKey, b: DayKey): number => Math.round((toDate(a).getTime() - toDate(b).getTime()) / 86_400_000)
const weekday = (k: DayKey): number => toDate(k).getDay()
const mondayOf = (k: DayKey): DayKey => addDays(k, -((weekday(k) + 6) % 7))
const lastDom = (k: DayKey): number => {
  const d = toDate(k)
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate()
}

/** `k` plus `n` months, clamped to the month's last day (Jan 31 + 1 month = Feb 28). */
export function addMonths(k: DayKey, n: number): DayKey {
  const d = toDate(k)
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0, 12).getDate()
  return dayKey(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last), 12).getTime())
}

const monthsBetween = (a: DayKey, b: DayKey): number => {
  const x = toDate(a)
  const y = toDate(b)
  return (y.getFullYear() - x.getFullYear()) * 12 + y.getMonth() - x.getMonth()
}

/** Whether `day` has the right weekday / day of the month, ignoring "every other". */
function matches(r: Repeat, start: DayKey, day: DayKey): boolean {
  switch (r.unit) {
    case 'day':
      return true
    case 'week':
      return (r.on ?? [weekday(start)]).includes(weekday(day))
    case 'month': {
      const dom = toDate(day).getDate()
      const last = lastDom(day)
      // the 31st (or 30th) of a shorter month is its last day
      return (r.on ?? [toDate(start).getDate()]).some((d) => (d === -1 || d > last ? dom === last : d === dom))
    }
    case 'year':
      return toDate(day).getMonth() === toDate(start).getMonth() && toDate(day).getDate() === toDate(start).getDate()
  }
}

/** Whether a fixed repeat written on `start` falls on `day`. "Every other" counts from its first occurrence. */
export function repeatsOn(r: Repeat, start: DayKey, day: DayKey): boolean {
  if (day < start || (r.until && day > r.until) || r.skip?.includes(day) || !matches(r, start, day)) return false
  if (r.every === 1) return true
  let first = start
  for (let i = 0; i < 400 && !matches(r, start, first); i++) first = addDays(first, 1)
  switch (r.unit) {
    case 'day':
      return diffDays(day, first) % r.every === 0
    case 'week':
      return (diffDays(mondayOf(day), mondayOf(first)) / 7) % r.every === 0
    case 'month':
      return monthsBetween(first, day) % r.every === 0
    case 'year':
      return monthsBetween(first, day) % (12 * r.every) === 0
  }
}

/** Next due day of a tracker last done on `last`. */
export function dueAfter(r: Repeat, last: DayKey): DayKey {
  switch (r.unit) {
    case 'day':
      return addDays(last, r.every)
    case 'week':
      return addDays(last, 7 * r.every)
    case 'month':
      return addMonths(last, r.every)
    case 'year':
      return addMonths(last, 12 * r.every)
  }
}

const keyOf = (ref: EntryRef, day: DayKey): string => `${ref.pageId}|${ref.ink ?? ref.path.join('.')}|${day}`

/** Occurrences on the `days` days from `from`, in day then time order (timed first, then the rest). */
export function agenda(refs: EntryRef[], from: DayKey, days: number, today: DayKey): Occurrence[] {
  const to = addDays(from, days - 1)
  const inWindow = (d: DayKey): boolean => d >= from && d <= to
  const out: Occurrence[] = []

  // Last tick per name, for due-again trackers
  const lastTick = new Map<string, DayKey>()
  for (const r of refs) {
    if (r.entry.kind !== 'tick' || r.entry.skip) continue
    const name = r.entry.name.toLowerCase()
    if ((lastTick.get(name) ?? '') < r.entry.day) lastTick.set(name, r.entry.day)
  }

  for (const ref of refs) {
    const e = ref.entry
    if (e.kind === 'task') {
      if (ref.task?.checked) continue
      const due = e.due?.day
      const planned = e.when?.day
      let day: DayKey | undefined
      let overdue: number | undefined
      if (due && due <= today) {
        day = today
        overdue = diffDays(today, due)
      } else if (planned) day = planned < today ? today : planned
      else if (due) day = due
      if (!day || !inWindow(day)) continue
      out.push({
        key: keyOf(ref, day),
        day,
        time: e.when?.time ?? e.due?.time,
        title: e.text,
        kind: 'task',
        due,
        overdue,
        repeats: false,
        remind: e.remind,
        ref,
      })
    } else if (e.kind === 'event') {
      const base = {
        time: e.when?.time,
        end: e.when?.end,
        title: e.text,
        amount: e.amount,
        remind: e.remind,
        ref,
      }
      const r = e.repeat
      if (r?.approx) {
        // Last done: the latest tick, or the date on the line ("@ haircut every ~6w sep 1"), or the day it was written
        const ticked = lastTick.get(e.text.toLowerCase()) ?? ''
        const written = e.when?.day ?? ref.at
        const last = ticked > written ? ticked : written
        const next = dueAfter(r, last)
        const day = next < today ? today : next
        if (inWindow(day)) out.push({ ...base, key: keyOf(ref, 'again'), day, kind: 'again', overdue: next <= today ? diffDays(today, next) : undefined, repeats: true })
      } else if (r) {
        const start = e.when?.day ?? ref.at
        for (let d = from; d <= to; d = addDays(d, 1)) {
          if (repeatsOn(r, start, d)) out.push({ ...base, key: keyOf(ref, d), day: d, kind: 'event', repeats: true })
        }
      } else {
        const day = e.when?.day ?? ref.at
        if (inWindow(day)) out.push({ ...base, key: keyOf(ref, day), day, kind: 'event', repeats: false })
      }
    }
  }

  return out.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.time ? 0 : 1) - (b.time ? 0 : 1) ||
      (a.time ?? '').localeCompare(b.time ?? '') ||
      a.title.localeCompare(b.title),
  )
}

/** Every due-again tracker with its next due day, soonest first (the Upcoming list shows them all). */
export function trackers(refs: EntryRef[], today: DayKey): Occurrence[] {
  return agenda(refs.filter((r) => r.entry.kind === 'tick' || (r.entry.kind === 'event' && r.entry.repeat?.approx)), today, 366 * 5, today)
}

/** An untimed day's reminder fires against this hour (`!1d` on a deadline: 9:00 the day before). */
export const MORNING = '09:00'

/** When an occurrence's reminder fires (epoch ms), or undefined when it has none. */
export function reminderAt(o: Occurrence): number | undefined {
  if (o.remind === undefined) return undefined
  const [h, m] = (o.time ?? MORNING).split(':').map(Number)
  const d = toDate(o.day)
  d.setHours(h!, m!, 0, 0)
  return d.getTime() - o.remind * 60_000
}
