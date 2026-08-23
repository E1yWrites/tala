import type { Folder, Note, Tag } from '@/types/models'
import { docToPlainText } from './doc'

/* ---------------------------------------------------------------------------
   Instant client-side search.
   Scores are computed over an in-memory snapshot, so results update as fast
   as typing — comfortably handling thousands of notes.
--------------------------------------------------------------------------- */

export interface SearchDoc {
  note: Note
  titleLower: string
  bodyLower: string
  tagNamesLower: string[]
  folderNameLower: string | null
}

export function buildSearchDocs(
  notes: Note[],
  tags: Tag[],
  folders: Folder[],
): SearchDoc[] {
  const tagNameById = new Map(tags.map((t) => [t.id, t.name.toLowerCase()]))
  const folderNameById = new Map(folders.map((f) => [f.id, f.name.toLowerCase()]))
  return notes.map((note) => ({
    note,
    titleLower: note.title.toLowerCase(),
    bodyLower: docToPlainText(note.content).toLowerCase(),
    tagNamesLower: note.tagIds.map((id) => tagNameById.get(id) ?? ''),
    folderNameLower: note.folderId ? (folderNameById.get(note.folderId) ?? null) : null,
  }))
}

function tokenize(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

/** AND-semantics scoring: every token must match at least one field. */
export function scoreDoc(d: SearchDoc, rawQuery: string): number {
  const tokens = tokenize(rawQuery)
  if (tokens.length === 0) return 0
  let total = 0
  for (const token of tokens) {
    let best = 0
    if (d.titleLower.startsWith(token)) best = Math.max(best, 40)
    else if (d.titleLower.includes(token)) best = Math.max(best, 25)

    for (const t of d.tagNamesLower) {
      if (!t) continue
      if (t === token) best = Math.max(best, 18)
      else if (t.includes(token)) best = Math.max(best, 12)
    }

    if (d.folderNameLower?.includes(token)) best = Math.max(best, 9)

    // Word-boundary body match beats loose substring match
    const idx = d.bodyLower.indexOf(token)
    if (idx >= 0) {
      const boundary =
        idx === 0 || /\W/.test(d.bodyLower[idx - 1] ?? ' ')
      best = Math.max(best, boundary ? 6 : 3)
    }
    if (best === 0) return 0 // token missed everywhere → not a result
    total += best
  }
  return total
}

export interface SearchHit {
  note: Note
  score: number
}

export function runSearch(docs: SearchDoc[], query: string): SearchHit[] {
  if (!query.trim()) return []
  const hits: SearchHit[] = []
  for (const d of docs) {
    const score = scoreDoc(d, query)
    if (score > 0) hits.push({ note: d.note, score })
  }
  return hits.sort((a, b) => b.score - a.score || b.note.updatedAt - a.note.updatedAt)
}

/* ------------------------------ Highlighting ------------------------------ */

export interface TextSegment {
  text: string
  hit: boolean
}

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Splits text into hit/non-hit segments for <mark> rendering. */
export function highlightText(
  text: string,
  query: string,
  maxLen = 160,
): TextSegment[] {
  const tokens = tokenize(query).filter((t) => t.length > 0)
  const source = text.length > maxLen ? `${text.slice(0, maxLen)}…` : text
  if (tokens.length === 0 || !source) return [{ text: source, hit: false }]

  try {
    const re = new RegExp(`(${tokens.map(escapeRe).join('|')})`, 'gi')
    const segments: TextSegment[] = []
    let last = 0
    for (const m of source.matchAll(re)) {
      const start = m.index ?? 0
      if (start > last) segments.push({ text: source.slice(last, start), hit: false })
      segments.push({ text: m[0], hit: true })
      last = start + m[0].length
    }
    if (last < source.length) segments.push({ text: source.slice(last), hit: false })
    return segments
  } catch {
    return [{ text: source, hit: false }]
  }
}
