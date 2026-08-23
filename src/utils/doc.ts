import type { JSONContent } from '@tiptap/core'

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

/** Short preview for note list rows. */
export function docPreview(
  doc: JSONContent | null | undefined,
  maxLen = 120,
): string {
  const text = docToPlainText(doc).trim().replace(/\s+/g, ' ')
  if (text.length <= maxLen) return text
  return `${text.slice(0, maxLen).trimEnd()}…`
}

/** True when a note has no meaningful content yet. */
