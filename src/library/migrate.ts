import type { BlobRecord, Note, PageRecord } from '@/types/models'
import { docToPlainText } from '@/utils/doc'
import { createId } from '@/utils/id'
import { PAGE_SIZES } from './pageSize'

/** `data:image/jpeg;base64,...` → Blob. Synchronous on purpose: `fetch` inside a Dexie upgrade commits the transaction early. */
export function dataUrlToBlob(url: string): Blob | null {
  const m = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(url)
  if (!m) return null
  const bin = m[2] ? atob(m[3]!) : decodeURIComponent(m[3]!)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: m[1] ?? 'application/octet-stream' })
}

/**
 * Brings pre-v4 data up to "a Page owns its text": every note gets a page 1
 * (id === note id) holding a COPY of `Note.content`, text pages get a size,
 * and data-URL backgrounds become blobs. Returns only the rows that changed.
 * Used by the Dexie v4 upgrade and when restoring an old backup.
 */
export function upgradePages(
  notes: Note[],
  pages: PageRecord[],
): { pages: PageRecord[]; blobs: BlobRecord[] } {
  const byNote = new Map<string, PageRecord[]>()
  for (const p of pages) {
    const list = byNote.get(p.noteId)
    if (list) list.push(p)
    else byNote.set(p.noteId, [p])
  }
  const out: PageRecord[] = []
  const blobs: BlobRecord[] = []

  for (const note of notes) {
    const existing = byNote.get(note.id)
    const phantom = !existing || existing.length === 0
    const own: PageRecord[] = phantom
      ? [{ id: note.id, noteId: note.id, index: 0, template: 'blank', createdAt: note.createdAt, updatedAt: note.updatedAt }]
      : existing
    for (const page of own) {
      const patch: Partial<PageRecord> = {}
      if (page.content === undefined) {
        const content = page.id === note.id ? (note.content ?? null) : null
        patch.content = content
        patch.text = docToPlainText(content)
      }
      if (page.size === undefined && !page.background && page.backgroundBlobId === undefined) {
        patch.size = PAGE_SIZES.a4
      }
      const blob = page.background ? dataUrlToBlob(page.background) : null
      if (blob) {
        const id = createId()
        blobs.push({ id, data: blob })
        patch.backgroundBlobId = id
        patch.background = null
      }
      if (phantom || Object.keys(patch).length > 0) out.push({ ...page, ...patch })
    }
  }
  return { pages: out, blobs }
}
