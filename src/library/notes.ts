import { toast } from 'sonner'
import type { JSONContent } from '@tiptap/core'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import type { InkDoc } from '@/types/ink'
import type { InkDocRecord, Note, PageRecord, PdfRecord } from '@/types/models'
import { docToPlainText } from '@/utils/doc'
import { createId } from '@/utils/id'
import { PAGE_SIZES } from './pageSize'

/*
  The only code that mutates or persists notes, pages, ink and the blobs they
  own. Callers get synchronous, optimistic changes (the stores update first) and
  a promise for when the write landed. Rules this module hides:

  - A Page owns its typed text; its Ink is keyed by PAGE id in `inkDocs`
    (the field is still called `noteId`, renaming a primary key needs a new
    table). The page whose id equals the note id is the legacy "page 1".
  - A note with no title, no text and no strokes is a scratch card: it lives in
    memory only until it earns content, then is written whole in one transaction.
    A note already on disk is always written, even if the user emptied it.
  - Writes run one at a time in call order, so a rollback can't interleave with
    a later change. Every failure rolls its change back and toasts.
  - Ink bytes are written immediately; only the note-row `updatedAt` touch-up
    is debounced per page (and flushed on hide/unload).
*/

export interface CreateNoteInput {
  title?: string
  content?: JSONContent | null
  folderId?: string | null
  tagIds?: string[]
}

/** `scratch`: kept in memory only. `gone`: the note or page no longer exists. */
export type SaveResult = 'saved' | 'scratch' | 'failed' | 'gone'

const INK_TOUCH_DELAY = 800

/* --------------------------------- State ---------------------------------- */

const getNote = (id: string): Note | undefined => useNoteStore.getState().notes.find((n) => n.id === id)
const getPages = (noteId: string): PageRecord[] => usePageStore.getState().pagesByNote[noteId] ?? []
const inkDocs = (): Record<string, InkDoc> => useNoteStore.getState().inkDocs

function setNote(next: Note): void {
  useNoteStore.setState((s) => ({ notes: s.notes.map((n) => (n.id === next.id ? next : n)) }))
}

function setPages(noteId: string, pages: PageRecord[]): void {
  usePageStore.setState((s) => ({ pagesByNote: { ...s.pagesByNote, [noteId]: pages } }))
}

const sortPinnedFirstUpdatedDesc = (a: Note, b: Note): number => {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
  return b.updatedAt - a.updatedAt
}

/** Which notes already have rows in IndexedDB (set by load/restore). */
let onDisk = new Set<string>()

export function markOnDisk(ids: string[]): void {
  onDisk = new Set(ids)
}

/**
 * An untitled note with no typed text and no strokes is a scratch card.
 * Ink on ANY page counts; a doc of zero strokes counts as empty (drew, then undid).
 */
export function isEmptyNote(
  note: Note,
  pages: PageRecord[],
  ink: Record<string, InkDoc>,
): boolean {
  if (note.title.trim().length > 0) return false
  return pages.every(
    (p) => (p.text ?? '').trim().length === 0 && (ink[p.id]?.strokes.length ?? 0) === 0,
  )
}

const isScratch = (noteId: string): boolean => {
  const note = getNote(noteId)
  return !!note && !onDisk.has(noteId) && isEmptyNote(note, getPages(noteId), inkDocs())
}

/* ------------------------------ Write queue ------------------------------- */

let tail: Promise<unknown> = Promise.resolve()

function enqueue(job: () => Promise<void>, what: string, undo?: () => void): Promise<boolean> {
  const run = tail.then(job).then(
    () => true,
    (err) => {
      console.error(`[tala] failed to ${what}`, err)
      undo?.()
      toast.error(`Storage error — could not ${what}`)
      return false
    },
  )
  tail = run
  return run
}

/** Writes a note that isn't on disk yet, with its pages and ink, in one transaction. */
async function writeWhole(noteId: string): Promise<void> {
  const note = getNote(noteId)
  if (!note) return
  const pages = getPages(noteId)
  const ink: InkDocRecord[] = pages.flatMap((p) => {
    const doc = inkDocs()[p.id]
    return doc ? [{ noteId: p.id, doc }] : []
  })
  await db.transaction('rw', db.notes, db.pages, db.inkDocs, async () => {
    await db.notes.put(note)
    await db.pages.bulkPut(pages)
    await db.inkDocs.bulkPut(ink)
  })
  onDisk.add(noteId)
}

/**
 * Persists a change to `noteId`: scratch cards stay in memory, a first real
 * change writes the whole note, anything later runs the targeted `write`.
 */
