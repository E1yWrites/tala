import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { useIsipStore } from '@/store/isipStore'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const { createNote, flush, markOnDisk } = await import('./notes')
const { addEntries } = await import('./isip')
const { planReminders } = await import('./reminders')

const at = (d: string, hm: string): number => new Date(`${d}T${hm}:00`).getTime()

beforeEach(async () => {
  await flush()
  db.close()
  await Dexie.delete('tala')
  await db.open()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  useIsipStore.setState({ entries: [] })
  markOnDisk([])
  toast.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('reminders while Tala is open', () => {
  it('fires `!30m` half an hour before, once, and nothing without `!`', async () => {
    const morning = at('2026-10-08', '08:00')
    addEntries('@ 2pm dentist !30m', morning)
    addEntries('@ 3pm lab', morning)
    // A dated task in a Note, written that morning
    const item = { type: 'paragraph', attrs: { at: '2026-10-08' }, content: [{ type: 'text', text: 'essay due sat !1d' }] }
    createNote({ content: { type: 'doc', content: [{ type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [item] }] }] } })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    vi.setSystemTime(morning)
    planReminders(morning)

    vi.setSystemTime(at('2026-10-08', '13:29'))
    vi.advanceTimersByTime(at('2026-10-08', '13:29') - morning)
    expect(toast).not.toHaveBeenCalled()
    vi.advanceTimersByTime(60_000)
    expect(toast).toHaveBeenCalledWith('dentist', expect.objectContaining({ description: '2pm' }))

    planReminders(at('2026-10-08', '13:31')) // an edit re-plans: the fired one stays fired
    vi.advanceTimersByTime(at('2026-10-08', '09:00') + 86_400_000 - at('2026-10-08', '13:30'))
    expect(toast.mock.calls.map((c) => c[0])).toEqual(['dentist', 'essay']) // the deadline's day before, at 9:00
  })
})
