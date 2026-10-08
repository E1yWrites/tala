import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import type { InkDoc } from '@/types/ink'
import { scanEntries } from '@/entries/scan'
import { importBackupFile, snapshotToZip } from '@/utils/exportImport'
import { appendLine, todayPage } from './journal'
import { duplicateNote, flush, markOnDisk, saveInk, trashNotes } from './notes'
import { listTasks } from './tasks'
import { dump } from './snapshot'

const at = (d: string, h = 9): number => new Date(`${d}T${String(h).padStart(2, '0')}:00:00`).getTime()
const notes = () => useNoteStore.getState().notes
const pagesOf = (id: string) => usePageStore.getState().pagesByNote[id] ?? []
const entries = () => scanEntries(notes(), usePageStore.getState().pagesByNote, useNoteStore.getState().inkDocs)

beforeEach(async () => {
  await flush() // the last test's queued writes must not land in this one's database
  db.close()
  await Dexie.delete('tala')
  await db.open()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  markOnDisk([])
})

describe('todayPage', () => {
  it('makes one note per month and one page per day, only when asked', async () => {
    expect(notes()).toHaveLength(0)
    const a = todayPage(at('2026-10-08'))
    const again = todayPage(at('2026-10-08', 21))
    const b = todayPage(at('2026-10-09'))
    const nov = todayPage(at('2026-11-01'))

    expect(again).toEqual(a)
    expect(b.noteId).toBe(a.noteId)
    expect(nov.noteId).not.toBe(a.noteId)
    const oct = notes().find((n) => n.id === a.noteId)!
    expect(oct).toMatchObject({ title: 'October 2026', journal: '2026-10' })
    expect(pagesOf(a.noteId).map((p) => p.day)).toEqual(['2026-10-08', '2026-10-09'])

    await flush()
    expect(await db.notes.get(a.noteId)).toMatchObject({ journal: '2026-10' })
    expect((await db.pages.where('noteId').equals(a.noteId).toArray()).map((p) => p.day).sort()).toEqual(['2026-10-08', '2026-10-09'])
  })

  it('starts a fresh month note when the old one is in the trash', () => {
    const a = todayPage(at('2026-10-08'))
    trashNotes([a.noteId])
    expect(todayPage(at('2026-10-08')).noteId).not.toBe(a.noteId)
  })
})

describe('appendLine', () => {
  it('writes entries, tasks and prose as the last lines of the day, pinned to it', async () => {
    appendLine('P150 lunch gcash', at('2026-10-08'))
    appendLine('[ ] essay fri', at('2026-10-08'))
    const { noteId, saved } = appendLine('just a thought', at('2026-10-08'))
    expect(await saved).toBe('saved')

    expect(pagesOf(noteId)[0]!.text).toBe('P150 lunch gcash essay fri just a thought')
    expect(listTasks(notes(), usePageStore.getState().pagesByNote).map((t) => t.text)).toEqual(['essay fri'])
    expect(entries().map((e) => e.entry)).toEqual([
      { kind: 'money', flow: 'out', amount: 150, account: 'gcash', text: 'lunch', day: '2026-10-08' },
      { kind: 'task', text: 'essay', when: { day: '2026-10-09' } },
    ])
  })

  it('keeps "fri" meaning the Friday of the day it was written', () => {
    appendLine('[ ] essay fri', at('2026-10-08'))
    appendLine('[ ] report fri', at('2026-10-13'))
    expect(entries().map((e) => e.entry.kind === 'task' && e.entry.when?.day)).toEqual(['2026-10-09', '2026-10-16'])
  })
})

describe('journal data', () => {
  it('a duplicate is an ordinary note, not a second journal for the month', () => {
    const { noteId } = appendLine('P150 lunch', at('2026-10-08'))
    const copy = duplicateNote(noteId)!
    expect(copy.journal).toBeUndefined()
    expect(todayPage(at('2026-10-08')).noteId).toBe(noteId)
  })

  it('hand-drawn entries count while any of their strokes is left', () => {
    const { noteId, pageId } = appendLine('note', at('2026-10-08'))
    const doc = (ids: string[]): InkDoc => ({
      v: 1,
      width: 700,
      height: 900,
      strokes: ids.map((id) => ({ id, tool: 'pen', color: '#000', size: 2, points: [] })),
      entries: [{ id: 'e1', strokeIds: ['s1', 's2'], line: 'P85 jeep', at: '2026-10-08' }],
    })
    saveInk(noteId, pageId, doc(['s1', 's2']))
    expect(entries().filter((e) => e.ink).map((e) => e.entry)).toEqual([
      { kind: 'money', flow: 'out', amount: 85, text: 'jeep', day: '2026-10-08' },
    ])
    saveInk(noteId, pageId, doc(['s2']))
    expect(entries().filter((e) => e.ink)).toHaveLength(1)
    saveInk(noteId, pageId, doc([]))
    expect(entries().filter((e) => e.ink)).toHaveLength(0)
  })

  it('survives a .tala backup round trip', async () => {
    const { noteId, pageId } = appendLine('P150 lunch', at('2026-10-08'))
    saveInk(noteId, pageId, {
      v: 1,
      width: 700,
      height: 900,
      strokes: [{ id: 's1', tool: 'pen', color: '#000', size: 2, points: [] }],
      entries: [{ id: 'e1', strokeIds: ['s1'], line: 'P85 jeep', at: '2026-10-08' }],
    })
    await flush()
    const backup = await importBackupFile(new File([await snapshotToZip(await dump())], 'x.tala'))
    expect(backup.notes).toMatchObject([{ journal: '2026-10' }])
    expect(backup.pages?.[0]).toMatchObject({ day: '2026-10-08' })
    expect(backup.pages?.[0]?.content?.content?.[0]?.attrs).toEqual({ at: '2026-10-08' })
    expect(backup.inkDocs?.[0]?.doc.entries).toEqual([{ id: 'e1', strokeIds: ['s1'], line: 'P85 jeep', at: '2026-10-08' }])
  })
})
