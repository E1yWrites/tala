import type { JSONContent } from '@tiptap/core'
import { usePageStore } from '@/store/pageStore'
import type { Note, PageRecord } from '@/types/models'
import { scanLines } from '@/entries/scan'
import { savePageContent, type SaveResult } from './notes'

/** A checklist item somewhere in the library. A Task lives in a Page's typed text. */
export interface TaskRef {
  noteId: string
  pageId: string
  /** 1-based, for display. */
  pageNumber: number
  /** Child indexes from the document root to the taskItem node. */
  path: number[]
  text: string
  checked: boolean
}

/** Every task on every page of the live (not trashed, not archived) notes, in note then page order. */
export function listTasks(notes: Note[], pagesByNote: Record<string, PageRecord[]>): TaskRef[] {
  // ponytail: hand-drawn tasks aren't listed until ticking one can rewrite its ink entry
  return scanLines(notes, pagesByNote).flatMap(({ noteId, pageId, pageNumber, path, text, task, archived }) =>
    task && !archived ? [{ noteId, pageId, pageNumber, path, text, checked: task.checked }] : [],
  )
}

/** Ticks or unticks a task by rewriting its page's text. Open editors are told to resync. */
export function toggleTask(ref: TaskRef): Promise<SaveResult> {
  const page = usePageStore.getState().pagesByNote[ref.noteId]?.find((p) => p.id === ref.pageId)
  if (!page?.content) return Promise.resolve('gone')
  const doc = structuredClone(page.content)
  let node: JSONContent | undefined = doc
  for (const i of ref.path) node = node?.content?.[i]
  if (node?.type !== 'taskItem') return Promise.resolve('gone')
  node.attrs = { ...node.attrs, checked: node.attrs?.checked !== true }
  const saved = savePageContent(ref.noteId, ref.pageId, doc)
  // An open editor keeps its own copy of the page text; make it reload this one
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tala:external-sync'))
  return saved
}
