import { create } from 'zustand'
import { toast } from 'sonner'
import { noteRepository } from '@/database/repositories/noteRepository'
import { inkRepository } from '@/database/repositories/inkRepository'
import { createId } from '@/utils/id'
import { docNeedsCleanup, sanitizeDoc } from '@/utils/doc'
import type { JSONContent } from '@tiptap/core'
import type { InkDocRecord } from '@/types/models'
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
  /** Runtime mirror of out-of-line handwriting, keyed by note id. */
  inkDocs: Record<string, InkDoc>
  hydrated: boolean
  hydrate: (notes: Note[]) => void
  hydrateInk: (records: InkDocRecord[]) => void

  createNote: (input?: CreateNoteInput) => Note
  /** Title/content edits — bumps updatedAt. */
  saveContent: (id: string, patch: { title?: string; content?: JSONContent | null }) => void
  /**
   * Handwriting updates: applied to the store instantly so drawing never
   * stutters, then persisted as a single inkDocs row + one note touch-up per
   * quiet period (see INK_SAVE_DELAY).
   */
  saveInk: (id: string, doc: InkDoc) => void
  /** Force-persist pending ink — call before unload, note switch, trash, export. */
  flushInk: (id?: string) => Promise<void>

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

/**
 * Persist one pending ink doc + bump its note's updatedAt once.
 * Ink bytes themselves are written immediately in saveInk; this trailing
 * pass exists purely for the note-row touch-up (updatedAt ordering and
 * materializing otherwise-scratch notes), which is safe to lose.
 */
async function flushOne(id: string): Promise<void> {
  const timer = inkTimers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    inkTimers.delete(id)
  }
  const doc = inkPending.get(id)
  if (!doc) return
  inkPending.delete(id)

  const s0 = useNoteStore.getState()
  const note = s0.notes.find((n) => n.id === id)
  if (doc.strokes.length === 0 && (!note || isEmptyNote({ ...note, ink: null }, s0.inkDocs))) {
    // Nothing left to save: an empty ink doc on an otherwise-empty,
    // untitled note stays memory-only.
    useNoteStore.setState((st) => ({
      inkDocs: Object.fromEntries(Object.entries(st.inkDocs).filter(([k]) => k !== id)),
    }))
    return
  }

  try {
    await inkRepository.put({ noteId: id, doc })
    // Drawing counts as editing the note: reflect it in ordering + metadata
    if (note) {
      const next = { ...note, updatedAt: Date.now() }
      useNoteStore.setState((st) => ({
        notes: st.notes.map((n) => (n.id === id ? next : n)),
      }))
      await noteRepository.put(next)
    }
  } catch (err) {
    console.error('[notely] failed to persist handwriting', err)
    toast.error('Storage error — could not save handwriting')
  }
}

function scheduleInkSave(id: string, doc: InkDoc): void {
  inkPending.set(id, doc)
  const existing = inkTimers.get(id)
  if (existing !== undefined) return
  inkTimers.set(
    id,
    setTimeout(() => {
      inkTimers.delete(id)
      void flushOne(id)
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
    console.error('[notely] failed to persist note', err)
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
 */
export function isEmptyNote(note: Note, inkDocs: Record<string, InkDoc>): boolean {
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

export const useNoteStore = create<NoteState>()((set, get) => ({
  notes: [],
  inkDocs: {},
  hydrated: false,

  hydrate(notes) {
    // Drop null/malformed nodes left by interrupted writes so the editor and
    // doc helpers never see corrupted Tiptap JSON.
    const clean = notes.map((n) => {
      if (!n.content || !docNeedsCleanup(n.content)) return n
      const content = sanitizeDoc(n.content)
      return { ...n, content }
    })
    set({ notes: clean, hydrated: true })
  },

  hydrateInk(records) {
    if (records.length === 0) return
    set((s) => {
      const inkDocs = { ...s.inkDocs }
      for (const r of records) inkDocs[r.noteId] = r.doc
      return { inkDocs }
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

  saveInk(id, doc) {
    wireInkLifecycle()
    set((s) => ({ inkDocs: { ...s.inkDocs, [id]: doc } }))
    // Ink bytes are small and discrete — land them immediately so even an
    // instant reload keeps every stroke. The note-row touch-up (updatedAt,
    // materializing the note) is what's debounced.
    const s0 = get()
    const note = s0.notes.find((n) => n.id === id)
    const scratch =
      doc.strokes.length === 0 && (!note || isEmptyNote({ ...note, ink: null }, { ...s0.inkDocs, [id]: doc }))
    if (!scratch) {
      void inkRepository.put({ noteId: id, doc }).catch((err) => {
        console.error('[notely] failed to persist handwriting', err)
        toast.error('Storage error — could not save handwriting')
      })
    }
    scheduleInkSave(id, doc)
  },

  async flushInk(id) {
    const ids = id !== undefined ? [id] : Array.from(inkPending.keys())
    await Promise.all(ids.map(flushOne))
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
    const snapshots = get().notes.filter((n) => ids.includes(n.id))
    const inkSnapshots = Object.fromEntries(
      Object.entries(get().inkDocs).filter(([k]) => ids.includes(k)),
    )
    set((s) => ({
      notes: s.notes.filter((n) => !ids.includes(n.id)),
      inkDocs: Object.fromEntries(Object.entries(s.inkDocs).filter(([k]) => !ids.includes(k))),
    }))
    try {
      await noteRepository.bulkRemove(ids)
      await inkRepository.bulkRemove(ids)
    } catch (err) {
      console.error('[notely] failed to delete notes', err)
      set((s) => ({
        notes: [...snapshots, ...s.notes].sort(sortPinnedFirstUpdatedDesc),
        inkDocs: { ...s.inkDocs, ...inkSnapshots },
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
    // Snapshot before the optimistic update so we can roll back on persist failure
    const prevNotes = get().notes
    const prevInkDocs = get().inkDocs
    set((s) => ({ notes: [copy, ...s.notes] }))
    // Handwriting rides along on its own record
    const sourceInk = get().inkDocs[id]
    if (sourceInk) {
      const cloned = structuredClone(sourceInk)
      set((s) => ({ inkDocs: { ...s.inkDocs, [copy.id]: cloned } }))
    }
    // Same scratch-card rule as createNote: empty copies stay memory-only
    if (!isEmptyNote(copy, get().inkDocs)) {
      // persist() only rolls back the note row on failure; we also need to
      // roll back the inkDoc entry we optimistically added above.
      void noteRepository.put(copy).catch((err) => {
        console.error('[notely] failed to persist duplicated note', err)
        set((s) => ({
          notes: [...prevNotes, ...s.notes.filter((n) => n.id !== copy.id)].sort(sortPinnedFirstUpdatedDesc),
          inkDocs: { ...prevInkDocs, ...Object.fromEntries(Object.entries(s.inkDocs).filter(([k]) => k !== copy.id)) },
        }))
        toast.error('Storage error — could not save duplicated note')
      })
    }
    return copy
  },

  async clearAllNotes() {
    await get().flushInk()
    const all = get().notes
    const allInkDocs = get().inkDocs
    set({ notes: [], inkDocs: {} })
    try {
      await noteRepository.bulkRemove(all.map((n) => n.id))
      await inkRepository.bulkRemove(all.map((n) => n.id))
    } catch (err) {
      console.error('[notely] failed to clear notes', err)
      set({ notes: all, inkDocs: allInkDocs })
      toast.error('Could not clear notes')
    }
  },
}))
