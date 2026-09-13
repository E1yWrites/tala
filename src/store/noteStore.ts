import { create } from 'zustand'
import { toast } from 'sonner'
import { noteRepository } from '@/database/repositories/noteRepository'
import { inkRepository } from '@/database/repositories/inkRepository'
import { pageInkRepository } from '@/database/repositories/pageInkRepository'
import { documentRepository } from '@/database/repositories/documentRepository'
import { assetRepository } from '@/database/repositories/assetRepository'
import { createId } from '@/utils/id'
import { docNeedsCleanup, sanitizeDoc } from '@/utils/doc'
import type { JSONContent } from '@tiptap/core'
import type { DocumentRecord, InkDocRecord, PageInkRecord } from '@/types/models'
import { pageInkKey, parseInkKey } from '@/types/models'
import type { Note } from '@/types/models'
import type { InkDoc } from '@/types/ink'

export interface CreateNoteInput {
  title?: string
  content?: JSONContent | null
  folderId?: string | null
  tagIds?: string[]
}

interface NoteState {
  notes: Note[]
  /**
   * Runtime mirror of out-of-line handwriting. Keyed by note id for a
   * note's own ink, or by `pageInkKey(noteId, pageId)` for document pages —
   * the same drawing pipeline (InkLayer → saveInk → flush) serves both.
   */
  inkDocs: Record<string, InkDoc>
  /** Imported-document metadata keyed by document id (small; boot-loaded). */
  documents: Record<string, DocumentRecord>
  /** Notes whose page ink has been pulled from IndexedDB (lazy, per note). */
  pageInkLoaded: Record<string, true>
  hydrated: boolean
  hydrate: (notes: Note[]) => void
  hydrateInk: (records: InkDocRecord[]) => void
  hydrateDocuments: (records: DocumentRecord[]) => void
  /** Loads a document note's page annotations into `inkDocs` (idempotent). */
  loadPageInk: (noteId: string) => Promise<void>

  createNote: (input?: CreateNoteInput) => Note
  /**
   * Registers an already-persisted note (+ optional document) produced by an
   * importer. Importers write IndexedDB transactionally first, then adopt.
   */
  adoptImported: (note: Note, document?: DocumentRecord | null) => void
  /** Persist + mirror an updated document record (page order, rotation…). */
  updateDocument: (id: string, patch: Partial<Omit<DocumentRecord, 'id'>>) => Promise<void>
  /** Title/content edits — bumps updatedAt. */
  saveContent: (id: string, patch: { title?: string; content?: JSONContent | null }) => void
  /**
   * Handwriting updates: applied to the store instantly so drawing never
   * stutters, then persisted as a single inkDocs row + one note touch-up per
   * quiet period (see INK_SAVE_DELAY). `key` is a note id or a page ink key.
   */
  saveInk: (key: string, doc: InkDoc) => void
  /** Force-persist pending ink — call before unload, note switch, trash, export. */
  flushInk: (key?: string) => Promise<void>

  /** Metadata toggles (pin, favorite, archive, folder, tags) — does not bump updatedAt. */
  patchNote: (
    id: string,
    patch: Partial<Pick<Note, 'isPinned' | 'isFavorite' | 'isArchived' | 'folderId' | 'tagIds'>>,
  ) => void

  trashNotes: (ids: string[]) => void
  restoreNote: (id: string) => void
  deleteForever: (ids: string[]) => Promise<void>
  emptyTrash: () => Promise<void>
  duplicateNote: (id: string) => Note | undefined
  clearAllNotes: () => Promise<void>
}

/** Quiet period after the last stroke before ink is written to IndexedDB. */
const INK_SAVE_DELAY = 800

const inkTimers = new Map<string, ReturnType<typeof setTimeout>>()
const inkPending = new Map<string, InkDoc>()
let lifecycleWired = false

/** Writes one ink doc to whichever table owns the key. */
async function persistInk(key: string, doc: InkDoc): Promise<void> {
  const { noteId, pageId } = parseInkKey(key)
  if (pageId === null) {
    await inkRepository.put({ noteId, doc })
  } else {
    const rec: PageInkRecord = { id: key, noteId, pageId, doc }
    await pageInkRepository.put(rec)
  }
}

/**
 * Persist one pending ink doc + bump its note's updatedAt once.
 * Ink bytes themselves are written immediately in saveInk; this trailing
 * pass exists purely for the note-row touch-up (updatedAt ordering and
 * materializing otherwise-scratch notes), which is safe to lose.
 */
