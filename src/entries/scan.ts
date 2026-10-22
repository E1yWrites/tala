import type { JSONContent } from '@tiptap/core'
import { dayKey } from '@/coach/study'
import type { IsipEntry, Note, PageRecord } from '@/types/models'
import { docToPlainText } from '@/utils/doc'
import type { DayKey } from './dates'
import { counts, read } from '@/isip/read'
import { entryContext, parseLine } from './parse'
import type { Entry, EntryContext } from './parse'

/*
  Where the roll-ups read from. Notes are for notes: the only lines read from a
  Page are its checklist items (Tasks). Everything else is an Isip Entry, one
  typed line, read with the same marker grammar. Nothing read is stored: every
  roll-up re-reads the text.
*/

/** A checklist item in a Page's typed text. */
export interface TaskLine {
  noteId: string
  pageId: string
  /** 1-based, for display. */
  pageNumber: number
  /** Child indexes from the doc root to the taskItem. */
  path: number[]
  text: string
  /** The day it was written: relative words ("fri", "bukas") count from it. */
  at: DayKey
  checked: boolean
  archived: boolean
}

/** What a line says, and where it was written: an Isip Entry (`isip`) or a Task in a Note (`task`). */
export interface EntryRef {
  entry: Entry
  /** The day it counts from: an Entry's day, a Task's pinned day. */
  at: DayKey
  /** The Isip Entry's id. */
  isip?: string
  /** The word a correction to this Reading is saved under (isip/read.ts). */
  key?: string
  task?: TaskLine
}

/** A checklist item's own text, not its nested sub-tasks'. */
const ownText = (item: JSONContent): string =>
  (item.content ?? [])
    .filter((c) => c.type !== 'taskList')
    .map((c) => docToPlainText(c))
    .join(' ')
    .trim()

type Found = Pick<TaskLine, 'path' | 'text' | 'checked'> & { at?: unknown }

function collect(node: JSONContent, path: number[], out: Found[]): void {
  if (node.type === 'taskItem') {
    const first = node.content?.find((c) => c.type === 'paragraph')
    out.push({ path, text: ownText(node), at: first?.attrs?.at, checked: node.attrs?.checked === true })
    // Its own paragraphs are the task; nested lists still count
    ;(node.content ?? []).forEach((c, i) => c.type === 'taskList' && collect(c, [...path, i], out))
    return
  }
  ;(node.content ?? []).forEach((child, i) => collect(child, [...path, i], out))
}

const isDay = (v: unknown): v is DayKey => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

/** Every checklist item of the notes not in the trash (archived ones are marked), in note then page order. */
export function scanTasks(notes: Note[], pagesByNote: Record<string, PageRecord[]>): TaskLine[] {
  const lines: TaskLine[] = []
  for (const note of notes) {
    if (note.isDeleted) continue
    ;(pagesByNote[note.id] ?? []).forEach((page, i) => {
      const found: Found[] = []
      if (page.content) collect(page.content, [], found)
      for (const f of found) {
        lines.push({ noteId: note.id, pageId: page.id, pageNumber: i + 1, archived: note.isArchived, ...f, at: isDay(f.at) ? f.at : dayKey(page.createdAt) })
      }
    })
  }
  return lines
}

/** What each Isip Entry says that counts (auto or confirmed Readings), in the order they were written. */
export function isipRefs(entries: IsipEntry[], ctx: EntryContext = entryContext()): EntryRef[] {
  return entries.flatMap((e) =>
    read(e, ctx)
      .filter(counts)
      .map((r) => ({ entry: r.entry, at: e.day, isip: e.id, ...(r.key ? { key: r.key } : {}) })),
  )
}

/** Every Reading: the Isip Entries', then the Tasks in Notes. */
export function scanEntries(
  notes: Note[],
  pagesByNote: Record<string, PageRecord[]>,
  isip: IsipEntry[],
  ctx: EntryContext = entryContext(),
): EntryRef[] {
  const tasks = scanTasks(notes, pagesByNote).map((task) => ({ entry: parseLine(task.text, task.at, ctx, true)!, at: task.at, task }))
  return [...isipRefs(isip, ctx), ...tasks]
}
