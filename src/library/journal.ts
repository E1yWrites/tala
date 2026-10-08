import type { JSONContent } from '@tiptap/core'
import { dayKey } from '@/coach/study'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { TASK_LINE } from '@/entries/parse'
import { addPage, createNote, savePageContent } from './notes'
import type { SaveResult } from './notes'

/*
  The journal is Bullet Journal's monthly and daily logs on Tala's own model:
  one note per month ("October 2026"), one page per day. Nothing exists until
  something is written: quick capture asks for today's page and appends a line.
*/

const monthTitle = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })

/** Today's journal page, made (with its month's note) if this is the first line of the day. */
export function todayPage(now = Date.now()): { noteId: string; pageId: string } {
  const day = dayKey(now)
  const month = day.slice(0, 7)
  const note = useNoteStore.getState().notes.find((n) => n.journal === month && !n.isDeleted)
  if (!note) {
    const created = createNote({ title: monthTitle.format(new Date(now)), journal: month, day })
    return { noteId: created.id, pageId: created.id }
  }
  const pages = usePageStore.getState().pagesByNote[note.id] ?? []
  const page = pages.find((p) => p.day === day) ?? addPage(note.id, undefined, undefined, day)
  return { noteId: note.id, pageId: page.id }
}

/** One typed line as the editor would have made it: `[ ] x` is a checklist item. */
function lineBlock(text: string, day: string): JSONContent {
  const para = (t: string): JSONContent => ({ type: 'paragraph', attrs: { at: day }, ...(t ? { content: [{ type: 'text', text: t }] } : {}) })
  const task = TASK_LINE.exec(text)
  if (!task) return para(text)
  return { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: task[1] !== ' ' }, content: [para(task[2]!)] }] }
}

const isBlankPara = (b: JSONContent | undefined): boolean => b?.type === 'paragraph' && !b.content?.length

/** Writes `text` as the last line of today's journal page. */
export function appendLine(text: string, now = Date.now()): { noteId: string; pageId: string; saved: Promise<SaveResult> } {
  const { noteId, pageId } = todayPage(now)
  const page = usePageStore.getState().pagesByNote[noteId]?.find((p) => p.id === pageId)
  const blocks = [...(page?.content?.content ?? [])]
  if (isBlankPara(blocks[blocks.length - 1])) blocks.pop() // the editor's trailing empty line
  blocks.push(lineBlock(text.trim(), page?.day ?? dayKey(now)))
  const saved = savePageContent(noteId, pageId, { type: 'doc', content: blocks })
  // An open editor keeps its own copy of the page text; make it reload this one
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tala:external-sync'))
  return { noteId, pageId, saved }
}
