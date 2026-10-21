import { dayKey } from '@/coach/study'
import { db } from '@/database/db'
import { entryContext } from '@/entries/parse'
import { scanEntries } from '@/entries/scan'
import type { EntryRef } from '@/entries/scan'
import { useIsipStore } from '@/store/isipStore'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import type { IsipEntry } from '@/types/models'
import { createId } from '@/utils/id'
import { enqueue } from './notes'

/*
  Isip keeps its own Entries: one typed line each, with the day it counts for.
  This is the only writer of `isipEntries`. The text is the record: the views
  re-read it (entries/scan.ts) and nothing read from it is stored. Writes take
  the library's one queue: the store changes first, a failed write puts it
  back and toasts.
*/

const byTime = (a: IsipEntry, b: IsipEntry): number => a.createdAt - b.createdAt
const setEntries = (fn: (es: IsipEntry[]) => IsipEntry[]): void => useIsipStore.setState((s) => ({ entries: fn(s.entries) }))
const getEntry = (id: string): IsipEntry | undefined => useIsipStore.getState().entries.find((e) => e.id === id)

/** Reads every Entry into the store (boot, and after a restore). They are short lines. */
export async function loadIsip(): Promise<void> {
  useIsipStore.setState({ entries: (await db.isipEntries.toArray()).sort(byTime) })
}

/** One Entry per non-empty line of `text` (a paste with several lines makes several), counting for `day`. */
export function addEntries(text: string, now = Date.now(), day = dayKey(now)): IsipEntry[] {
  const added = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // A millisecond apart, so a pasted list keeps its order through a delete and Undo
    .map((line, i) => ({ id: createId(), text: line, day, createdAt: now + i, updatedAt: now + i }))
  if (added.length === 0) return []
  const ids = new Set(added.map((e) => e.id))
  setEntries((es) => [...es, ...added])
  void enqueue(
    async () => {
      await db.isipEntries.bulkPut(added)
    },
    'save that line',
    () => setEntries((es) => es.filter((e) => !ids.has(e.id))),
  )
  return added
}

/** Changes an Entry's text or day. Its owner's decisions last only while their source text is still in the line. */
export function editEntry(id: string, patch: { text?: string; day?: string }, now = Date.now()): void {
  const prev = getEntry(id)
  const text = patch.text?.replace(/\s*\n\s*/g, ' ').trim() ?? prev?.text
  if (!prev || !text) return
  const next: IsipEntry = { ...prev, text, day: patch.day ?? prev.day, updatedAt: now }
  const kept = Object.entries(prev.decisions ?? {}).filter(([span]) => text.includes(span))
  if (kept.length) next.decisions = Object.fromEntries(kept)
  else delete next.decisions
  setEntries((es) => es.map((e) => (e.id === id ? next : e)))
  void enqueue(
    async () => {
      await db.isipEntries.put(next)
    },
    'save that line',
    () => setEntries((es) => es.map((e) => (e.id === id ? prev : e))),
  )
}

/** Deletes Entries; returns them so an Undo can put them back. */
export function deleteEntries(ids: string[]): IsipEntry[] {
  const gone = useIsipStore.getState().entries.filter((e) => ids.includes(e.id))
  if (gone.length === 0) return []
  setEntries((es) => es.filter((e) => !ids.includes(e.id)))
  void enqueue(
    async () => {
      await db.isipEntries.bulkDelete(gone.map((e) => e.id))
    },
    'delete that line',
    () => setEntries((es) => [...es, ...gone].sort(byTime)),
  )
  return gone
}

/** Puts deleted Entries back as they were (Undo). */
export function restoreEntries(entries: IsipEntry[]): void {
  if (entries.length === 0) return
  const ids = new Set(entries.map((e) => e.id))
  setEntries((es) => [...es.filter((e) => !ids.has(e.id)), ...entries].sort(byTime))
  void enqueue(
    async () => {
      await db.isipEntries.bulkPut(entries)
    },
    'put that line back',
    () => setEntries((es) => es.filter((e) => !ids.has(e.id))),
  )
}

let memo: { notes: unknown; pages: unknown; isip: unknown; ctx: unknown; refs: EntryRef[] } | null = null

/** Every Reading (Isip Entries, then the Tasks in Notes), re-read only when one of them or the parser's words changed. */
export function libraryRefs(): EntryRef[] {
  const { notes } = useNoteStore.getState()
  const pages = usePageStore.getState().pagesByNote
  const isip = useIsipStore.getState().entries
  const ctx = entryContext()
  if (memo?.notes !== notes || memo.pages !== pages || memo.isip !== isip || memo.ctx !== ctx) {
    memo = { notes, pages, isip, ctx, refs: scanEntries(notes, pages, isip, ctx) }
  }
  return memo.refs
}
