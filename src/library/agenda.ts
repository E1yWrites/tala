import type { JSONContent } from '@tiptap/core'
import { toDate } from '@/entries/dates'
import type { DayKey } from '@/entries/dates'
import type { EntryRef } from '@/entries/scan'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { appendLine } from './journal'
import { saveInk, savePageContent } from './notes'
import type { SaveResult } from './notes'

/*
  Agenda actions write lines, because the page is the record:
  skipping one class appends "skip oct 14" to its line; finishing a due-again
  item writes "✓ haircut" in today's journal page.
*/

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** A day the parser reads back exactly: "oct 14" (the year when it isn't the line's own). */
function spoken(day: DayKey, at: DayKey): string {
  const d = toDate(day)
  const year = day.slice(0, 4) !== at.slice(0, 4) ? ` ${d.getFullYear()}` : ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${year}`
}

/** Adds words to the end of a line: a paragraph's text, or a hand-drawn entry's typed form. */
function appendWords(ref: EntryRef, words: string): Promise<SaveResult> {
  if (ref.ink) {
    const doc = useNoteStore.getState().inkDocs[ref.pageId]
    if (!doc?.entries) return Promise.resolve('gone')
    saveInk(ref.noteId, ref.pageId, {
      ...doc,
      entries: doc.entries.map((e) => (e.id === ref.ink ? { ...e, line: `${e.line} ${words}` } : e)),
    })
    return Promise.resolve('saved')
  }
  return editParagraph(ref, (content) => [...content, { type: 'text', text: ` ${words}` }])
}

/** Rewrites a typed line's paragraph (not a hand-drawn entry) and saves its page. */
function editParagraph(ref: EntryRef, edit: (content: JSONContent[]) => JSONContent[]): Promise<SaveResult> {
  const page = usePageStore.getState().pagesByNote[ref.noteId]?.find((p) => p.id === ref.pageId)
  if (ref.ink || !page?.content) return Promise.resolve('gone')
  const doc = structuredClone(page.content)
  let node: JSONContent | undefined = doc
  for (const i of ref.path) node = node?.content?.[i]
  if (node?.type !== 'paragraph') return Promise.resolve('gone')
  node.content = edit(node.content ?? [])
  const saved = savePageContent(ref.noteId, ref.pageId, doc)
  // An open editor keeps its own copy of the page text; make it reload this one
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('tala:external-sync'))
  return saved
}

/** Replaces a typed line's text ("✓ water 3" → "✓ water 4"). */
export function replaceLine(ref: EntryRef, text: string): Promise<SaveResult> {
  return editParagraph(ref, () => [{ type: 'text', text }])
}

/** Leaves one day out of a repeating event. */
export function skipOccurrence(ref: EntryRef, day: DayKey): Promise<SaveResult> {
  return appendWords(ref, `skip ${spoken(day, ref.at)}`)
}

/** A due-again item done today: "✓ name" in today's journal page. */
export function markDone(name: string): void {
  appendLine(`✓ ${name}`)
}
