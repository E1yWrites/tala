import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { useFolderStore } from '@/store/folderStore'
import { useTagStore } from '@/store/tagStore'
import type { InkDoc } from '@/types/ink'
import type { Note } from '@/types/models'
import { importBackupFile, parseBackup, snapshotToZip } from '@/utils/exportImport'
import { load } from './boot'
import {
  addPage,
  clearAll,
  createNote,
  createPdfNote,
  deleteForever,
  deletePage,
  duplicateNote,
  duplicatePage,
  flush,
  markOnDisk,
  patchNote,
  saveInk,
  savePageContent,
  saveTitle,
  setTemplate,
  trashNotes,
} from './notes'
import { keepSafetyCopy, settleSafetyCopy } from './safety'
import { removeFolders, removeTag } from './references'
import { dump, restore, wipe } from './snapshot'

const doc = (text: string) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
})
const ink = (n = 1): InkDoc =>
  ({ version: 1, width: 700, strokes: Array.from({ length: n }, (_, i) => ({ id: `s${i}` })) }) as unknown as InkDoc

const pagesOf = (noteId: string) => usePageStore.getState().pagesByNote[noteId] ?? []
const note = (id: string) => useNoteStore.getState().notes.find((n) => n.id === id)!

// load() applies the theme to <html>; node has no DOM
;(globalThis as { document?: unknown }).document ??= { documentElement: { classList: { toggle() {} } } }

beforeEach(async () => {
  db.close()
  await Dexie.delete('tala')
  await Dexie.delete('tala-safety')
  await db.open()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  useFolderStore.setState({ folders: [] })
  useTagStore.setState({ tags: [] })
  markOnDisk([])
})

describe('scratch cards and materializing', () => {
  it('an untouched new note never reaches IndexedDB', async () => {
    const n = createNote()
    expect(note(n.id)).toBeTruthy()
    expect(pagesOf(n.id)).toHaveLength(1)
    await flush()
    expect(await db.notes.count()).toBe(0)
    expect(await db.pages.count()).toBe(0)
  })

  it('typing writes the note, its page and the text', async () => {
    const n = createNote()
    expect(await savePageContent(n.id, n.id, doc('hello'))).toBe('saved')
    const page = await db.pages.get(n.id)
    expect(page).toMatchObject({ noteId: n.id, text: 'hello', content: doc('hello') })
    expect(await db.notes.get(n.id)).toBeTruthy()
  })

  it('a title alone is enough to save', async () => {
    const n = createNote()
    expect(await saveTitle(n.id, 'Biology')).toBe('saved')
    expect((await db.notes.get(n.id))!.title).toBe('Biology')
  })

  it('ink on page 2 alone makes the note real (it used to look empty)', async () => {
    const n = createNote()
    const p2 = addPage(n.id)
    saveInk(n.id, p2.id, ink())
    await flush()
    expect(await db.notes.get(n.id)).toBeTruthy()
    expect(await db.pages.where('noteId').equals(n.id).count()).toBe(2)
    expect((await db.inkDocs.get(p2.id))!.doc.strokes).toHaveLength(1)
  })

  it('a saved note emptied by the user still saves the emptiness', async () => {
    const n = createNote()
    await savePageContent(n.id, n.id, doc('keep me'))
    await savePageContent(n.id, n.id, { type: 'doc', content: [{ type: 'paragraph' }] })
    expect((await db.pages.get(n.id))!.text).toBe('')
  })

  it('templates save at once', async () => {
    const n = createNote({ title: '', content: doc('template body') })
    await flush()
    expect(await db.notes.get(n.id)).toBeTruthy()
    expect((await db.pages.get(n.id))!.text).toBe('template body')
  })

  it('metadata edits on a scratch card stay in memory', async () => {
    const n = createNote()
    expect(await patchNote(n.id, { isPinned: true })).toBe('scratch')
    expect(await db.notes.count()).toBe(0)
  })
})

