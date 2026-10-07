import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import type { Note, PageRecord } from '@/types/models'
import { dataUrlToBlob, upgradePages } from './migrate'

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})

const note = (id: string, patch: Partial<Note> = {}): Note => ({
  id,
  title: id,
  content: null,
  ink: null,
  folderId: null,
  tagIds: [],
  isPinned: false,
  isFavorite: false,
  isArchived: false,
  isDeleted: false,
  deletedAt: null,
  createdAt: 1,
  updatedAt: 2,
  ...patch,
})

const ink = { version: 1, width: 700, strokes: [{ id: 's1' }] }

/** Opens a raw database exactly as an older release declared it. */
async function seedOld(version: 1 | 2 | 3 | 4, fill: (old: Dexie) => Promise<void>): Promise<void> {
  db.close()
  await Dexie.delete('tala')
  const old = new Dexie('tala')
  old.version(1).stores({
    notes: 'id, folderId, updatedAt, isDeleted',
    folders: 'id, name',
    tags: 'id, name',
    settings: 'key',
  })
  if (version >= 2) old.version(2).stores({ inkDocs: 'noteId' })
  if (version >= 3) {
    old.version(3).stores({ folders: 'id, name, parentId', pages: 'id, noteId, [noteId+index]', pdfs: 'noteId' })
  }
  if (version >= 4) old.version(4).stores({ blobs: 'id' })
  await old.open()
  await fill(old)
  old.close()
}

beforeEach(async () => {
  db.close()
  await Dexie.delete('tala')
})

describe('upgradePages', () => {
  it('copies Note.content into page 1 and leaves the note alone', () => {
    const n = note('a', { content: doc('hello world') })
    const { pages } = upgradePages([n], [])
    expect(pages).toHaveLength(1)
    expect(pages[0]).toMatchObject({ id: 'a', noteId: 'a', index: 0, content: n.content, text: 'hello world' })
    expect(pages[0]!.size).toEqual({ w: 595, h: 842, kind: 'a4' })
    expect(n.content).not.toBeNull()
  })

  it('does not touch rows that are already upgraded', () => {
    const n = note('a', { content: doc('old') })
    const done: PageRecord = {
      id: 'a', noteId: 'a', index: 0, template: 'blank', content: doc('new'), text: 'new',
      size: { w: 1, h: 1, kind: 'a4' }, createdAt: 1, updatedAt: 1,
    }
    expect(upgradePages([n], [done]).pages).toEqual([])
  })

  it('gives later pages empty content, not page 1 text', () => {
    const n = note('a', { content: doc('first') })
    const p = (id: string, index: number): PageRecord => ({ id, noteId: 'a', index, template: 'blank', createdAt: 1, updatedAt: 1 })
    const { pages } = upgradePages([n], [p('a', 0), p('b', 1)])
    expect(pages.find((x) => x.id === 'a')!.text).toBe('first')
    expect(pages.find((x) => x.id === 'b')).toMatchObject({ content: null, text: '' })
  })

  it('moves a data-URL background into a blob', async () => {
    const n = note('a')
    const page: PageRecord = {
      id: 'a', noteId: 'a', index: 0, template: 'blank', background: 'data:image/jpeg;base64,aGVsbG8=',
      createdAt: 1, updatedAt: 1,
    }
    const { pages, blobs } = upgradePages([n], [page])
    expect(pages[0]!.background).toBeNull()
    expect(pages[0]!.backgroundBlobId).toBe(blobs[0]!.id)
    expect(blobs[0]!.data.type).toBe('image/jpeg')
    expect(await blobs[0]!.data.text()).toBe('hello')
  })

  it('dataUrlToBlob rejects non-data URLs', () => {
    expect(dataUrlToBlob('https://example.com/x.png')).toBeNull()
  })
})

