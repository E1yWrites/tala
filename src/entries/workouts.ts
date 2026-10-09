import type { DayKey } from './dates'
import { formatDay, formatWeight } from './parse'
import type { Entry } from './parse'
import type { EntryRef } from './scan'

/*
  Workouts, read from the lift lines on journal pages ("bench 60x5x3 @8").
  Pure. No programs: what you lifted, what you lifted last time, and your best.
*/

export type Lift = Extract<Entry, { kind: 'lift' }>
export type LiftRef = EntryRef & { entry: Lift }

export const liftRefs = (refs: EntryRef[]): LiftRef[] => refs.filter((r): r is LiftRef => r.entry.kind === 'lift')

const LB = 0.45359237
const sameName = (a: Lift, b: Lift): boolean => a.name.toLowerCase() === b.name.toLowerCase()

/** Estimated one-rep max (Epley) in the line's unit; RPE adds the reps left in the tank (100x5 @8 counts as 100x7). */
export function e1rm(l: Lift): number {
  const reps = l.reps + (l.rpe !== undefined ? 10 - l.rpe : 0)
  return reps <= 1 ? l.weight : l.weight * (1 + reps / 30)
}

/** Any weight beats bodyweight; then the estimated 1RM in kg, or the reps for bodyweight lines. */
function compare(a: Lift, b: Lift): number {
  const score = (l: Lift): [number, number] => (l.weight ? [1, e1rm(l) * (l.unit === 'lb' ? LB : 1)] : [0, l.reps])
  const [x, y] = [score(a), score(b)]
  return x[0] - y[0] || x[1] - y[1]
}

const best = (ls: Lift[]): Lift => ls.reduce((a, b) => (compare(b, a) > 0 ? b : a))
const short = (l: Lift): string => `${l.sets}×${l.reps} ${formatWeight(l)}`

export interface Exercise {
  name: string
  /** The last day it was done, and that day's best line. */
  lastDay: DayKey
  last: LiftRef
  /** The best line ever and its day. */
  best: Lift
  /** Days it was done. */
  sessions: number
}

/** Every exercise, most recently done first. */
export function exercises(refs: EntryRef[]): Exercise[] {
  const by = new Map<string, LiftRef[]>()
  for (const r of liftRefs(refs)) {
    const k = r.entry.name.toLowerCase()
    by.set(k, [...(by.get(k) ?? []), r])
  }
  return [...by.values()]
    .map((rs) => {
      const lastDay = rs.reduce((d, r) => (r.entry.day > d ? r.entry.day : d), '')
      const today = rs.filter((r) => r.entry.day === lastDay)
      const last = today.reduce((a, b) => (compare(b.entry, a.entry) > 0 ? b : a))
      return { name: last.entry.name, lastDay, last, best: best(rs.map((r) => r.entry)), sessions: new Set(rs.map((r) => r.entry.day)).size }
    })
    .sort((a, b) => b.lastDay.localeCompare(a.lastDay) || a.name.localeCompare(b.name))
}

/** Beside a lift line: "PR" when it beats every earlier day, else the last time ("last Oct 2: 3×5 57.5kg"). */
export function liftNote(refs: EntryRef[], l: Lift): string {
  const before = liftRefs(refs)
    .map((r) => r.entry)
    .filter((x) => sameName(x, l) && x.day < l.day)
  if (before.length === 0) return ''
  if (before.every((x) => compare(l, x) > 0)) return 'PR'
  const lastDay = before.reduce((d, x) => (x.day > d ? x.day : d), '')
  return `last ${formatDay(lastDay).replace(/^[^,]+,\s*/, '')}: ${short(best(before.filter((x) => x.day === lastDay)))}`
}

/*
  Strong's CSV export, which other trackers import: one row per set, set order
  counted per exercise per day. It has no unit column, so weights are as written.
*/
const STRONG_HEAD = 'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE'
const cell = (v: string | number): string => (typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v))

export function strongCsv(refs: EntryRef[]): string {
  const rows = [STRONG_HEAD]
  const order = new Map<string, number>()
  const lines = liftRefs(refs).sort((a, b) => a.entry.day.localeCompare(b.entry.day))
  for (const { entry: l } of lines) {
    for (let s = 0; s < l.sets; s++) {
      const k = `${l.day}|${l.name.toLowerCase()}`
      order.set(k, (order.get(k) ?? 0) + 1)
      rows.push([`${l.day} 00:00:00`, 'Tala', '', l.name, order.get(k)!, l.weight, l.reps, 0, 0, '', '', l.rpe ?? ''].map(cell).join(','))
    }
  }
  return `${rows.join('\n')}\n`
}