describe('pages', () => {
  it('duplicatePage copies text and ink under a new id', async () => {
    const n = createNote()
    await savePageContent(n.id, n.id, doc('slide one'))
    saveInk(n.id, n.id, ink(2))
    const copy = duplicatePage(n.id, n.id)!
    await flush()
    expect(copy.id).not.toBe(n.id)
    expect(copy.index).toBe(1)
    const row = (await db.pages.get(copy.id))!
    expect(row.text).toBe('slide one')
    expect((await db.inkDocs.get(copy.id))!.doc.strokes).toHaveLength(2)
    // editing the copy leaves the original alone
    await savePageContent(n.id, copy.id, doc('changed'))
    expect((await db.pages.get(n.id))!.text).toBe('slide one')
  })

  it('deletePage removes the page and its ink, and keeps at least one page', async () => {
    const n = createNote()
    await savePageContent(n.id, n.id, doc('x'))
    const p2 = addPage(n.id)
    saveInk(n.id, p2.id, ink())
    await flush()
    deletePage(n.id, p2.id)
    await flush()
    expect(await db.pages.get(p2.id)).toBeUndefined()
    expect(await db.inkDocs.get(p2.id)).toBeUndefined()
    deletePage(n.id, n.id) // the last page stays
    await flush()
    expect(await db.pages.count()).toBe(1)
  })

  it('addPage keeps indexes dense', async () => {
    const n = createNote()
    await savePageContent(n.id, n.id, doc('x'))
    addPage(n.id)
    addPage(n.id, 'ruled', 0)
    await flush()
    const rows = await db.pages.where('noteId').equals(n.id).sortBy('index')
    expect(rows.map((p) => p.index)).toEqual([0, 1, 2])
    expect(rows[0]!.template).toBe('ruled')
  })

  it('a new page copies the page above it, and is a blank A4 under a PDF page', async () => {
    const n = createNote()
    setTemplate(n.id, n.id, 'grid')
    expect(addPage(n.id).template).toBe('grid')
    const pdf = await createPdfNote({
      title: 'slides',
      folderId: null,
      pdf: new Blob(['%PDF-fake'], { type: 'application/pdf' }),
      pages: [{ w: 960, h: 540, text: 'one' }],
    })
    const inserted = addPage(pdf.id, undefined, 1)
    expect(inserted.template).toBe('blank')
    expect(inserted.size?.kind).toBe('a4')
    expect(pagesOf(pdf.id).map((p) => p.id)).toEqual([pdf.id, inserted.id])
  })
})

