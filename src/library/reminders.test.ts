import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const { appendLine } = await import('./journal')
const { flush, markOnDisk } = await import('./notes')
const { planReminders } = await import('./reminders')

const at = (d: string, hm: string): number => new Date(`${d}T${hm}:00`).getTime()

beforeEach(async () => {
  await flush()
  db.close()
  await Dexie.delete('tala')
  await db.open()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  markOnDisk([])
  toast.mockClear()
})
afterEach(() => vi.useRealTimers())

describe('reminders while Tala is open', () => {
  it('fires `!30m` half an hour before, once, and nothing without `!`', async () => {
    const morning = at('2026-10-08', '08:00')
    await appendLine('@ 2pm dentist !30m', morning).saved
    await appendLine('@ 3pm lab', morning).saved
    await appendLine('[ ] essay due sat !1d', morning).saved
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
