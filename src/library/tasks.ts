import type { JSONContent } from '@tiptap/core'
import { usePageStore } from '@/store/pageStore'
import type { Note, PageRecord } from '@/types/models'
import { docToPlainText } from '@/utils/doc'
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

/** The item's own text, not its nested sub-tasks'. */
const ownText = (item: JSONContent): string =>
  (item.content ?? [])
    .filter((c) => c.type !== 'taskList')
    .map((c) => docToPlainText(c))
    .join(' ')
    .trim()

function collect(node: JSONContent, path: number[], out: Array<{ path: number[]; text: string; checked: boolean }>): void {
  if (node.type === 'taskItem') {
    out.push({ path, text: ownText(node), checked: node.attrs?.checked === true })
  }
  ;(node.content ?? []).forEach((child, i) => collect(child, [...path, i], out))
}

/** Every task on every page of the live (not trashed, not archived) notes, in note then page order. */
export function listTasks(notes: Note[], pagesByNote: Record<string, PageRecord[]>): TaskRef[] {
  const refs: TaskRef[] = []
  for (const note of notes) {
    if (note.isDeleted || note.isArchived) continue
    ;(pagesByNote[note.id] ?? []).forEach((page, pageIndex) => {
      if (!page.content) return
      const found: Array<{ path: number[]; text: string; checked: boolean }> = []
      collect(page.content, [], found)
      for (const f of found) refs.push({ noteId: note.id, pageId: page.id, pageNumber: pageIndex + 1, ...f })
    })
  }
  return refs
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