describe('delete cascades leave no orphans', () => {
  async function counts() {
    return {
      notes: await db.notes.count(),
      pages: await db.pages.count(),
      ink: await db.inkDocs.count(),
      pdfs: await db.pdfs.count(),
      blobs: await db.blobs.count(),
    }
  }

  it('deleteForever removes pages, ink, the PDF and its blob', async () => {
    const pdfNote = await createPdfNote({
      title: 'slides',
      folderId: null,
      pdf: new Blob(['%PDF-fake'], { type: 'application/pdf' }),
      pages: [
        { w: 595, h: 842, text: 'intro' },
        { w: 595, h: 842, text: 'details' },
      ],
    })
    saveInk(pdfNote.id, pagesOf(pdfNote.id)[1]!.id, ink())
    await flush()
    expect(await counts()).toEqual({ notes: 1, pages: 2, ink: 1, pdfs: 1, blobs: 1 })
    await deleteForever([pdfNote.id])
    expect(await counts()).toEqual({ notes: 0, pages: 0, ink: 0, pdfs: 0, blobs: 0 })
    expect(useNoteStore.getState().notes).toHaveLength(0)
    expect(usePageStore.getState().pagesByNote).toEqual({})
  })

  it('a duplicated PDF note shares the original; the blob outlives the first delete', async () => {
    const a = await createPdfNote({
      title: 'slides',
      folderId: null,
      pdf: new Blob(['%PDF-fake']),
      pages: [{ w: 100, h: 100, text: '' }],
    })
    const b = duplicateNote(a.id)!
    await flush()
    expect((await db.pdfs.get(b.id))!.blobId).toBe((await db.pdfs.get(a.id))!.blobId)
    expect(await db.blobs.count()).toBe(1)
    await deleteForever([a.id])
    expect(await db.blobs.count()).toBe(1)
    await deleteForever([b.id])
    expect(await db.blobs.count()).toBe(0)
  })

  it('deleting a page frees its raster background when nothing else uses it', async () => {
    const n = createNote({ title: 'bg' })
    await flush()
    await db.blobs.put({ id: 'img', data: new Blob(['x']) })
    const p2 = addPage(n.id)
    await flush()
    await db.pages.update(p2.id, { backgroundBlobId: 'img' })
    usePageStore.setState((s) => ({
      pagesByNote: {
        ...s.pagesByNote,
        [n.id]: s.pagesByNote[n.id]!.map((p) => (p.id === p2.id ? { ...p, backgroundBlobId: 'img' } : p)),
      },
    }))
    deletePage(n.id, p2.id)
    await flush()
    expect(await db.blobs.count()).toBe(0)
  })

  it('clearAll empties the library tables but keeps folders', async () => {
    const n = createNote({ title: 'a' })
    saveInk(n.id, n.id, ink())
    await db.folders.put({ id: 'f', name: 'F', parentId: null, createdAt: 1 })
    await flush()
    await clearAll()
    expect(await counts()).toEqual({ notes: 0, pages: 0, ink: 0, pdfs: 0, blobs: 0 })
    expect(await db.folders.count()).toBe(1)
  })

  it('removing a folder moves every note in it (trashed too) to the root', async () => {
    await db.folders.bulkPut([
      { id: 'f1', name: 'one', parentId: null, createdAt: 1 },
      { id: 'f2', name: 'two', parentId: 'f1', createdAt: 1 },
    ])
    const live = createNote({ title: 'live', folderId: 'f2' })
    const trashed = createNote({ title: 'trashed', folderId: 'f1' })
    trashNotes([trashed.id])
    await flush()
    await removeFolders(['f1', 'f2'])
    expect((await db.notes.get(live.id))!.folderId).toBeNull()
    expect((await db.notes.get(trashed.id))!.folderId).toBeNull()
    expect(note(live.id).folderId).toBeNull()
    expect(await db.folders.count()).toBe(0)
  })

  it('removing a tag strips it from notes', async () => {
    await db.tags.put({ id: 't', name: 'exam', color: 'blue', createdAt: 1 })
    const n = createNote({ title: 'tagged', tagIds: ['t'] })
    await flush()
    await removeTag('t')
    expect((await db.notes.get(n.id))!.tagIds).toEqual([])
    expect(note(n.id).tagIds).toEqual([])
    expect(await db.tags.count()).toBe(0)
  })
})

describe('duplicateNote', () => {
  it('clones pages and ink; page 1 keeps id === note id', async () => {
    const n = createNote()
    await savePageContent(n.id, n.id, doc('page one'))
    const p2 = addPage(n.id)
    await savePageContent(n.id, p2.id, doc('page two'))
    saveInk(n.id, p2.id, ink(3))
    await flush()
    const copy = duplicateNote(n.id)!
    await flush()
    const rows = await db.pages.where('noteId').equals(copy.id).sortBy('index')
    expect(rows.map((p) => p.text)).toEqual(['page one', 'page two'])
    expect(rows[0]!.id).toBe(copy.id)
    expect(rows[1]!.id).not.toBe(p2.id)
    expect((await db.inkDocs.get(rows[1]!.id))!.doc.strokes).toHaveLength(3)
    expect((await db.notes.get(copy.id))!.content).toBeNull()
    expect(copy.title).toBe('Untitled (copy)')
  })
})

