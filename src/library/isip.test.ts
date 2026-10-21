import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useIsipStore } from '@/store/isipStore'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const { createNote, flush, markOnDisk } = await import('./notes')
const { addEntries, deleteEntries, editEntry, libraryRefs, loadIsip, restoreEntries } = await import('./isip')
const { markDone, skipOccurrence } = await import('./agenda')
const { dump, restore } = await import('./snapshot')
const { backupToSnapshot, importBackupFile, snapshotToZip } = await import('@/utils/exportImport')

const at = (d: string, hm = '09:00'): number => new Date(`${d}T${hm}:00`).getTime()
const texts = () => useIsipStore.getState().entries.map((e) => e.text)
const rows = async () => (await db.isipEntries.toArray()).sort((a, b) => a.createdAt - b.createdAt || a.text.localeCompare(b.text))
const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] })

beforeEach(async () => {
  await flush()
  db.close()
  await Dexie.delete('tala')
  await db.open()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  useIsipStore.setState({ entries: [] })
  markOnDisk([])
  toast.error.mockClear()
})

describe('Entries', () => {
  it('one Entry per line, counting for the capture day, and they survive a reload', async () => {
    addEntries('P150 lunch gcash', at('2026-10-08'))
    addEntries('  kape 120 \n\n bench 60x5x3\r\n', at('2026-10-08', '18:00'))
    expect(texts()).toEqual(['P150 lunch gcash', 'kape 120', 'bench 60x5x3'])
    expect(addEntries('  \n ', at('2026-10-08'))).toEqual([])
    await flush()
    useIsipStore.setState({ entries: [] })
    await loadIsip()
    expect(useIsipStore.getState().entries.map((e) => [e.text, e.day])).toEqual([
      ['P150 lunch gcash', '2026-10-08'],
      ['kape 120', '2026-10-08'],
      ['bench 60x5x3', '2026-10-08'],
    ])
  })

  it('an edit re-reads the line; a decision lasts only while its text is still there', async () => {
    const [e] = addEntries('P150 lunch', at('2026-10-08'))
    useIsipStore.setState({ entries: [{ ...e!, decisions: { lunch: 'confirmed', P150: 'dismissed' } }] })
    editEntry(e!.id, { text: 'P180 lunch', day: '2026-10-07' })
    const edited = useIsipStore.getState().entries[0]!
    expect(edited).toMatchObject({ text: 'P180 lunch', day: '2026-10-07', decisions: { lunch: 'confirmed' } })
    expect(libraryRefs()[0]!.entry).toMatchObject({ kind: 'money', amount: 180, day: '2026-10-07' })
    editEntry(e!.id, { text: '   ' }) // an empty line is not saved over the text
    await flush()
    expect((await db.isipEntries.get(e!.id))!.text).toBe('P180 lunch')
  })

  it('a delete can be undone', async () => {
    const [a, b] = addEntries('one\ntwo', at('2026-10-08'))
    const gone = deleteEntries([a!.id])
    await flush()
    expect(texts()).toEqual(['two'])
    expect(await db.isipEntries.count()).toBe(1)
    restoreEntries(gone)
    await flush()
    expect(texts()).toEqual(['one', 'two'])
    expect((await rows()).map((r) => r.id)).toEqual([a!.id, b!.id])
  })

  it('a failed write puts the store back and says so', async () => {
    const spy = vi.spyOn(db.isipEntries, 'bulkPut').mockRejectedValueOnce(new Error('quota'))
    addEntries('P150 lunch', at('2026-10-08'))
    expect(texts()).toEqual(['P150 lunch'])
    await flush()
    expect(texts()).toEqual([])
    expect(toast.error).toHaveBeenCalledOnce()
    spy.mockRestore()
  })
})

describe('reading', () => {
  it('Notes are for notes: only their checklist items are read', () => {
    const task = { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: false }, content: [paragraph('essay fri')] }] }
    createNote({ title: 'Diary', content: { type: 'doc', content: [paragraph('P150 lunch'), paragraph('✓ water'), paragraph('@ fri 2pm dentist'), task] } })
    addEntries('@ fri 2pm dentist\n✓ water 2\njust a thought', at('2026-10-08'))
    expect(libraryRefs().map((r) => [r.entry.kind, r.isip ? 'isip' : 'note'])).toEqual([
      ['event', 'isip'],
      ['tick', 'isip'],
      ['task', 'note'],
    ])
  })

  it('Skip writes "skip <day>" into the event’s Entry; Done adds a ✓ Entry', async () => {
    addEntries('@ daily 6am gym', at('2026-10-08'))
    skipOccurrence(libraryRefs()[0]!, '2026-10-10')
    markDone('haircut')
    expect(texts()).toEqual(['@ daily 6am gym skip oct 10', '✓ haircut'])
  })
})

describe('backup', () => {
  it('a .tala backup restores every Entry exactly', async () => {
    addEntries('P150 lunch gcash\n@ thu 2pm dentist !30m', at('2026-10-08'))
    const [e] = addEntries('bench 60x5x3 @8', at('2026-10-09', '18:30'), '2026-10-08')
    useIsipStore.setState((s) => ({ entries: s.entries.map((x) => (x.id === e!.id ? { ...x, decisions: { bench: 'confirmed' } } : x)) }))
    editEntry(e!.id, { text: 'bench 62.5x5x3 @8' }, at('2026-10-09', '19:00'))
    await flush()
    const before = await rows()
    expect(before).toHaveLength(3)

    const backup = await importBackupFile(new File([await snapshotToZip(await dump())], 'x.tala'))
    db.close()
    await Dexie.delete('tala')
    await db.open()
    expect(await db.isipEntries.count()).toBe(0)
    await restore(backupToSnapshot(backup), 'replace')
    expect(await rows()).toEqual(before)
    await loadIsip()
    expect(useIsipStore.getState().entries).toEqual(before)
  })

  it('drops malformed Entries from a backup', async () => {
    const { parseBackup } = await import('@/utils/exportImport')
    const parsed = parseBackup(
      JSON.stringify({
        app: 'tala', version: 3, notes: [], folders: [], tags: [],
        isipEntries: [
          { id: 'ok', text: 'kape 120', day: '2026-10-08', createdAt: 5, updatedAt: 6, decisions: { kape: 'confirmed', x: 'maybe' } },
          { id: 'no-day', text: 'P1', createdAt: 1 },
          { text: 'no id', day: '2026-10-08' },
          'junk',
        ],
      }),
    )
    expect(parsed.isipEntries).toEqual([{ id: 'ok', text: 'kape 120', day: '2026-10-08', createdAt: 5, updatedAt: 6, decisions: { kape: 'confirmed' } }])
  })
})