describe('Dexie upgrade to v5', () => {
  it('v2 → v5: every note gets a page 1 with a copy of its text; ink is untouched', async () => {
    await seedOld(2, async (old) => {
      await old.table('notes').bulkPut([
        note('typed', { content: doc('lecture one') }),
        note('inked'),
        note('blank'),
      ])
      await old.table('inkDocs').put({ noteId: 'inked', doc: ink })
    })

    await db.open()
    expect(db.verno).toBe(5)

    const pages = await db.pages.toArray()
    expect(pages.map((p) => p.id).sort()).toEqual(['blank', 'inked', 'typed'])
    const typed = pages.find((p) => p.id === 'typed')!
    expect(typed.content).toEqual(doc('lecture one'))
    expect(typed.text).toBe('lecture one')
    expect(typed.size?.kind).toBe('a4')

    // copy, not move
    expect((await db.notes.get('typed'))!.content).toEqual(doc('lecture one'))
    // ink needs no rewrite: still keyed by page id == note id
    expect((await db.inkDocs.get('inked'))!.doc).toEqual(ink)
  })

  it('v1 → v4: inline ink is moved to inkDocs and the note still gets a page', async () => {
    await seedOld(1, async (old) => {
      await old.table('notes').put(note('legacy', { ink: ink as never, content: doc('v1 text') }))
    })

    await db.open()
    expect((await db.inkDocs.get('legacy'))!.doc).toEqual(ink)
    expect((await db.pages.get('legacy'))!.text).toBe('v1 text')
  })

  it('v3 (unreleased pages build) → v4: multi-page notes and PDF backgrounds survive', async () => {
    await seedOld(3, async (old) => {
      await old.table('notes').put(note('pdf', { title: 'slides' }))
      await old.table('pages').bulkPut([
        { id: 'pdf', noteId: 'pdf', index: 0, template: 'blank', background: 'data:image/jpeg;base64,YWFh', createdAt: 1, updatedAt: 1 },
        { id: 'p2', noteId: 'pdf', index: 1, template: 'blank', background: 'data:image/jpeg;base64,YmJi', createdAt: 1, updatedAt: 1 },
      ])
      await old.table('inkDocs').put({ noteId: 'p2', doc: ink })
    })

    await db.open()
    const pages = await db.pages.where('noteId').equals('pdf').sortBy('index')
    expect(pages).toHaveLength(2)
    const texts: string[] = []
    for (const p of pages) {
      expect(p.background).toBeNull()
      const blob = await db.blobs.get(p.backgroundBlobId!)
      texts.push(await blob!.data.text())
    }
    expect(texts).toEqual(['aaa', 'bbb'])
    expect((await db.inkDocs.get('p2'))!.doc).toEqual(ink)
  })

  it('opening an already-v4 database is a no-op', async () => {
    await db.open()
    await db.notes.put(note('x'))
    db.close()
    await db.open()
    expect(await db.notes.count()).toBe(1)
    expect(await db.pages.count()).toBe(0)
  })
})

describe('Dexie v4 → v5', () => {
  it('adds the audio and meta tables and leaves everything else alone', async () => {
    await seedOld(4, async (old) => {
      await old.table('notes').put(note('kept', { content: doc('still here') }))
      await old.table('pages').put({ id: 'kept', noteId: 'kept', index: 0, template: 'blank', content: doc('still here'), text: 'still here', createdAt: 1, updatedAt: 1 })
      await old.table('blobs').put({ id: 'b1', data: new Blob(['x'], { type: 'text/plain' }) })
    })

    await db.open()
    expect(db.verno).toBe(5)
    expect((await db.pages.get('kept'))!.text).toBe('still here')
    expect(await db.blobs.count()).toBe(1)

    // the new tables are usable, and chunks are found by recording id
    await db.recordings.put({ id: 'r1', noteId: 'kept', startedAt: 1, durationMs: 5000, mime: 'audio/webm', status: 'complete', chunkCount: 2, bytes: 10 })
    await db.audioChunks.bulkPut([
      { recordingId: 'r1', seq: 0, data: new Blob(['a']) },
      { recordingId: 'r1', seq: 1, data: new Blob(['b']) },
      { recordingId: 'r2', seq: 0, data: new Blob(['c']) },
    ])
    expect(await db.audioChunks.where('recordingId').equals('r1').count()).toBe(2)
    await db.meta.put({ key: 'coach:weeklyGoal', value: 4 })
    expect((await db.meta.get('coach:weeklyGoal'))!.value).toBe(4)
  })
})
