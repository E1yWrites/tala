import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const { flush, markOnDisk } = await import('./notes')
const { addHabit, habitNameProblem, loadHabits, skipHabit, tickHabit, useHabitStore } = await import('./habits')
const { habitReminders } = await import('./reminders')
const { habitLogs } = await import('@/entries/habits')
const { scanEntries } = await import('@/entries/scan')
const { parseLine } = await import('@/entries/parse')
await import('./context')

const at = (d: string, hm = '09:00'): number => new Date(`${d}T${hm}:00`).getTime()
const lines = () => scanEntries(useNoteStore.getState().notes, usePageStore.getState().pagesByNote).map((r) => r.text)
const logs = () => habitLogs(scanEntries(useNoteStore.getState().notes, usePageStore.getState().pagesByNote))

beforeEach(async () => {
  await flush()
  db.close()
  await Dexie.delete('tala')
  await db.open()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  markOnDisk([])
  await loadHabits()
})

describe('habits', () => {
  it('a habit is a name the parser ticks, and it survives a reload', async () => {
    expect(addHabit({ name: 'Water', days: 7, target: 8 }, at('2026-10-08'))).toBe(true)
    expect(habitNameProblem('water')).toMatch(/already/)
    expect(habitNameProblem('read 20')).toMatch(/number/)
    expect(parseLine('x water 2', '2026-10-08')).toMatchObject({ kind: 'tick', name: 'Water', count: 2 })
    await new Promise((r) => setTimeout(r, 20)) // meta write lands
    useHabitStore.setState({ habits: [] })
    await loadHabits()
    expect(useHabitStore.getState().habits).toMatchObject([{ name: 'Water', days: 7, target: 8, since: '2026-10-08' }])
  })

  it('"Done" counts one more on today’s line instead of adding lines; a day off is its own line', async () => {
    addHabit({ name: 'water', days: 7, target: 8 }, at('2026-10-08'))
    tickHabit('water', at('2026-10-08'))
    await flush()
    tickHabit('water', at('2026-10-08', '10:00'))
    await flush()
    skipHabit('gym', at('2026-10-08'))
    await flush()
    expect(lines()).toEqual(['✓ water 2', '✓ gym skip'])
  })

  it('reminds at its time only while it is still to do today', async () => {
    addHabit({ name: 'gym', days: 7, target: 1, remind: '18:00' }, at('2026-10-08'))
    const { habits } = useHabitStore.getState()
    expect([...habitReminders(habits, logs(), at('2026-10-08', '12:00')).values()]).toEqual([
      { at: at('2026-10-08', '18:00'), title: 'gym', body: 'Still to do today' },
    ])
    tickHabit('gym', at('2026-10-08', '12:00'))
    await flush()
    expect(habitReminders(habits, logs(), at('2026-10-08', '12:30')).size).toBe(0)
    expect(habitReminders(habits, logs(), at('2026-10-09', '19:00')).size).toBe(0) // past its time
  })
})