async function commit(
  noteId: string,
  what: string,
  write: () => Promise<void>,
  undo?: () => void,
): Promise<SaveResult> {
  const note = getNote(noteId)
  if (!note) return 'gone'
  if (!onDisk.has(noteId)) {
    if (isScratch(noteId)) return 'scratch'
    return (await enqueue(() => writeWhole(noteId), what, undo)) ? 'saved' : 'failed'
  }
  return (await enqueue(write, what, undo)) ? 'saved' : 'failed'
}

/** Deletes blobs that no page or PDF references any more. Run inside a transaction. */
async function dropUnusedBlobs(candidates: Array<string | undefined>): Promise<void> {
  const unused = new Set(candidates.filter((id): id is string => !!id))
  if (unused.size === 0) return
  await db.pages.each((p) => {
    if (p.backgroundBlobId) unused.delete(p.backgroundBlobId)
  })
  await db.pdfs.each((p) => unused.delete(p.blobId))
  await db.blobs.bulkDelete([...unused])
}

/* ----------------------------- Ink debounce ------------------------------- */

const touches = new Map<string, { noteId: string; timer: ReturnType<typeof setTimeout> }>()

/** Drawing counts as editing the note: bump `updatedAt` once per quiet period. */
function runTouch(pageId: string): void {
  const t = touches.get(pageId)
  if (!t) return
  clearTimeout(t.timer)
  touches.delete(pageId)
  const prev = getNote(t.noteId)
  if (!prev || isScratch(t.noteId)) return
  const next = { ...prev, updatedAt: Date.now() }
  setNote(next)
  void commit(t.noteId, 'save note', async () => {
    await db.notes.put(next)
  })
}

/** Lands pending note touch-ups (all, or just one note's pages) and waits for every queued write. */
export async function flush(noteId?: string): Promise<void> {
  for (const [pageId, t] of [...touches]) if (noteId === undefined || t.noteId === noteId) runTouch(pageId)
  await tail
}

if (typeof window !== 'undefined') {
  const flushAll = (): void => void flush()
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll()
  })
  window.addEventListener('pagehide', flushAll)
}

/* ------------------------------- Note CRUD -------------------------------- */

function newPage(noteId: string, id: string, index: number, doc: JSONContent | null = null): PageRecord {
  const now = Date.now()
  return {
    id,
    noteId,
    index,
    template: 'blank',
    content: doc,
    text: docToPlainText(doc),
    size: PAGE_SIZES.a4,
    createdAt: now,
    updatedAt: now,
  }
}

function newNote(input: CreateNoteInput): Note {
  const now = Date.now()
  return {
    id: createId(),
    title: input.title ?? '',
    content: null, // legacy field: the text lives on the page now
    ink: null,
    folderId: input.folderId ?? null,
    tagIds: input.tagIds ?? [],
    isPinned: false,
    isFavorite: false,
    isArchived: false,
    isDeleted: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }
}

function addNoteToStores(note: Note, pages: PageRecord[]): void {
  useNoteStore.setState((s) => ({ notes: [note, ...s.notes] }))
  setPages(note.id, pages)
}

function removeNoteFromStores(ids: string[]): void {
  const pageIds = new Set(ids.flatMap((id) => getPages(id).map((p) => p.id)))
  useNoteStore.setState((s) => ({
    notes: s.notes.filter((n) => !ids.includes(n.id)),
    inkDocs: Object.fromEntries(Object.entries(s.inkDocs).filter(([k]) => !pageIds.has(k))),
  }))
  usePageStore.setState((s) => ({
    pagesByNote: Object.fromEntries(Object.entries(s.pagesByNote).filter(([k]) => !ids.includes(k))),
  }))
}

/** New note with its first page. Stays in memory until it earns content (templates and titles save at once). */
export function createNote(input: CreateNoteInput = {}): Note {
  const note = newNote(input)
  addNoteToStores(note, [newPage(note.id, note.id, 0, input.content ?? null)])
  void commit(note.id, 'save note', async () => {}, () => removeNoteFromStores([note.id]))
  return note
}

/** Title edits (bumps updatedAt). */
export function saveTitle(noteId: string, title: string): Promise<SaveResult> {
  const prev = getNote(noteId)
  if (!prev) return Promise.resolve('gone')
  setNote({ ...prev, title })
  if (isScratch(noteId)) return Promise.resolve('scratch')
  const next = { ...prev, title, updatedAt: Date.now() }
  setNote(next)
  return commit(noteId, 'save note', async () => {
    await db.notes.put(next)
  }, () => setNote(prev))
}

