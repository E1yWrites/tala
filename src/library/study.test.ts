import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { dayKey } from '@/coach/study'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import type { Note, PageRecord } from '@/types/models'
import { dismissWrapup, endSession, loadStudy, noteWriting, openSession, setWeeklyGoal, useStudyStore } from './study'

// the tracker uses window timers; node has none
vi.stubGlobal('window', globalThis)

const T0 = new Date(2026, 9, 7, 10, 0, 0).getTime()

const note = (id: string): Note => ({
  id, title: 'Enzymes', content: null, ink: null, folderId: null, tagIds: [],
  isPinned: false, isFavorite: false, isArchived: false, isDeleted: false, deletedAt: null,
  createdAt: T0, updatedAt: T0,
})
const page = (id: string, noteId: string, index: number, content: unknown = null): PageRecord =>
  ({ id, noteId, index, template: 'blank', content, text: '', createdAt: T0, updatedAt: T0 }) as PageRecord

const taskDoc = (...checked: boolean[]) => ({
  type: 'doc',
  content: [
    {
      type: 'taskList',
      content: checked.map((c) => ({ type: 'taskItem', attrs: { checked: c }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] })),
    },
  ],
})

beforeEach(async () => {
  db.close()
  await Dexie.delete('tala')
  await db.open()
  // only the debounce/idle timers: fake-indexeddb schedules its work with setImmediate
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
  useStudyStore.setState({ seconds: {}, goal: 4, wrapup: null })
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
})
afterEach(() => vi.useRealTimers())

describe('study time', () => {
  it('credits the gaps while writing continues and saves them to the meta table', async () => {
    noteWriting(T0)
    noteWriting(T0 + 10_000)
    noteWriting(T0 + 20_000)
    expect(useStudyStore.getState().seconds[dayKey(T0)]).toBe(21) // a 1 s pulse, then 10 s + 10 s

    await vi.advanceTimersByTimeAsync(10_000) // the debounced save
    vi.useRealTimers()
    expect((await db.meta.get(`study:${dayKey(T0)}`))!.value).toBe(21)

    useStudyStore.setState({ seconds: {} })
    await loadStudy()
    expect(useStudyStore.getState().seconds[dayKey(T0)]).toBe(21)
  })

  it('keeps the weekly goal in meta, clamped to 1..7', async () => {
    setWeeklyGoal(5)
    setWeeklyGoal(99)
    vi.useRealTimers()
    await new Promise((r) => setTimeout(r, 20))
    await loadStudy()
    expect(useStudyStore.getState().goal).toBe(7)
  })
})

describe('sessions and wrap-up', () => {
  it('summarises a session when the note closes: minutes, pages added, tasks left', () => {
    useNoteStore.setState({ notes: [note('n')] })
    usePageStore.setState({ pagesByNote: { n: [page('n', 'n', 0, taskDoc(true, false, false))] } })
    openSession('n')
    for (let i = 0; i < 7; i++) noteWriting(T0 + i * 20_000) // ~2 minutes of steady writing
    usePageStore.setState({ pagesByNote: { n: [page('n', 'n', 0, taskDoc(true, false, false)), page('p2', 'n', 1)] } })

    endSession(T0 + 150_000)
    expect(useStudyStore.getState().wrapup).toMatchObject({ noteId: 'n', title: 'Enzymes', minutes: 2, pagesAdded: 1, tasksLeft: 2 })
    dismissWrapup()
    expect(useStudyStore.getState().wrapup).toBeNull()
  })

  it('says nothing about a session that was only a glance', () => {
    useNoteStore.setState({ notes: [note('n')] })
    usePageStore.setState({ pagesByNote: { n: [page('n', 'n', 0)] } })
    openSession('n')
    noteWriting(T0)
    endSession(T0 + 5000)
    expect(useStudyStore.getState().wrapup).toBeNull()
  })

  it('ends a session on its own after ten idle minutes', () => {
    useNoteStore.setState({ notes: [note('n')] })
    usePageStore.setState({ pagesByNote: { n: [page('n', 'n', 0)] } })
    openSession('n')
    for (let i = 0; i < 7; i++) noteWriting(T0 + i * 20_000)
    vi.advanceTimersByTime(10 * 60_000)
    expect(useStudyStore.getState().wrapup?.noteId).toBe('n')
  })
})
