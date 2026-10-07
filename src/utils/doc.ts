import type { JSONContent } from '@tiptap/core'
import type { PageRecord } from '@/types/models'

/* ---------------------------------------------------------------------------
   Helpers for working with Tiptap document JSON:
   plain-text extraction (search/previews), task statistics, emptiness checks.
--------------------------------------------------------------------------- */

/** True when the node looks like usable Tiptap JSON (guards against corrupted docs). */
function isValidNode(node: unknown): node is JSONContent {
  return !!node && typeof node === 'object' && typeof (node as JSONContent).type === 'string'
}

/** Recursively collect all text content from a document. */
export function docToPlainText(doc: JSONContent | null | undefined): string {
  if (!isValidNode(doc)) return ''
  const out: string[] = []
  const walk = (node: JSONContent): void => {
    if (!isValidNode(node)) return
    if (node.type === 'text') {
      if (node.text) out.push(node.text)
      return
    }
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  walk(doc)
  return out.join(' ')
}

export interface TaskStats {
  total: number
  completed: number
}

export function countTasks(doc: JSONContent | null | undefined): TaskStats {
  let total = 0
  let completed = 0
  const walk = (node: JSONContent): void => {
    if (!isValidNode(node)) return
    if (node.type === 'taskItem') {
      total++
      if (node.attrs?.checked === true) completed++
    }
    if (Array.isArray(node.content)) node.content.forEach(walk)
  }
  if (isValidNode(doc)) walk(doc)
  return { total, completed }
}

/** Fast scan: does this document contain null/malformed nodes? No allocation. */
export function docNeedsCleanup(doc: unknown): boolean {
  if (!isValidNode(doc)) return true
  if (!Array.isArray(doc.content)) return false
  return doc.content.some((child) => !isValidNode(child) || docNeedsCleanup(child))
}

/**
 * Deep-copies a document, dropping null/malformed nodes that can end up in
 * IndexedDB after an interrupted write. Keeps the editor and every walker safe.
 */
export function sanitizeDoc(doc: unknown): JSONContent | null {
  if (!isValidNode(doc)) return null
  const clone: JSONContent = { type: doc.type }
  if (doc.attrs !== undefined && doc.attrs !== null) clone.attrs = doc.attrs
  if (typeof doc.text === 'string') clone.text = doc.text
  if (doc.marks !== undefined && doc.marks !== null) clone.marks = doc.marks
  if (Array.isArray(doc.content)) {
    const children = doc.content.map(sanitizeDoc).filter((c): c is JSONContent => c !== null)
    if (children.length > 0) clone.content = children
  }
  return clone
}

/** Short one-line preview of plain text. */
export function textPreview(text: string, maxLen = 120): string {
  const t = text.trim().replace(/\s+/g, ' ')
  if (t.length <= maxLen) return t
  return `${t.slice(0, maxLen).trimEnd()}…`
}

/** Typed text of every page of a note (search and previews read this, not the JSON). */
export function pagesText(pages: PageRecord[]): string {
  return pages.map((p) => p.text ?? '').filter(Boolean).join('\n')
}

/** Checklist totals across every page of a note. */
export function pagesTasks(pages: PageRecord[]): TaskStats {
  let total = 0
  let completed = 0
  for (const p of pages) {
    const t = countTasks(p.content)
    total += t.total
    completed += t.completed
  }
  return { total, completed }
}
