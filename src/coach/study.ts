/*
  Study-day arithmetic, pure: no clocks, no storage. A Study day is a calendar
  day with at least 5 minutes of writing or marking up; the weekly goal counts
  them from Monday. Missing a day resets nothing, so there is no streak here.
*/

export const STUDY_DAY_SECONDS = 300
export const DEFAULT_WEEKLY_GOAL = 4
export const MAX_WEEKLY_GOAL = 7
/** A gap longer than this between two writing events is a pause, not writing. */
export const GAP_CAP_MS = 30_000
/** Credit for the first event after a pause. */
export const PULSE_MS = 1000
/** A Session ends after this long without writing. */
export const SESSION_IDLE_MS = 10 * 60_000
/** Shorter sessions are not worth a wrap-up. */
export const WRAPUP_MIN_MS = 60_000

const p2 = (n: number): string => String(n).padStart(2, '0')

/** Local calendar day, `YYYY-MM-DD`. */
export function dayKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`
}

/** The Monday (local) that starts the week containing `t`, as a day key. Used as the week's id. */
export function weekKey(t: number): string {
  const d = new Date(t)
  d.setHours(12, 0, 0, 0) // noon: immune to DST shifts
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return dayKey(d.getTime())
}

/** Monday..Sunday of the week containing `t`: studied seconds per day and whether it counts. */
export function weekDays(
  seconds: Record<string, number>,
  t: number,
): Array<{ key: string; seconds: number; studied: boolean; today: boolean }> {
  const monday = new Date(t)
  monday.setHours(12, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const today = dayKey(t)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    const key = dayKey(d.getTime())
    const s = seconds[key] ?? 0
    return { key, seconds: s, studied: s >= STUDY_DAY_SECONDS, today: key === today }
  })
}

export const studyDaysThisWeek = (seconds: Record<string, number>, t: number): number =>
  weekDays(seconds, t).filter((d) => d.studied).length

/** Milliseconds of writing to credit for an event at `now`, given the previous event (or null). */
export const creditFor = (lastAt: number | null, now: number): number =>
  lastAt !== null && now - lastAt <= GAP_CAP_MS ? Math.max(0, now - lastAt) : PULSE_MS

/** What Bituin says when a Session ends. */
export interface Wrapup {
  noteId: string
  title: string
  minutes: number
  pagesAdded: number
  tasksLeft: number
  at: number
}

export function makeWrapup(input: {
  noteId: string
  title: string
  activeMs: number
  pagesAtStart: number
  pagesNow: number
  tasksLeft: number
  now: number
}): Wrapup | null {
  if (input.activeMs < WRAPUP_MIN_MS) return null
  return {
    noteId: input.noteId,
    title: input.title,
    minutes: Math.max(1, Math.round(input.activeMs / 60_000)),
    pagesAdded: Math.max(0, input.pagesNow - input.pagesAtStart),
    tasksLeft: input.tasksLeft,
    at: input.now,
  }
}