async function flushOne(key: string): Promise<void> {
  const timer = inkTimers.get(key)
  if (timer !== undefined) {
    clearTimeout(timer)
    inkTimers.delete(key)
  }
  const doc = inkPending.get(key)
  if (!doc) return
  inkPending.delete(key)

  const { noteId, pageId } = parseInkKey(key)
  const s0 = useNoteStore.getState()
  const note = s0.notes.find((n) => n.id === noteId)
  if (
    pageId === null &&
    doc.strokes.length === 0 &&
    (!note || isEmptyNote({ ...note, ink: null }, s0.inkDocs))
  ) {
    // Nothing left to save: an empty ink doc on an otherwise-empty,
    // untitled note stays memory-only.
    useNoteStore.setState((st) => ({
      inkDocs: Object.fromEntries(Object.entries(st.inkDocs).filter(([k]) => k !== key)),
    }))
    return
  }

  try {
    await persistInk(key, doc)
    // Drawing counts as editing the note: reflect it in ordering + metadata
    if (note) {
      const next = { ...note, updatedAt: Date.now() }
      useNoteStore.setState((st) => ({
        notes: st.notes.map((n) => (n.id === noteId ? next : n)),
      }))
      await noteRepository.put(next)
    }
  } catch (err) {
    console.error('[tala] failed to persist handwriting', err)
    toast.error('Storage error — could not save handwriting')
  }
}

function scheduleInkSave(key: string, doc: InkDoc): void {
  inkPending.set(key, doc)
  const existing = inkTimers.get(key)
  if (existing !== undefined) return
  inkTimers.set(
    key,
    setTimeout(() => {
      inkTimers.delete(key)
      void flushOne(key)
    }, INK_SAVE_DELAY),
  )
}

function wireInkLifecycle(): void {
  if (lifecycleWired || typeof window === 'undefined') return
  lifecycleWired = true
  const flushAll = () => {
    for (const id of Array.from(inkPending.keys())) void flushOne(id)
  }
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll()
  })
  window.addEventListener('pagehide', flushAll)
}

