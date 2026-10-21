import { dayKey } from '@/coach/study'
import { db } from '@/database/db'
import { entryContext } from '@/entries/parse'
import type { IsipAliases } from '@/entries/parse'
import { scanEntries } from '@/entries/scan'
import type { EntryRef } from '@/entries/scan'
import { entryDay } from '@/isip/read'
import { useIsipStore } from '@/store/isipStore'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import type { IsipEntry } from '@/types/models'
import { createId } from '@/utils/id'
import { enqueue } from './notes'

/*
  Isip keeps its own Entries: one typed line each, with the day it counts for.
  This is the only writer of `isipEntries` and of Isip's `meta` rows (the
  `isip:aliases` name corrections). The text is the record: the views re-read
  it (isip/read.ts) and nothing read from it is stored, only the owner's
  decisions on a Reading. Writes take the library's one queue: the store
  changes first, a failed write puts it back and toasts.
*/

const ALIASES_KEY = 'isip:aliases'

const byTime = (a: IsipEntry, b: IsipEntry): number => a.createdAt - b.createdAt
const setEntries = (fn: (es: IsipEntry[]) => IsipEntry[]): void => useIsipStore.setState((s) => ({ entries: fn(s.entries) }))
const getEntry = (id: string): IsipEntry | undefined => useIsipStore.getState().entries.find((e) => e.id === id)

const names = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter((e): e is [string, string] => typeof e[1] === 'string' && !!e[1].trim())) : {}

/** Reads every Entry (they are short lines) and the name corrections into the store (boot, and after a restore). */
export async function loadIsip(): Promise<void> {
  const [entries, aliases] = await Promise.all([db.isipEntries.toArray(), db.meta.get(ALIASES_KEY)])
  const a = (aliases?.value ?? {}) as Partial<IsipAliases>
  useIsipStore.setState({ entries: entries.sort(byTime), aliases: { exercise: names(a.exercise), merchant: names(a.merchant) } })
}

/** Puts `next` in place of `prev`, in the store and then on disk. */
function replace(prev: IsipEntry, next: IsipEntry): void {
  setEntries((es) => es.map((e) => (e.id === prev.id ? next : e)))
  void enqueue(
    async () => {
      await db.isipEntries.put(next)
    },
    'save that line',
    () => setEntries((es) => es.map((e) => (e.id === prev.id ? prev : e))),
  )
}

/**
 * One Entry per non-empty line of `text` (a paste with several lines makes several), counting for `day`,
 * or the day a word in it names ("lunch 150 kahapon").
 */
export function addEntries(text: string, now = Date.now(), day = dayKey(now)): IsipEntry[] {
  const added = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    // A millisecond apart, so a pasted list keeps its order through a delete and Undo
    .map((line, i) => ({ id: createId(), text: line, day: entryDay(line, day), createdAt: now + i, updatedAt: now + i }))
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

const withDecisions = (e: IsipEntry, decisions: Array<[string, 'dismissed' | 'confirmed']>): IsipEntry => {
  const { decisions: _, ...rest } = e
  return decisions.length ? { ...rest, decisions: Object.fromEntries(decisions) } : rest
}

/**
 * Changes an Entry's text or day. A new day word in the text moves it, unless the day was changed by hand too.
 * Its owner's decisions last only while their source text is still in the line.
 */
export function editEntry(id: string, patch: { text?: string; day?: string }, now = Date.now()): void {
  const prev = getEntry(id)
  const text = patch.text?.replace(/\s*\n\s*/g, ' ').trim() ?? prev?.text
  if (!prev || !text) return
  let day = patch.day ?? prev.day
  if (text !== prev.text && day === prev.day) {
    const written = dayKey(prev.createdAt)
    const moved = entryDay(text, written)
    if (moved !== written) day = moved
  }
  const kept = Object.entries(prev.decisions ?? {}).filter(([span]) => text.includes(span))
  replace(prev, withDecisions({ ...prev, text, day, updatedAt: now }, kept))
}

/** The owner's say on one Reading, by its source text: `dismissed` (Undo), `confirmed`, or null to let Isip decide again. */
export function decide(id: string, span: string, decision: 'dismissed' | 'confirmed' | null, now = Date.now()): void {
  const prev = getEntry(id)
  if (!prev) return
  const others = Object.entries(prev.decisions ?? {}).filter(([s]) => s !== span)
  replace(prev, withDecisions({ ...prev, updatedAt: now }, decision ? [...others, [span, decision]] : others))
}

/** Calls what Isip read as `word` by `name` from now on ("incline db" → "Incline DB press"); an empty name forgets it. Never edits an Entry. */
export function setAlias(kind: keyof IsipAliases, word: string, name: string): void {
  const prev = useIsipStore.getState().aliases
  const { [word.toLowerCase()]: _, ...rest } = prev[kind]
  const next: IsipAliases = { ...prev, [kind]: name.trim() ? { ...rest, [word.toLowerCase()]: name.trim() } : rest }
  useIsipStore.setState({ aliases: next })
  void enqueue(
    async () => {
      await db.meta.put({ key: ALIASES_KEY, value: next })
    },
    'save that name',
    () => useIsipStore.setState({ aliases: prev }),
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
