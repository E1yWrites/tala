import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { useIsipStore } from '@/store/isipStore'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const { createNote, flush, markOnDisk } = await import('./notes')
const { addEntries, libraryRefs } = await import('./isip')
const { chipLabel, startRest, useRestStore } = await import('./workouts')
const { read } = await import('@/isip/read')

const at = (d: string): number => new Date(`${d}T18:00:00`).getTime()
const paragraph = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

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

describe('workouts', () => {
  it('reads lifts from Isip only, and the chip says PR or last time', async () => {
    createNote({ title: 'Gym notes', content: paragraph('bench 100x5x3') })
    addEntries('bench 55x5x3', at('2026-10-01'))
    addEntries('bench 57.5x5x3', at('2026-10-05'))
    const lifts = libraryRefs().filter((r) => r.entry.kind === 'lift')
    expect(lifts.map((r) => r.entry)).toMatchObject([{ weight: 55 }, { weight: 57.5 }])

    // Read as Isip reads it: "bench" is Bench press, the name the earlier lines carry too
    const chip = (text: string) => chipLabel(read({ text, day: '2026-10-08', createdAt: at('2026-10-08') })[0]!.entry)
    expect(chip('bench 60x5x3')).toBe('3×5 · 60kg · PR')
    expect(chip('bench 50x5x3')).toMatch(/^3×5 · 50kg · last .*5: 3×5 57.5kg$/)
  })

  it('the rest timer alerts once when it runs out', () => {
    vi.useFakeTimers()
    startRest(90, Date.now())
    vi.advanceTimersByTime(89_000)
    expect(toast).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1000)
    expect(toast).toHaveBeenCalledWith('Rest is over', expect.objectContaining({ description: '1:30 up. Next set.' }))
    expect(useRestStore.getState().endsAt).toBeNull()
  })
})
