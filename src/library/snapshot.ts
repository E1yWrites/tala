import Dexie from 'dexie'
import { db, SAFETY_DB } from '@/database/db'
import type {
  AppSettings,
  AudioChunkRecord,
  BlobRecord,
  Folder,
  InkDocRecord,
  MetaRecord,
  Note,
  PageRecord,
  PdfRecord,
  RecordingRecord,
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
  'recordings',
  'audioChunks',
  'meta',
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
  recordings: RecordingRecord[]
  /** Always empty in a dump: audio is saved per lecture, never inside a backup (see dump). */
  audioChunks: AudioChunkRecord[]
  meta: MetaRecord[]
}

/**
 * Reads every library table. Tables an older schema doesn't have yet come back empty.
 * Audio bytes are left out on purpose: a zip is built in memory, and an
 * audio-inclusive backup can crash Safari. Recording rows still travel, so a
 * restored lecture shows up as "audio not in this backup".
 */
export async function dump(source: Dexie = db): Promise<Snapshot> {
  const existing = new Set(source.tables.map((t) => t.name))
  const rows = await Promise.all(
    LIBRARY_TABLES.map((t) => (t !== 'audioChunks' && existing.has(t) ? source.table(t).toArray() : [])),
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
    // a backup taken mid-lecture must not restore a recording that claims to be live
    recordings: (data.recordings ?? []).map((r) => (r.status === 'recording' ? { ...r, status: 'interrupted' as const } : r)),
    audioChunks: data.audioChunks ?? [],
    meta: data.meta ?? [],
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
 * Deletes everything, including the pre-upgrade safety copy and the iOS app's
 * library mirror (an erase must not leave the old notes behind). `db.delete()` blocks forever while another
 * tab holds a connection, so race a timeout: the caller reloads either way.
 */
export async function wipe(): Promise<void> {
  // The app's on-device copy first, and fully: if it outlived the erase, the
  // next boot would see empty storage and put the notes back (dynamic: mirror imports this module)
  await import('./mirror').then((m) => m.deleteMirror()).catch((err) => console.error('[tala] could not delete the on-device copy', err))
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 6000))
  const erase = Promise.all([db.delete(), Dexie.delete(SAFETY_DB)]).then(() => undefined, () => undefined)
  await Promise.race([erase, timeout])
}
