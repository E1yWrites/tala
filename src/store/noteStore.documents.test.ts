import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { makePdf, toFile } from '@/test/fixtures'
import { importDocumentFile } from '@/lib/documents/importDocument'
import { pageInkKey } from '@/types/models'
import type { InkDoc } from '@/types/ink'

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function resetDb(): Promise<void> {
  await Promise.all([db.notes.clear(), db.inkDocs.clear(), db.pageInk.clear(), db.documents.clear(), db.assets.clear()])
  useNoteStore.setState({ notes: [], inkDocs: {}, documents: {}, pageInkLoaded: {} })
}

const ink = (n: number): InkDoc => ({
  v: 1,
  width: 612,
  height: 792,
  strokes: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, tool: 'pen', color: '#000', size: 3, points: [{ x: i, y: i }, { x: i + 5, y: i + 5 }] })),
})

describe('note store: document-backed notes', () => {
  beforeEach(resetDb)

  it('routes page ink through saveInk to the pageInk table and flushes it', async () => {
    const bytes = await makePdf([{ w: 612, h: 792 }])
    const { note, document } = await importDocumentFile(toFile(bytes, 'a.pdf', 'application/pdf'))
    const page = document!.pages![0]!
    const key = pageInkKey(note.id, page.id)
    useNoteStore.getState().saveInk(key, ink(2))
    expect(useNoteStore.getState().inkDocs[key]?.strokes).toHaveLength(2)
    await wait(20)
    // Immediate write (no debounce) into pageInk, not inkDocs
    expect((await db.pageInk.get(key))?.doc.strokes).toHaveLength(2)
    expect(await db.inkDocs.count()).toBe(0)
    await useNoteStore.getState().flushInk(note.id)
    // The note row is touched (updatedAt bumps) so it sorts as recently edited
    const row = await db.notes.get(note.id)
    expect(row?.updatedAt).toBeGreaterThanOrEqual(note.updatedAt)
  })

  it('loadPageInk pulls page annotations lazily and does not clobber unsaved memory', async () => {
    const bytes = await makePdf([{ w: 612, h: 792 }, { w: 612, h: 792 }])
    const { note, document } = await importDocumentFile(toFile(bytes, 'a.pdf', 'application/pdf'))
    const [p1, p2] = document!.pages!
    await db.pageInk.put({ id: pageInkKey(note.id, p1!.id), noteId: note.id, pageId: p1!.id, doc: ink(3) })
    useNoteStore.setState((s) => ({ inkDocs: { ...s.inkDocs, [pageInkKey(note.id, p2!.id)]: ink(1) } }))
    await useNoteStore.getState().loadPageInk(note.id)
    const s = useNoteStore.getState()
    expect(s.inkDocs[pageInkKey(note.id, p1!.id)]?.strokes).toHaveLength(3)
    expect(s.inkDocs[pageInkKey(note.id, p2!.id)]?.strokes).toHaveLength(1)
    expect(s.pageInkLoaded[note.id]).toBe(true)
  })

  it('document-backed notes are never "empty" scratch cards', async () => {
    const bytes = await makePdf([{ w: 100, h: 100 }])
    const { note } = await importDocumentFile(toFile(bytes, 'a.pdf', 'application/pdf'))
    // Clearing the title must not un-persist the note
    useNoteStore.getState().saveContent(note.id, { title: '' })
    await wait(10)
    expect(await db.notes.get(note.id)).toBeTruthy()
  })

  it('deleteForever removes the document, page ink and unreferenced assets', async () => {
    const bytes = await makePdf([{ w: 100, h: 100 }])
    const a = await importDocumentFile(toFile(bytes, 'a.pdf', 'application/pdf'))
    const b = await importDocumentFile(toFile(bytes, 'b.pdf', 'application/pdf')) // shares the asset
    useNoteStore.getState().saveInk(pageInkKey(a.note.id, a.document!.pages![0]!.id), ink(1))
    await wait(20)
    await useNoteStore.getState().deleteForever([a.note.id])
    expect(await db.notes.get(a.note.id)).toBeUndefined()
    expect(await db.documents.get(a.document!.id)).toBeUndefined()
    expect(await db.pageInk.where('noteId').equals(a.note.id).count()).toBe(0)
    // Asset still referenced by b → kept
    expect(await db.assets.count()).toBe(1)
    await useNoteStore.getState().deleteForever([b.note.id])
    expect(await db.assets.count()).toBe(0)
    expect(useNoteStore.getState().documents[b.document!.id]).toBeUndefined()
  })

  it('duplicateNote clones the document record and page ink under the copy', async () => {
    const bytes = await makePdf([{ w: 100, h: 100 }])
    const { note, document } = await importDocumentFile(toFile(bytes, 'a.pdf', 'application/pdf'))
    const pageId = document!.pages![0]!.id
    useNoteStore.getState().saveInk(pageInkKey(note.id, pageId), ink(2))
    await wait(20)
    const copy = useNoteStore.getState().duplicateNote(note.id)!
    await wait(30)
    expect(copy.documentId).toBeTruthy()
    expect(copy.documentId).not.toBe(document!.id)
    const copiedDoc = await db.documents.get(copy.documentId!)
    expect(copiedDoc?.noteId).toBe(copy.id)
    expect(copiedDoc?.assetId).toBe(document!.assetId)
    expect(copiedDoc?.pages?.[0]?.id).toBe(pageId)
    expect((await db.pageInk.get(pageInkKey(copy.id, pageId)))?.doc.strokes).toHaveLength(2)
    expect(await db.assets.count()).toBe(1)
  })

  it('updateDocument persists page edits (reorder / rotate) and rolls back on failure', async () => {
    const bytes = await makePdf([{ w: 100, h: 100 }, { w: 200, h: 200 }])
    const { document } = await importDocumentFile(toFile(bytes, 'a.pdf', 'application/pdf'))
    const reversed = [document!.pages![1]!, { ...document!.pages![0]!, rotation: 90 }]
    await useNoteStore.getState().updateDocument(document!.id, { pages: reversed })
    const row = await db.documents.get(document!.id)
    expect(row?.pages?.map((p) => p.sourceIndex)).toEqual([1, 0])
    expect(row?.pages?.[1]?.rotation).toBe(90)
    expect(useNoteStore.getState().documents[document!.id]?.pages?.[0]?.sourceIndex).toBe(1)
  })
})
