import Dexie from 'dexie'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const { appendLine } = await import('./journal')
const { createNote, flush, markOnDisk } = await import('./notes')
const { chipLabel, startRest, useRestStore } = await import('./workouts')
const { scanEntries } = await import('@/entries/scan')
const { parseLine } = await import('@/entries/parse')

const at = (d: string): number => new Date(`${d}T18:00:00`).getTime()
const paragraph = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })

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

describe('workouts', () => {
  it('reads lift lines on journal pages only, and the chip says PR or last time', async () => {
    createNote({ title: 'Photo sizes', content: paragraph('photo 4x6') })
    await appendLine('bench 55x5x3', at('2026-10-01')).saved
    await appendLine('bench 57.5x5x3', at('2026-10-05')).saved
    const lifts = scanEntries(useNoteStore.getState().notes, usePageStore.getState().pagesByNote).filter((r) => r.entry.kind === 'lift')
    expect(lifts.map((r) => r.text)).toEqual(['bench 55x5x3', 'bench 57.5x5x3'])

    const chip = (text: string) => chipLabel(parseLine(text, '2026-10-08', undefined, false, true)!)
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
