import { create } from 'zustand'
import type { InkDoc } from '@/types/ink'
import type { InkDocRecord, Note } from '@/types/models'

/**
 * Notes and handwriting as plain state. Every mutation goes through
 * `src/library/notes.ts`, which is also the only code that persists them.
 */
interface NoteState {
  notes: Note[]
  /** Runtime mirror of out-of-line handwriting, keyed by PAGE id. */
  inkDocs: Record<string, InkDoc>
  hydrated: boolean
  hydrate: (notes: Note[]) => void
  hydrateInk: (records: InkDocRecord[]) => void
}

export const useNoteStore = create<NoteState>()((set) => ({
  notes: [],
  inkDocs: {},
  hydrated: false,

  hydrate(notes) {
    set({ notes, hydrated: true })
  },

  hydrateInk(records) {
    set(() => ({ inkDocs: Object.fromEntries(records.map((r) => [r.noteId, r.doc])) }))
  },
}))