/** Typed-text edits for one page (bumps the note's updatedAt). */
export function savePageContent(
  noteId: string,
  pageId: string,
  doc: JSONContent | null,
): Promise<SaveResult> {
  const note = getNote(noteId)
  const pages = getPages(noteId)
  const prevPage = pages.find((p) => p.id === pageId)
  if (!note || !prevPage) return Promise.resolve('gone')
  const page: PageRecord = { ...prevPage, content: doc, text: docToPlainText(doc), updatedAt: Date.now() }
  setPages(noteId, pages.map((p) => (p.id === pageId ? page : p)))
  if (isScratch(noteId)) return Promise.resolve('scratch')
  const next = { ...note, updatedAt: page.updatedAt }
  setNote(next)
  return commit(
    noteId,
    'save note',
    async () => {
      await db.transaction('rw', db.notes, db.pages, async () => {
        await db.pages.put(page)
        await db.notes.put(next)
      })
    },
    () => {
      setNote(note)
      setPages(noteId, pages)
    },
  )
}

/** Metadata edits (pin, favorite, archive, folder, tags). Does not bump updatedAt. */
export function patchNote(
  id: string,
  patch: Partial<Pick<Note, 'isPinned' | 'isFavorite' | 'isArchived' | 'folderId' | 'tagIds'>>,
): Promise<SaveResult> {
  return change(id, patch)
}

function change(id: string, patch: Partial<Note>): Promise<SaveResult> {
  const prev = getNote(id)
  if (!prev) return Promise.resolve('gone')
  const next = { ...prev, ...patch }
  setNote(next)
  return commit(id, 'save note', async () => {
    await db.notes.put(next)
  }, () => setNote(prev))
}

export function trashNotes(ids: string[]): void {
  const now = Date.now()
  for (const id of ids) void change(id, { isDeleted: true, deletedAt: now })
}

export function restoreNote(id: string): void {
  void change(id, { isDeleted: false, deletedAt: null })
}

export function duplicateNote(id: string): Note | undefined {
  const source = getNote(id)
  if (!source) return undefined
  const now = Date.now()
  const copy: Note = {
    ...structuredClone(source),
    id: createId(),
    title: source.title ? `${source.title} (copy)` : 'Untitled (copy)',
    content: null,
    // A duplicate is a fresh, visible note: never inherit lifecycle flags
    isArchived: false,
    isDeleted: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  }
  // The legacy page (id === note id) keeps that rule for the copy; the rest get fresh ids.
  const idMap = new Map(getPages(id).map((p) => [p.id, p.id === id ? copy.id : createId()]))
  const pages = getPages(id).map((p) => ({ ...structuredClone(p), id: idMap.get(p.id)!, noteId: copy.id }))
  const ink: Record<string, InkDoc> = {}
  for (const [from, to] of idMap) {
    const doc = inkDocs()[from]
    if (doc) ink[to] = structuredClone(doc)
  }
  addNoteToStores(copy, pages)
  useNoteStore.setState((s) => ({ inkDocs: { ...s.inkDocs, ...ink } }))
  // Always written: "(copy)" makes the title non-empty, so it is never a scratch card.
  void enqueue(
    async () => {
      await db.transaction('rw', db.notes, db.pages, db.inkDocs, db.pdfs, async () => {
        await db.notes.put(copy)
        await db.pages.bulkPut(pages)
        await db.inkDocs.bulkPut(Object.entries(ink).map(([pid, doc]) => ({ noteId: pid, doc })))
        // A PDF note's copy points at the same original: blobs are shared, not duplicated
        const pdf = await db.pdfs.get(id)
        if (pdf) await db.pdfs.put({ ...pdf, noteId: copy.id })
      })
      onDisk.add(copy.id)
    },
    'save duplicate',
    () => removeNoteFromStores([copy.id]),
  )
  return copy
}

