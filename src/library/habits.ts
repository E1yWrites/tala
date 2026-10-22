import { create } from 'zustand'
import { dayKey } from '@/coach/study'
import { db } from '@/database/db'
import { STUDY_ID } from '@/entries/habits'
import type { Habit } from '@/entries/habits'
import { isipRefs } from '@/entries/scan'
import { useIsipStore } from '@/store/isipStore'
import { createId } from '@/utils/id'
import { addEntries, editEntry } from './isip'

/*
  The Library's habits: one `meta` row each (`habit:<id>`), so a backup carries
  them. What was done is the ✓ Entries in Isip; removing a habit keeps them.
*/

const PREFIX = 'habit:'

export const useHabitStore = create<{ habits: Habit[] }>(() => ({ habits: [] }))

const isTime = (v: unknown): v is string => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v)
const isHabit = (h: unknown): h is Habit => {
  const x = h as Habit
  return (
    !!x &&
    typeof x.id === 'string' &&
    typeof x.name === 'string' &&
    !!x.name.trim() &&
    Number.isInteger(x.days) && x.days >= 1 && x.days <= 7 &&
    Number.isInteger(x.target) && x.target >= 1 &&
    typeof x.since === 'string' &&
    (x.remind === undefined || isTime(x.remind))
  )
}

const ordered = (hs: Habit[]): Habit[] => [...hs].sort((a, b) => a.since.localeCompare(b.since) || a.name.localeCompare(b.name))

/** Reads the habit rows into the store (boot, and after a restore). */
export async function loadHabits(): Promise<void> {
  const rows = await db.meta.where('key').startsWith(PREFIX).toArray()
  useHabitStore.setState({ habits: ordered(rows.map((r) => r.value).filter(isHabit)) })
}

function put(h: Habit): void {
  void db.meta.put({ key: PREFIX + h.id, value: h }).catch((err) => console.error('[tala] could not save a habit', err))
}

export type HabitInput = Pick<Habit, 'name' | 'days' | 'target' | 'remind'>

/** Why a name can't be used, or null: it is what you tick, so it must be new and not end in a number (the count). */
export function habitNameProblem(name: string, id?: string): string | null {
  const n = name.trim().toLowerCase()
  if (!n) return 'Give it a name.'
  if (/\s\d+$/.test(n) || /^\d+$/.test(n) || /\sskip$/.test(n)) return 'A name can’t end in a number or “skip”.'
  if (n === STUDY_ID || useHabitStore.getState().habits.some((h) => h.id !== id && h.name.toLowerCase() === n)) {
    return 'There is already a habit with that name.'
  }
  return null
}

const clean = (i: HabitInput): HabitInput => ({
  name: i.name.trim().replace(/\s+/g, ' '),
  days: Math.min(7, Math.max(1, Math.round(i.days))),
  target: Math.max(1, Math.round(i.target) || 1),
  ...(i.remind && isTime(i.remind) ? { remind: i.remind } : {}),
})

/** Adds a habit; false when its name can't be used (see habitNameProblem). */
export function addHabit(input: HabitInput, now = Date.now()): boolean {
  if (habitNameProblem(input.name)) return false
  const h: Habit = { id: createId(), ...clean(input), since: dayKey(now) }
  useHabitStore.setState((s) => ({ habits: ordered([...s.habits, h]) }))
  put(h)
  return true
}

/** Changes a habit. Renaming it does not rewrite old ✓ lines, so they stay with the old name. */
export function updateHabit(id: string, input: HabitInput): boolean {
  const old = useHabitStore.getState().habits.find((h) => h.id === id)
  if (!old || habitNameProblem(input.name, id)) return false
  const h: Habit = { id, since: old.since, ...clean(input) }
  useHabitStore.setState((s) => ({ habits: ordered(s.habits.map((x) => (x.id === id ? h : x))) }))
  put(h)
  return true
}

export function removeHabit(id: string): void {
  useHabitStore.setState((s) => ({ habits: s.habits.filter((h) => h.id !== id) }))
  void db.meta.delete(PREFIX + id).catch((err) => console.error('[tala] could not remove a habit', err))
}

/** "Done" (or +1) from a view: one `✓ name N` Entry per habit per day, so today's counts one more, else a new one. */
export function tickHabit(name: string, now = Date.now()): void {
  const day = dayKey(now)
  const today = useIsipStore.getState().entries.filter((e) => e.day === day)
  const ref = isipRefs(today).find(
    (r) => r.entry.kind === 'tick' && !r.entry.skip && r.entry.day === day && r.entry.name.toLowerCase() === name.toLowerCase(),
  )
  if (ref?.entry.kind === 'tick') editEntry(ref.isip!, { text: `✓ ${name} ${ref.entry.count + 1}` }, now)
  else addEntries(`✓ ${name}`, now)
}

/** A day off: a "✓ gym skip" Entry. */
export function skipHabit(name: string, now = Date.now()): void {
  addEntries(`✓ ${name} skip`, now)
}
