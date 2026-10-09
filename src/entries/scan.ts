import type { JSONContent } from '@tiptap/core'
import { dayKey } from '@/coach/study'
import type { InkDoc } from '@/types/ink'
import type { Note, PageRecord } from '@/types/models'
import { docToPlainText } from '@/utils/doc'
import type { DayKey } from './dates'
import { entryContext, parseLine, TASK_LINE } from './parse'
import type { Entry, EntryContext } from './parse'

/*
  The page is the record: every roll-up (Tasks today; Agenda, Money, Habits
  next) re-reads the lines of every page instead of keeping its own table.
*/

/** One typed line of a page (or one hand-drawn entry) and the day it is pinned to. */
export interface Line {
  noteId: string
  pageId: string
  /** 1-based, for display. */
  pageNumber: number
  /** Child indexes from the doc root to the block (the taskItem for a task). Empty for ink. */
  path: number[]
  text: string
  /** The day it was written: relative words ("fri", "bukas") count from it. */
  at: DayKey
  task?: { checked: boolean }
  /** Ink entry id, for a line drawn by hand. */
  ink?: string
  archived: boolean
}

export interface EntryRef extends Line {
  entry: Entry
}

/** A paragraph's text as the editor sees it (marks split text nodes; they are not words). */
const textOf = (node: JSONContent): string =>
  node.type === 'text' ? (node.text ?? '') : (node.content ?? []).map(textOf).join('')

/** A checklist item's own text, not its nested sub-tasks'. */
const ownText = (item: JSONContent): string =>
  (item.content ?? [])
    .filter((c) => c.type !== 'taskList')
    .map((c) => docToPlainText(c))
    .join(' ')
    .trim()

type Found = Pick<Line, 'path' | 'text' | 'task'> & { at?: unknown }

function collect(node: JSONContent, path: number[], out: Found[]): void {
  if (node.type === 'taskItem') {
    const first = node.content?.find((c) => c.type === 'paragraph')
    out.push({ path, text: ownText(node), at: first?.attrs?.at, task: { checked: node.attrs?.checked === true } })
    // Its own paragraphs are the task; nested lists still count
    ;(node.content ?? []).forEach((c, i) => c.type === 'taskList' && collect(c, [...path, i], out))
    return
  }
  if (node.type === 'paragraph') {
    out.push({ path, text: textOf(node), at: node.attrs?.at })
    return
  }
  ;(node.content ?? []).forEach((child, i) => collect(child, [...path, i], out))
}

const isDay = (v: unknown): v is DayKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Every line of every page of the notes not in the trash (archived ones are marked), in note then page order. */
export function scanLines(notes: Note[], pagesByNote: Record<string, PageRecord[]>, inkDocs: Record<string, InkDoc> = {}): Line[] {
  const lines: Line[] = []
  for (const note of notes) {
    if (note.isDeleted) continue
    ;(pagesByNote[note.id] ?? []).forEach((page, i) => {
      const fallback = isDay(page.day) ? page.day : dayKey(page.createdAt)
      const base = { noteId: note.id, pageId: page.id, pageNumber: i + 1, archived: note.isArchived }
      const found: Found[] = []
      if (page.content) collect(page.content, [], found)
      for (const f of found) lines.push({ ...base, ...f, at: isDay(f.at) ? f.at : fallback })
      const ink = inkDocs[page.id]
      if (!ink?.entries?.length) return
      const live = new Set(ink.strokes.map((s) => s.id))
      for (const e of ink.entries) {
        if (!e.strokeIds.some((id) => live.has(id))) continue
        const task = TASK_LINE.exec(e.line)
        lines.push({
          ...base,
          path: [],
          text: task ? task[2]! : e.line,
          at: isDay(e.at) ? e.at : fallback,
          ink: e.id,
          ...(task ? { task: { checked: task[1] !== ' ' } } : {}),
        })
      }
    })
  }
  return lines
}

/** Every line that is an entry (every task is one). */
export function scanEntries(
  notes: Note[],
  pagesByNote: Record<string, PageRecord[]>,
  inkDocs: Record<string, InkDoc> = {},
  ctx: EntryContext = entryContext(),
): EntryRef[] {
  return scanLines(notes, pagesByNote, inkDocs).flatMap((line) => {
    const entry = parseLine(line.text, line.at, ctx, !!line.task)
    return entry ? [{ ...line, entry }] : []
  })
}