/** Permanently removes notes with their pages, ink, PDF and unreferenced blobs. */
export async function deleteForever(ids: string[]): Promise<void> {
  await flush()
  const notes = useNoteStore.getState().notes.filter((n) => ids.includes(n.id))
  const pages = Object.fromEntries(ids.map((id) => [id, getPages(id)]))
  const pageIds = Object.values(pages).flatMap((ps) => ps.map((p) => p.id))
  const ink = Object.fromEntries(Object.entries(inkDocs()).filter(([k]) => pageIds.includes(k)))
  removeNoteFromStores(ids)
  const undo = (): void => {
    useNoteStore.setState((s) => ({
      notes: [...notes, ...s.notes].sort(sortPinnedFirstUpdatedDesc),
      inkDocs: { ...s.inkDocs, ...ink },
    }))
    usePageStore.setState((s) => ({ pagesByNote: { ...s.pagesByNote, ...pages } }))
  }
  await enqueue(
    async () => {
      await db.transaction('rw', db.notes, db.pages, db.inkDocs, db.pdfs, db.blobs, async () => {
        const rows = await db.pages.where('noteId').anyOf(ids).toArray()
        const pdfs = (await db.pdfs.bulkGet(ids)).filter((p): p is PdfRecord => !!p)
        await db.notes.bulkDelete(ids)
        await db.inkDocs.bulkDelete([...rows.map((p) => p.id), ...ids])
        await db.pages.bulkDelete(rows.map((p) => p.id))
        await db.pdfs.bulkDelete(ids)
        await dropUnusedBlobs([...rows.map((p) => p.backgroundBlobId), ...pdfs.map((p) => p.blobId)])
      })
      for (const id of ids) onDisk.delete(id)
    },
    'delete permanently',
    undo,
  )
}

export async function emptyTrash(): Promise<void> {
  const ids = useNoteStore.getState().notes.filter((n) => n.isDeleted).map((n) => n.id)
  if (ids.length > 0) await deleteForever(ids)
}

/** Erases every note, page, ink doc and blob. Folders, tags and settings stay. */
export async function clearAll(): Promise<void> {
  await flush()
  const notes = useNoteStore.getState().notes
  const ink = inkDocs()
  const pages = usePageStore.getState().pagesByNote
  useNoteStore.setState({ notes: [], inkDocs: {} })
  usePageStore.setState({ pagesByNote: {} })
  await enqueue(
    async () => {
      await db.transaction('rw', db.notes, db.pages, db.inkDocs, db.pdfs, db.blobs, async () => {
        await Promise.all([db.notes, db.pages, db.inkDocs, db.pdfs, db.blobs].map((t) => t.clear()))
      })
      onDisk = new Set()
    },
    'clear notes',
    () => {
      useNoteStore.setState({ notes, inkDocs: ink })
      usePageStore.setState({ pagesByNote: pages })
    },
  )
}

/* ---------------------------------- Ink ----------------------------------- */

/** Handwriting for one page. Lands in the store at once and in IndexedDB right behind it. */
export function saveInk(noteId: string, pageId: string, doc: InkDoc): void {
  useNoteStore.setState((s) => ({ inkDocs: { ...s.inkDocs, [pageId]: doc } }))
  if (!touches.has(pageId)) {
    touches.set(pageId, { noteId, timer: setTimeout(() => runTouch(pageId), INK_TOUCH_DELAY) })
  }
  void commit(noteId, 'save handwriting', async () => {
    await db.inkDocs.put({ noteId: pageId, doc })
  })
}

/* ---------------------------------- Pages --------------------------------- */

const reindex = (pages: PageRecord[]): PageRecord[] => pages.map((p, i) => (p.index === i ? p : { ...p, index: i }))

/** Writes a new page list; `gone` pages (and their ink) are removed, `ink` rows added. */
function commitPages(
  noteId: string,
  prev: PageRecord[],
  next: PageRecord[],
  extra: { gone?: PageRecord[]; ink?: InkDocRecord[]; undo?: () => void } = {},
): Promise<SaveResult> {
  const note = getNote(noteId)
  if (!note) return Promise.resolve('gone')
  setPages(noteId, next)
  const stamped = isScratch(noteId) ? note : { ...note, updatedAt: Date.now() }
  setNote(stamped)
  const gone = extra.gone ?? []
  return commit(
    noteId,
    'save page',
    async () => {
      await db.transaction('rw', db.notes, db.pages, db.inkDocs, db.pdfs, db.blobs, async () => {
        const goneIds = gone.map((p) => p.id)
        await db.pages.bulkDelete(goneIds)
        await db.inkDocs.bulkDelete(goneIds)
        await db.pages.bulkPut(next)
        if (extra.ink?.length) await db.inkDocs.bulkPut(extra.ink)
        await db.notes.put(stamped)
        await dropUnusedBlobs(gone.map((p) => p.backgroundBlobId))
      })
    },
    () => {
      setPages(noteId, prev)
      setNote(note)
      extra.undo?.()
    },
  )
}

