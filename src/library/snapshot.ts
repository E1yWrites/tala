import Dexie from 'dexie'
import { db, SAFETY_DB } from '@/database/db'
import type {
  AppSettings,
  BlobRecord,
  Folder,
  InkDocRecord,
  Note,
  PageRecord,
  PdfRecord,
  Tag,
} from '@/types/models'
import { upgradePages } from './migrate'

/**
 * Every table that holds user data. A new table goes here and nowhere else:
 * dump, restore and wipe all follow this list (load reads only the light ones).
 */
export const LIBRARY_TABLES = [
  'notes',
  'folders',
  'tags',
  'settings',
  'inkDocs',
  'pages',
  'pdfs',
  'blobs',
] as const

export interface Snapshot {
  notes: Note[]
  folders: Folder[]
  tags: Tag[]
  settings: AppSettings[]
  inkDocs: InkDocRecord[]
  pages: PageRecord[]
  pdfs: PdfRecord[]
  blobs: BlobRecord[]
}

/** Reads every library table. Tables an older schema doesn't have yet come back empty. */
export async function dump(source: Dexie = db): Promise<Snapshot> {
  const existing = new Set(source.tables.map((t) => t.name))
  const rows = await Promise.all(
    LIBRARY_TABLES.map((t) => (existing.has(t) ? source.table(t).toArray() : [])),
  )
  return Object.fromEntries(LIBRARY_TABLES.map((t, i) => [t, rows[i]])) as unknown as Snapshot
}

/**
 * Writes a snapshot into the live database in one transaction.
 * - "replace" clears every table first (settings stay unless the backup has its own).
 * - "merge" overwrites on id collisions; a colliding note's old pages and ink
 *   go first so it doesn't end up with a mix of both versions.
 * Legacy data (pre-v4 backups) is upgraded to the page-owns-text model on the way in.
 */
export async function restore(data: Partial<Snapshot>, mode: 'merge' | 'replace'): Promise<void> {
  const notes = data.notes ?? []
  const upgraded = upgradePages(notes, data.pages ?? [])
  const upgradedIds = new Set(upgraded.pages.map((p) => p.id))
  const incoming: Snapshot = {
    notes,
    folders: data.folders ?? [],
    tags: data.tags ?? [],
    settings: data.settings ?? [],
    inkDocs: data.inkDocs ?? [],
    pages: [...(data.pages ?? []).filter((p) => !upgradedIds.has(p.id)), ...upgraded.pages],
    pdfs: data.pdfs ?? [],
    blobs: [...(data.blobs ?? []), ...upgraded.blobs],
  }

  await db.transaction('rw', LIBRARY_TABLES.map((t) => db.table(t)), async () => {
    if (mode === 'replace') {
      await Promise.all(LIBRARY_TABLES.filter((t) => t !== 'settings').map((t) => db.table(t).clear()))
    } else if (notes.length > 0) {
      const ids = notes.map((n) => n.id)
      const stale = await db.pages.where('noteId').anyOf(ids).toArray()
      await db.inkDocs.bulkDelete(stale.map((p) => p.id))
      await db.pages.bulkDelete(stale.map((p) => p.id))
      await db.pdfs.bulkDelete(ids)
    }
    for (const t of LIBRARY_TABLES) {
      if (incoming[t].length > 0) await db.table(t).bulkPut(incoming[t])
    }
  })
}

/**
 * Deletes everything, including the pre-upgrade safety copy (an erase must
 * not leave the old notes behind). `db.delete()` blocks forever while another
 * tab holds a connection, so race a timeout: the caller reloads either way.
 */
export async function wipe(): Promise<void> {
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000))
  const erase = Promise.all([db.delete(), Dexie.delete(SAFETY_DB)]).then(() => undefined, () => undefined)
  await Promise.race([erase, timeout])
}
