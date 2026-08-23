import { create } from 'zustand'
import { toast } from 'sonner'
import { noteRepository } from '@/database/repositories/noteRepository'
import { createId } from '@/utils/id'
import { docNeedsCleanup, sanitizeDoc } from '@/utils/doc'
import type { JSONContent } from '@tiptap/core'
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
  hydrated: boolean
  hydrate: (notes: Note[]) => void

  createNote: (input?: CreateNoteInput) => Note
  /** Title/content/ink edits — bumps updatedAt. */
  saveContent: (id: string, patch: { title?: string; content?: JSONContent | null; ink?: InkDoc | null }) => void
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

export const useNoteStore = create<NoteState>()((set, get) => ({
  notes: [],
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

  createNote(input = {}) {
    const note = makeNote(input)
    set((s) => ({ notes: [note, ...s.notes] }))
    void persist(note, note)
    return note
  },

  saveContent(id, patch) {
    const prev = get().notes.find((n) => n.id === id)
    if (!prev) return
    const next: Note = { ...prev, ...patch, updatedAt: Date.now() }
    set((s) => ({
      notes: s.notes.map((n) => (n.id === id ? next : n)),
    }))
    void persist(next, prev)
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
    affected.forEach(({ next, prev }) => void persist(next, prev))
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
    set((s) => ({ notes: s.notes.filter((n) => !ids.includes(n.id)) }))
    try {
      await noteRepository.bulkRemove(ids)
    } catch (err) {
      console.error('[notely] failed to delete notes', err)
      set((s) => ({ notes: [...snapshots, ...s.notes].sort(sortPinnedFirstUpdatedDesc) }))
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
    set((s) => ({ notes: [copy, ...s.notes] }))
    void persist(copy, copy)
    return copy
  },

  async clearAllNotes() {
    const all = get().notes
    set({ notes: [] })
    try {
      await noteRepository.bulkRemove(all.map((n) => n.id))
    } catch (err) {
      console.error('[notely] failed to clear notes', err)
      set({ notes: all })
      toast.error('Could not clear notes')
    }
  },
}))
