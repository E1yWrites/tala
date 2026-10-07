import { create } from 'zustand'
import type { PageRecord } from '@/types/models'
import { docNeedsCleanup, sanitizeDoc } from '@/utils/doc'

/**
 * Pages as plain state, keyed by note id and sorted by index. Every mutation
 * goes through `src/library/notes.ts`.
 */
interface PageState {
  pagesByNote: Record<string, PageRecord[]>
  hydrated: boolean
  hydrate: (pages: PageRecord[]) => void
}

const NO_PAGES: PageRecord[] = []

export const usePageStore = create<PageState>()((set) => ({
  pagesByNote: {},
  hydrated: false,

  hydrate(pages) {
    const byNote: Record<string, PageRecord[]> = {}
    for (const p of pages) {
      // Drop null/malformed nodes left by interrupted writes so the editor and
      // doc helpers never see corrupted Tiptap JSON.
      const clean =
        p.content && docNeedsCleanup(p.content) ? { ...p, content: sanitizeDoc(p.content) } : p
      ;(byNote[p.noteId] ??= []).push(clean)
    }
    for (const list of Object.values(byNote)) list.sort((a, b) => a.index - b.index)
    set({ pagesByNote: byNote, hydrated: true })
  },
}))

/** Stable empty array so selectors for unknown notes don't re-render forever. */
export const useNotePages = (noteId: string): PageRecord[] =>
  usePageStore((s) => s.pagesByNote[noteId] ?? NO_PAGES)