describe('backup round trip', () => {
  it('dump → .tala zip → parse → restore(replace) reproduces the library, blobs included', async () => {
    const n = createNote({ title: 'trip' })
    await savePageContent(n.id, n.id, doc('body'))
    saveInk(n.id, n.id, ink(2))
    const pdf = await createPdfNote({
      title: 'pdf',
      folderId: null,
      pdf: new Blob(['%PDF-bytes'], { type: 'application/pdf' }),
      pages: [{ w: 595, h: 842, text: 'p1' }],
    })
    await flush()
    const before = await dump()

    const zip = await snapshotToZip(before)
    const backup = await importBackupFile(new File([zip], 'x.tala'))
    expect(backup.version).toBe(3)
    expect(backup.blobData).toHaveLength(1)

    await restore(
      {
        notes: backup.notes,
        folders: backup.folders,
        tags: backup.tags,
        settings: [],
        inkDocs: backup.inkDocs,
        pages: backup.pages,
        pdfs: backup.pdfs,
        blobs: backup.blobData,
      },
      'replace',
    )
    const after = await dump()
    const key = (s: typeof before) => ({
      notes: s.notes.map((x) => x.id).sort(),
      pages: s.pages.map((x) => [x.id, x.text, x.pdfPage]).sort(),
      ink: s.inkDocs.map((x) => [x.noteId, x.doc.strokes.length]).sort(),
      pdfs: s.pdfs,
    })
    expect(key(after)).toEqual(key(before))
    expect(await after.blobs[0]!.data.text()).toBe('%PDF-bytes')
    expect(pdf.id).toBeTruthy()
  })

  it('merge replaces a colliding note\'s old pages instead of mixing them', async () => {
    const n = createNote({ title: 'same' })
    await savePageContent(n.id, n.id, doc('local'))
    const extra = addPage(n.id)
    saveInk(n.id, extra.id, ink())
    await flush()

    const incoming = parseBackup(
      JSON.stringify({
        app: 'tala',
        version: 3,
        notes: [{ ...(await db.notes.get(n.id))!, title: 'from backup' }],
        folders: [],
        tags: [],
        pages: [{ id: n.id, noteId: n.id, index: 0, template: 'blank', content: doc('remote'), text: 'remote' }],
      }),
    )
    await restore({ notes: incoming.notes, folders: [], tags: [], pages: incoming.pages }, 'merge')
    const rows = await db.pages.where('noteId').equals(n.id).toArray()
    expect(rows).toHaveLength(1)
    expect(rows[0]!.text).toBe('remote')
    expect(await db.inkDocs.count()).toBe(0)
    expect((await db.notes.get(n.id))!.title).toBe('from backup')
  })

  it('a pre-v4 backup (text on the note, no pages) lands on page 1', async () => {
    const legacy = JSON.stringify({
      app: 'tala',
      version: 2,
      notes: [
        {
          id: 'old',
          title: 'Old note',
          content: doc('written long ago'),
          folderId: null,
          tagIds: [],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      folders: [],
      tags: [],
    })
    const backup = parseBackup(legacy)
    await restore({ notes: backup.notes, folders: [], tags: [], pages: backup.pages }, 'replace')
    const page = (await db.pages.get('old'))!
    expect(page.text).toBe('written long ago')
    expect(page.content).toEqual(doc('written long ago'))
  })

  it('a v1 backup\'s inline ink moves to inkDocs and is not stored twice', () => {
    const b = parseBackup(
      JSON.stringify({
        app: 'tala',
        version: 1,
        notes: [{ id: 'n', title: 't', ink: ink(1) }],
        folders: [],
        tags: [],
      }),
    )
    expect(b.inkDocs).toHaveLength(1)
    expect(b.inkDocs![0]).toMatchObject({ noteId: 'n' })
    expect(b.notes[0]!.ink).toBeNull()
  })

  it('parseBackup drops malformed pages instead of crashing', () => {
    const b = parseBackup(
      JSON.stringify({
        app: 'tala',
        version: 3,
        notes: [],
        folders: [],
        tags: [],
        pages: [null, { id: 'p', noteId: 'n', index: 'x', size: { w: -1, h: 5, kind: 'bad' } }, 'junk'],
      }),
    )
    expect(b.pages).toHaveLength(1)
    expect(b.pages![0]!.size).toBeUndefined()
  })
})

describe('load()', () => {
  it('revives orphaned ink once, not page 2+ ink as ghost notes', async () => {
    const n = createNote({ title: 'real' })
    const p2 = addPage(n.id)
    saveInk(n.id, p2.id, ink())
    // handwriting whose note row never landed (reload in the debounce window)
    await db.inkDocs.put({ noteId: 'lost', doc: ink(2) })
    await flush()

    await load()
    const ids = useNoteStore.getState().notes.map((x) => x.id).sort()
    expect(ids).toEqual([n.id, 'lost'].sort())
    expect(pagesOf('lost')).toHaveLength(1)
    // idempotent: a second boot adds nothing
    await load()
    expect(useNoteStore.getState().notes).toHaveLength(2)
    expect(await db.notes.count()).toBe(2)
  })

  it('nulls dangling folder/tag references and persists the repair', async () => {
    await db.notes.put({
      id: 'n', title: 't', content: null, ink: null, folderId: 'gone', tagIds: ['dead'],
      isPinned: false, isFavorite: false, isArchived: false, isDeleted: false, deletedAt: null,
      createdAt: 1, updatedAt: 1,
    } as Note)
    await load()
    expect(note('n').folderId).toBeNull()
    expect(note('n').tagIds).toEqual([])
    expect((await db.notes.get('n'))!.folderId).toBeNull()
  })

  it('does not load blobs or PDFs into memory', async () => {
    await createPdfNote({ title: 'p', folderId: null, pdf: new Blob(['x']), pages: [{ w: 1, h: 1, text: '' }] })
    await load()
    expect(JSON.stringify(usePageStore.getState().pagesByNote)).not.toContain('blob')
  })
})

describe('safety copy before the v4 upgrade', () => {
  async function seedV2(): Promise<void> {
    db.close()
    await Dexie.delete('tala')
    const old = new Dexie('tala')
    old.version(1).stores({ notes: 'id, folderId, updatedAt, isDeleted', folders: 'id, name', tags: 'id, name', settings: 'key' })
    old.version(2).stores({ inkDocs: 'noteId' })
    await old.open()
    await old.table('notes').put({ id: 'n1', title: 'before', content: doc('precious'), ink: null, folderId: null, tagIds: [] })
    old.close()
  }

  it('keeps a restorable .tala copy, then expires it after three clean boots', async () => {
    await seedV2()
    expect(await keepSafetyCopy()).toBe(true)

    const safety = new Dexie('tala-safety')
    safety.version(1).stores({ copies: 'id' })
    const copy = await safety.table('copies').get('pre-v4')
    safety.close()
    const backup = parseBackup(await (await import('jszip')).default.loadAsync(await copy.zip.arrayBuffer()).then((z) => z.file('backup.json')!.async('string')))
    expect(backup.notes[0]!.title).toBe('before')
    expect(backup.notes[0]!.content).toEqual(doc('precious'))

    // the real upgrade still works afterwards
    await db.open()
    expect((await db.pages.get('n1'))!.text).toBe('precious')

    await settleSafetyCopy(true) // boot 1 (the toast boot)
    expect(await Dexie.exists('tala-safety')).toBe(true)
    await settleSafetyCopy(false) // boot 2
    expect(await Dexie.exists('tala-safety')).toBe(true)
    await settleSafetyCopy(false) // boot 3
    expect(await Dexie.exists('tala-safety')).toBe(false)
  })

  it('wipe() erases the safety copy along with the library', async () => {
    await seedV2()
    expect(await keepSafetyCopy()).toBe(true)
    await db.open()
    await wipe()
    expect(await Dexie.exists('tala')).toBe(false)
    expect(await Dexie.exists('tala-safety')).toBe(false)
  })

  it('makes no copy for a fresh install or an already-v4 database', async () => {
    db.close()
    await Dexie.delete('tala')
    expect(await keepSafetyCopy()).toBe(false)
    await db.open()
    db.close()
    expect(await keepSafetyCopy()).toBe(false)
    expect(await Dexie.exists('tala-safety')).toBe(false)
  })
})
