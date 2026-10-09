import { STUDY_DAY_SECONDS } from '@/coach/study'
import { addDays, toDate } from './dates'
import type { DayKey } from './dates'
import type { EntryRef } from './scan'

/*
  Habits, read from the ✓ lines on every page. Pure: the definitions come in as
  arguments (library/habits.ts keeps them in `meta`).

  Strength is Loop Habit Tracker's score: every day pulls it toward that day's
  value, score = prev·m + value·(1−m) with m = 0.5^(√(days/7)/13), so a miss
  dents it and nothing resets it. For a habit kept 3 days a week, every day of
  a 7-day stretch holding 3 done days counts as done. A day off ("✓ gym skip")
  leaves the score where it was: skip is not miss.
*/

export interface Habit {
  id: string
  /** What you tick: "✓ water". */
  name: string
  /** Days a week: 7 is every day. */
  days: number
  /** How many make a day done ("✓ water 3" counts 3); 1 for a yes/no habit. */
  target: number
  /** "HH:MM": a reminder while Tala is open, on days it is still to do. */
  remind?: string
  /** The day it was added. */
  since: DayKey
}

export interface HabitLog {
  /** What was ticked per day. */
  counts: Map<DayKey, number>
  /** Days off. */
  skips: Set<DayKey>
}

export const EMPTY_LOG: HabitLog = { counts: new Map(), skips: new Set() }

/** Every ✓ line, by lowercase name. */
export function habitLogs(refs: EntryRef[]): Map<string, HabitLog> {
  const out = new Map<string, HabitLog>()
  for (const { entry: e } of refs) {
    if (e.kind !== 'tick') continue
    const key = e.name.toLowerCase()
    let log = out.get(key)
    if (!log) out.set(key, (log = { counts: new Map(), skips: new Set() }))
    if (e.skip) log.skips.add(e.day)
    else log.counts.set(e.day, (log.counts.get(e.day) ?? 0) + e.count)
  }
  return out
}

/** Each day's value from `from` to `to`, 0..1. */
function values(h: Habit, log: HabitLog, from: DayKey, to: DayKey): Array<[DayKey, number]> {
  const out: Array<[DayKey, number]> = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push([d, Math.min(1, (log.counts.get(d) ?? 0) / h.target)])
  if (h.days >= 7) return out
  // A 7-day stretch holding `days` done days counts whole
  const met = out.map(([, v]) => (v >= 1 ? 1 : 0))
  const full = new Array<boolean>(out.length).fill(false)
  let sum = 0
  for (let i = 0; i < out.length; i++) {
    sum += met[i]! - (i >= 7 ? met[i - 7]! : 0)
    if (sum >= h.days) for (let k = Math.max(0, i - 6); k <= i; k++) full[k] = true
  }
  return out.map(([d, v], i) => [d, full[i] ? 1 : v])
}

/** Loop's score, 0..1. Today counts once it is done; until then the score stands at yesterday's. */
export function strength(h: Habit, log: HabitLog, today: DayKey): number {
  const first = [...log.counts.keys()].reduce((a, b) => (b < a ? b : a), h.since)
  const yearAgo = addDays(today, -365)
  const from = first < yearAgo ? yearAgo : first
  const to = (log.counts.get(today) ?? 0) >= h.target ? today : addDays(today, -1)
  const m = 0.5 ** (Math.sqrt(h.days / 7) / 13)
  let score = 0
  for (const [d, v] of values(h, log, from, to)) if (!log.skips.has(d)) score = score * m + v * (1 - m)
  return score
}

export type DayState = 'done' | 'part' | 'off' | 'none' | 'later'

export interface HabitStatus {
  /** Ticked today. */
  count: number
  done: boolean
  off: boolean
  /** Done days this week, Monday first. */
  week: number
  /** Still to do today: not done, no day off, and the week's days not yet reached. */
  due: boolean
  strength: number
  /** Days since it started (the day it was added, or its first tick if earlier); 0 on the first day. */
  age: number
  /** Monday..Sunday of this week. */
  days: Array<{ day: DayKey; state: DayState }>
}

export function habitStatus(h: Habit, log: HabitLog, today: DayKey): HabitStatus {
  const monday = addDays(today, -((toDate(today).getDay() + 6) % 7))
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(monday, i)
    const n = log.counts.get(day) ?? 0
    const state: DayState =
      day > today ? 'later' : n >= h.target ? 'done' : log.skips.has(day) ? 'off' : n > 0 ? 'part' : 'none'
    return { day, state }
  })
  const count = log.counts.get(today) ?? 0
  const done = count >= h.target
  const off = !done && log.skips.has(today)
  const week = days.filter((d) => d.state === 'done').length
  const first = [...log.counts.keys()].reduce((a, b) => (b < a ? b : a), h.since)
  const age = Math.max(0, Math.round((toDate(today).getTime() - toDate(first).getTime()) / 86_400_000))
  return { count, done, off, week, due: !done && !off && (h.days >= 7 || week < h.days), strength: strength(h, log, today), age, days }
}

export const STUDY_ID = 'study'

/** Bituin's Study days as habit #1: a day with 5 minutes of writing is done; its days a week are the weekly goal. */
export function studyHabit(seconds: Record<string, number>, goal: number, today: DayKey): [Habit, HabitLog] {
  const studied = Object.keys(seconds).filter((d) => seconds[d]! >= STUDY_DAY_SECONDS)
  const since = studied.reduce((a, b) => (b < a ? b : a), today)
  return [
    { id: STUDY_ID, name: 'Study', days: goal, target: 1, since },
    { counts: new Map(studied.map((d) => [d, 1])), skips: new Set() },
  ]
}

/** "Every day", "3 days a week · 8 a day". */
export function habitRule(h: Pick<Habit, 'days' | 'target'>): string {
  return [h.days >= 7 ? 'Every day' : `${h.days} ${h.days === 1 ? 'day' : 'days'} a week`, ...(h.target > 1 ? [`${h.target} a day`] : [])].join(' · ')
}