function makeNote(input: CreateNoteInput = {}): Note {
  const now = Date.now()
  return {
    id: createId(),
    title: input.title ?? '',
    content: input.content ?? null,
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

/** Persist a note; on failure revert to the previous snapshot and warn. */
async function persist(note: Note, previous: Note): Promise<void> {
  try {
    await noteRepository.put(note)
  } catch (err) {
    console.error('[tala] failed to persist note', err)
    useNoteStore.setState((s) => ({
      notes: s.notes.map((n) => (n.id === previous.id ? previous : n)),
    }))
    toast.error('Storage error — could not save note')
  }
}

const sortPinnedFirstUpdatedDesc = (a: Note, b: Note): number => {
  if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
  return b.updatedAt - a.updatedAt
}

/**
 * An untitled note with no typed content and no ink is a scratch card —
 * it never touches IndexedDB, so abandoning it leaves no clutter behind.
 * An ink doc made of zero strokes counts as empty (drew then undid all).
 * A document-backed note is never empty: the imported file is its content.
 */
export function isEmptyNote(note: Note, inkDocs: Record<string, InkDoc>): boolean {
  if (note.documentId) return false
  if (note.title.trim().length > 0) return false
  if (note.content !== null && docHasText(note.content)) return false
  const ink = inkDocs[note.id] ?? note.ink ?? null
  if (ink && ink.strokes.length > 0) return false
  return true
}

/** Tiptap docs are trees — walk for any non-empty text node. */
function docHasText(node: JSONContent): boolean {
  if (typeof node.text === 'string' && node.text.trim().length > 0) return true
  return (node.content ?? []).some(docHasText)
}

/**
 * Removes documents + page ink for the given notes and any assets no
 * remaining document references. Best-effort: a failure here leaves at
 * worst an orphaned asset, never a broken note.
 */
async function purgeDocumentsFor(noteIds: string[]): Promise<void> {
  if (noteIds.length === 0) return
  const docs = (await Promise.all(noteIds.map((id) => documentRepository.byNote(id)))).flat()
  await pageInkRepository.removeByNotes(noteIds)
  if (docs.length === 0) return
  await documentRepository.bulkRemove(docs.map((d) => d.id))
  const candidates = new Set<string>()
  for (const d of docs) {
    candidates.add(d.assetId)
    if (d.originalAssetId) candidates.add(d.originalAssetId)
  }
  const unreferenced: string[] = []
  for (const assetId of candidates) {
    const refs = await documentRepository.referencingAsset(assetId)
    if (refs.length === 0) unreferenced.push(assetId)
  }
  if (unreferenced.length > 0) await assetRepository.bulkRemove(unreferenced)
}

export const useNoteStore = create<NoteState>()((set, get) => ({
  notes: [],
  inkDocs: {},
  documents: {},
  pageInkLoaded: {},
  hydrated: false,

  hydrate(notes) {
    // Drop null/malformed nodes left by interrupted writes so the editor and
    // doc helpers never see corrupted Tiptap JSON.
    const clean = notes.map((n) => {
      if (!n.content || !docNeedsCleanup(n.content)) return n
      const content = sanitizeDoc(n.content)
      return { ...n, content }
    })
    // Page ink reloads lazily against the (possibly replaced) library; the
    // bytes are already on disk because saveInk persists immediately.
    set((s) => ({
      notes: clean,
      hydrated: true,
      pageInkLoaded: {},
      inkDocs: Object.fromEntries(
        Object.entries(s.inkDocs).filter(([k]) => parseInkKey(k).pageId === null),
      ),
    }))
  },

  hydrateInk(records) {
    if (records.length === 0) return
    set((s) => {
      const inkDocs = { ...s.inkDocs }
      for (const r of records) inkDocs[r.noteId] = r.doc
      return { inkDocs }
    })
  },

  hydrateDocuments(records) {
    set({ documents: Object.fromEntries(records.map((d) => [d.id, d])) })
  },

  async loadPageInk(noteId) {
    if (get().pageInkLoaded[noteId]) return
    const records = await pageInkRepository.byNote(noteId)
    set((s) => {
      const inkDocs = { ...s.inkDocs }
      for (const r of records) {
        // Unsaved in-memory strokes win over what was on disk a moment ago
        if (!(r.id in inkDocs)) inkDocs[r.id] = r.doc
      }
      return { inkDocs, pageInkLoaded: { ...s.pageInkLoaded, [noteId]: true } }
    })
  },

  // No immediate persist: an untouched new note stays memory-only until it
  // earns content (see isEmptyNote).
  createNote(input = {}) {
    wireInkLifecycle()
    const note = makeNote(input)
    set((s) => ({ notes: [note, ...s.notes] }))
    return note
  },

  adoptImported(note, document) {
    wireInkLifecycle()
    set((s) => ({
      notes: [note, ...s.notes.filter((n) => n.id !== note.id)],
      documents: document ? { ...s.documents, [document.id]: document } : s.documents,
    }))
  },

  async updateDocument(id, patch) {
    const prev = get().documents[id]
    if (!prev) return
    const next: DocumentRecord = { ...prev, ...patch, id, updatedAt: Date.now() }
    set((s) => ({ documents: { ...s.documents, [id]: next } }))
    try {
      await documentRepository.put(next)
    } catch (err) {
      console.error('[tala] failed to persist document', err)
      set((s) => ({ documents: { ...s.documents, [id]: prev } }))
      toast.error('Storage error — could not save document changes')
    }
  },

  saveContent(id, patch) {
    const prev = get().notes.find((n) => n.id === id)
    if (!prev) return
    const next: Note = { ...prev, ...patch }
    if (isEmptyNote(next, get().inkDocs)) {
      // Still empty: update the UI but don't write or bump updatedAt —
      // the note simply doesn't exist on disk yet.
      set((s) => ({ notes: s.notes.map((n) => (n.id === id ? next : n)) }))
      return
    }
    next.updatedAt = Date.now()
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? next : n)),
    }))
    void persist(next, prev)
  },

  saveInk(key, doc) {
    wireInkLifecycle()
    set((s) => ({ inkDocs: { ...s.inkDocs, [key]: doc } }))
    // Ink bytes are small and discrete — land them immediately so even an
    // instant reload keeps every stroke. The note-row touch-up (updatedAt,
    // materializing the note) is what's debounced.
    const { noteId, pageId } = parseInkKey(key)
    const s0 = get()
    const note = s0.notes.find((n) => n.id === noteId)
    const scratch =
      pageId === null &&
      doc.strokes.length === 0 &&
      (!note || isEmptyNote({ ...note, ink: null }, { ...s0.inkDocs, [key]: doc }))
    if (!scratch) {
      void persistInk(key, doc).catch((err) => {
        console.error('[tala] failed to persist handwriting', err)
        toast.error('Storage error — could not save handwriting')
      })
    }
    scheduleInkSave(key, doc)
  },

  async flushInk(key) {
    const keys =
      key !== undefined
        ? // A note id flushes its own ink and every page of it
          Array.from(inkPending.keys()).filter((k) => k === key || parseInkKey(k).noteId === key)
        : Array.from(inkPending.keys())
    await Promise.all(keys.map(flushOne))
  },

  patchNote(id, patch) {
    const prev = get().notes.find((n) => n.id === id)
    if (!prev) return
    const next: Note = { ...prev, ...patch }
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? next : n)) }))
    void persist(next, prev)
  },

  trashNotes(ids) {
    const now = Date.now()
    const affected: Array<{ next: Note; prev: Note }> = []
    set((s) => ({
      notes: s.notes.map((n) => {
        if (!ids.includes(n.id)) return n
        const prev = n
        const next = { ...n, isDeleted: true, deletedAt: now }
        affected.push({ next, prev })
        return next
      }),
    }))
    // Scratch cards (untitled, no content) were never on disk — don't
    // materialize them just because they got trashed.
    affected.forEach(({ next, prev }) => {
      if (!isEmptyNote(next, get().inkDocs)) void persist(next, prev)
    })
    // Land any in-flight handwriting so a later restore/export sees it
    if (inkPending.size > 0) void Promise.all(ids.map((id) => get().flushInk(id)))
  },

  restoreNote(id) {
    const prev = get().notes.find((n) => n.id === id)
    if (!prev) return
    const next: Note = { ...prev, isDeleted: false, deletedAt: null }
    set((s) => ({ notes: s.notes.map((n) => (n.id === id ? next : n)) }))
    void persist(next, prev)
  },

  async deleteForever(ids) {
    await get().flushInk()
    const snapshots = get().notes.filter((n) => ids.includes(n.id))
    const ownedKey = (k: string): boolean => ids.includes(parseInkKey(k).noteId)
    const inkSnapshots = Object.fromEntries(
      Object.entries(get().inkDocs).filter(([k]) => ownedKey(k)),
    )
    const docSnapshots = Object.fromEntries(
      Object.entries(get().documents).filter(([, d]) => ids.includes(d.noteId)),
    )
    set((s) => ({
      notes: s.notes.filter((n) => !ids.includes(n.id)),
      inkDocs: Object.fromEntries(Object.entries(s.inkDocs).filter(([k]) => !ownedKey(k))),
      documents: Object.fromEntries(Object.entries(s.documents).filter(([, d]) => !ids.includes(d.noteId))),
    }))
    try {
      await noteRepository.bulkRemove(ids)
      await inkRepository.bulkRemove(ids)
      await purgeDocumentsFor(ids)
    } catch (err) {
      console.error('[tala] failed to delete notes', err)
      set((s) => ({
        notes: [...snapshots, ...s.notes].sort(sortPinnedFirstUpdatedDesc),
        inkDocs: { ...s.inkDocs, ...inkSnapshots },
        documents: { ...s.documents, ...docSnapshots },
      }))
      toast.error('Could not delete permanently')
    }
  },

  async emptyTrash() {
    const ids = get().notes.filter((n) => n.isDeleted).map((n) => n.id)
    if (ids.length > 0) await get().deleteForever(ids)
  },

  duplicateNote(id) {
    const source = get().notes.find((n) => n.id === id)
    if (!source) return undefined
    const now = Date.now()
    const copy: Note = {
      ...structuredClone(source),
      id: createId(),
      title: source.title ? `${source.title} (copy)` : 'Untitled (copy)',
      // A duplicate is a fresh, visible note — never inherit lifecycle flags
      isArchived: false,
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }
    // A document-backed note gets its own document record; the (immutable)
    // file assets are shared and refcounted by reference at delete time.
    const sourceDoc = source.documentId ? get().documents[source.documentId] : undefined
    const docCopy: DocumentRecord | null = sourceDoc
      ? { ...structuredClone(sourceDoc), id: createId(), noteId: copy.id, createdAt: now, updatedAt: now }
      : null
    if (docCopy) copy.documentId = docCopy.id
    else if (source.documentId) copy.documentId = null

    // Snapshot before the optimistic update so we can roll back on persist failure
    const prevNotes = get().notes
    const prevInkDocs = get().inkDocs
    const prevDocuments = get().documents
    set((s) => ({
      notes: [copy, ...s.notes],
      documents: docCopy ? { ...s.documents, [docCopy.id]: docCopy } : s.documents,
    }))
    // Handwriting rides along on its own record
    const sourceInk = get().inkDocs[id]
    if (sourceInk) {
      const cloned = structuredClone(sourceInk)
      set((s) => ({ inkDocs: { ...s.inkDocs, [copy.id]: cloned } }))
    }
    // Page annotations follow the page ids, which the copied document keeps
    const pageInkCopies: PageInkRecord[] = []
    if (docCopy) {
      for (const [k, doc] of Object.entries(get().inkDocs)) {
        const parsed = parseInkKey(k)
        if (parsed.noteId !== id || parsed.pageId === null) continue
        const rec: PageInkRecord = {
          id: pageInkKey(copy.id, parsed.pageId),
          noteId: copy.id,
          pageId: parsed.pageId,
          doc: structuredClone(doc),
        }
        pageInkCopies.push(rec)
      }
      if (pageInkCopies.length > 0) {
        set((s) => ({
          inkDocs: { ...s.inkDocs, ...Object.fromEntries(pageInkCopies.map((r) => [r.id, r.doc])) },
          pageInkLoaded: { ...s.pageInkLoaded, [copy.id]: true },
        }))
      }
    }
    // Same scratch-card rule as createNote: empty copies stay memory-only
    if (!isEmptyNote(copy, get().inkDocs)) {
      const rollback = (): void => {
        set((s) => ({
          notes: [...prevNotes, ...s.notes.filter((n) => n.id !== copy.id)].sort(sortPinnedFirstUpdatedDesc),
          inkDocs: {
            ...prevInkDocs,
            ...Object.fromEntries(
              Object.entries(s.inkDocs).filter(([k]) => parseInkKey(k).noteId !== copy.id),
            ),
          },
          documents: docCopy
            ? { ...prevDocuments, ...Object.fromEntries(Object.entries(s.documents).filter(([k]) => k !== docCopy.id)) }
            : s.documents,
        }))
      }
      // persist() only rolls back the note row on failure; we also need to
      // roll back the inkDoc / document entries we optimistically added above.
      void noteRepository.put(copy).catch((err) => {
        console.error('[tala] failed to persist duplicated note', err)
        rollback()
        toast.error('Storage error — could not save duplicated note')
      })
      // Persist the cloned ink record so it survives reload
      const clonedInk = get().inkDocs[copy.id]
      if (clonedInk) {
        void inkRepository.put({ noteId: copy.id, doc: clonedInk }).catch((err) => {
          console.error('[tala] failed to persist duplicated ink', err)
        })
      }
      if (docCopy) {
        void documentRepository.put(docCopy).catch((err) => {
          console.error('[tala] failed to persist duplicated document', err)
          rollback()
          toast.error('Storage error — could not duplicate the document')
        })
        if (pageInkCopies.length > 0) {
          void pageInkRepository.bulkPut(pageInkCopies).catch((err) => {
            console.error('[tala] failed to persist duplicated page ink', err)
          })
        }
        // Pages not yet loaded for the source live only on disk — copy them there too.
        if (!get().pageInkLoaded[id]) {
          void pageInkRepository.byNote(id).then((recs) => {
            const extra = recs
              .filter((r) => !pageInkCopies.some((c) => c.pageId === r.pageId))
              .map((r) => ({ id: pageInkKey(copy.id, r.pageId), noteId: copy.id, pageId: r.pageId, doc: r.doc }))
            return extra.length > 0 ? pageInkRepository.bulkPut(extra) : undefined
          }).catch((err) => console.error('[tala] failed to copy page ink', err))
        }
      }
    }
    return copy
  },

  async clearAllNotes() {
    await get().flushInk()
    const all = get().notes
    const allInkDocs = get().inkDocs
    const allDocuments = get().documents
    set({ notes: [], inkDocs: {}, documents: {}, pageInkLoaded: {} })
    try {
      await noteRepository.bulkRemove(all.map((n) => n.id))
      await inkRepository.bulkRemove(all.map((n) => n.id))
      await purgeDocumentsFor(all.map((n) => n.id))
    } catch (err) {
      console.error('[tala] failed to clear notes', err)
      set({ notes: all, inkDocs: allInkDocs, documents: allDocuments })
      toast.error('Could not clear notes')
    }
  },
}))