export function addPage(noteId: string, template: PageRecord['template'] = 'blank', atIndex?: number): PageRecord {
  const prev = getPages(noteId)
  const index = Math.min(atIndex ?? prev.length, prev.length)
  const sibling = prev[Math.max(0, index - 1)]
  const page: PageRecord = {
    ...newPage(noteId, createId(), index),
    template,
    size: sibling?.size?.kind !== 'pdf' && sibling?.size ? sibling.size : PAGE_SIZES.a4,
  }
  const next = [...prev]
  next.splice(index, 0, page)
  void commitPages(noteId, prev, reindex(next))
  return page
}

export function duplicatePage(noteId: string, pageId: string): PageRecord | undefined {
  const prev = getPages(noteId)
  const src = prev.find((p) => p.id === pageId)
  if (!src) return undefined
  const now = Date.now()
  const copy: PageRecord = { ...structuredClone(src), id: createId(), index: src.index + 1, createdAt: now, updatedAt: now }
  const srcInk = inkDocs()[src.id]
  const ink = srcInk ? structuredClone(srcInk) : null
  if (ink) useNoteStore.setState((s) => ({ inkDocs: { ...s.inkDocs, [copy.id]: ink } }))
  const next = [...prev]
  next.splice(src.index + 1, 0, copy)
  void commitPages(noteId, prev, reindex(next), {
    ink: ink ? [{ noteId: copy.id, doc: ink }] : [],
    undo: () =>
      useNoteStore.setState((s) => ({
        inkDocs: Object.fromEntries(Object.entries(s.inkDocs).filter(([k]) => k !== copy.id)),
      })),
  })
  return copy
}

export function deletePage(noteId: string, pageId: string): void {
  const prev = getPages(noteId)
  const gone = prev.find((p) => p.id === pageId)
  if (!gone) return
  if (prev.length <= 1) {
    toast.info('Cannot delete the last page of a note')
    return
  }
  const ink = inkDocs()[pageId]
  useNoteStore.setState((s) => ({
    inkDocs: Object.fromEntries(Object.entries(s.inkDocs).filter(([k]) => k !== pageId)),
  }))
  void commitPages(noteId, prev, reindex(prev.filter((p) => p.id !== pageId)), {
    gone: [gone],
    undo: () => {
      if (ink) useNoteStore.setState((s) => ({ inkDocs: { ...s.inkDocs, [pageId]: ink } }))
    },
  })
}

export function movePage(noteId: string, pageId: string, toIndex: number): void {
  const prev = getPages(noteId)
  const from = prev.findIndex((p) => p.id === pageId)
  if (from < 0 || toIndex === from || toIndex < 0 || toIndex >= prev.length) return
  const next = [...prev]
  next.splice(toIndex, 0, ...next.splice(from, 1))
  void commitPages(noteId, prev, reindex(next))
}

export function setTemplate(noteId: string, pageId: string, template: PageRecord['template']): void {
  const prev = getPages(noteId)
  void commitPages(noteId, prev, prev.map((p) => (p.id === pageId ? { ...p, template, updatedAt: Date.now() } : p)))
}

/* ------------------------------- PDF import ------------------------------- */

export interface PdfPageInfo {
  /** Sheet size in PDF points. */
  w: number
  h: number
  /** Text layer, for search. */
  text: string
}

/**
 * A note made of an imported PDF: the original bytes are kept as a blob and
 * every page is rendered from them on demand. Written at once; throws on failure.
 */
export async function createPdfNote(input: {
  title: string
  folderId: string | null
  pdf: Blob
  pages: PdfPageInfo[]
}): Promise<Note> {
  const note = newNote({ title: input.title, folderId: input.folderId })
  const now = Date.now()
  const pages: PageRecord[] = input.pages.map((p, i) => ({
    ...newPage(note.id, i === 0 ? note.id : createId(), i),
    text: p.text,
    size: { w: p.w, h: p.h, kind: 'pdf' },
    pdfPage: i + 1,
    createdAt: now,
    updatedAt: now,
  }))
  const blobId = createId()
  await flush() // keep write order: anything queued earlier lands first
  await db.transaction('rw', db.notes, db.pages, db.pdfs, db.blobs, async () => {
    await db.blobs.put({ id: blobId, data: input.pdf })
    await db.pdfs.put({ noteId: note.id, blobId, pageCount: pages.length, createdAt: now })
    await db.notes.put(note)
    await db.pages.bulkPut(pages)
  })
  onDisk.add(note.id)
  addNoteToStores(note, pages)
  return note
}
