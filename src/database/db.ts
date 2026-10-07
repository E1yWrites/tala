import Dexie, { type Table } from 'dexie'
import type { AppSettings, Folder, Note, PageRecord, PdfRecord, Tag } from '@/types/models'
import type { AudioChunkRecord, BlobRecord, InkDocRecord, MetaRecord, RecordingRecord } from '@/types/models'
import { upgradePages } from '@/library/migrate'

/* ---------------------------------------------------------------------------
   IndexedDB schema (Dexie). Only src/library (and the small folder/tag/settings
   repositories) read or write it; components never touch Dexie.

   v2 splits handwriting out of the notes table (inkDocs, keyed by PAGE id; the
   field is still called `noteId`, renaming a primary key needs a new table).
   v3 adds nested folders (parentId), pages and pdfs.
   v4 makes a Page own its typed text (copied, never moved, from Note.content),
   and adds `blobs` for binary data so boot never loads it.
   v5 adds lecture audio (`recordings` rows + `audioChunks`) and `meta`. Additive only: there
   is no downgrade path, which is why boot keeps a safety copy first.
--------------------------------------------------------------------------- */

class TalaDatabase extends Dexie {
  notes!: Table<Note, string>
  folders!: Table<Folder, string>
  tags!: Table<Tag, string>
  settings!: Table<AppSettings, string>
  inkDocs!: Table<InkDocRecord, string>
  pages!: Table<PageRecord, string>
  pdfs!: Table<PdfRecord, string>
  blobs!: Table<BlobRecord, string>
  recordings!: Table<RecordingRecord, string>
  audioChunks!: Table<AudioChunkRecord, [string, number]>
  meta!: Table<MetaRecord, string>

  constructor() {
    super('tala')
    this.version(1).stores({
      // Primary key first; secondary indexes only where bulk queries need them
      notes: 'id, folderId, updatedAt, isDeleted',
      folders: 'id, name',
      tags: 'id, name',
      settings: 'key',
    })
    this.version(2)
      .stores({
        notes: 'id, folderId, updatedAt, isDeleted',
        folders: 'id, name',
        tags: 'id, name',
        settings: 'key',
        inkDocs: 'noteId',
      })
      .upgrade(async (tx) => {
        // Move inline v1 ink onto the new table in chunks so huge libraries
        // don't build one giant transaction payload.
        const notes = await tx.table('notes').toArray()
        const records: InkDocRecord[] = []
        const stripped: Array<Note> = []
        for (const note of notes) {
          if (!note.ink) continue
          records.push({ noteId: note.id, doc: note.ink })
          stripped.push({ ...note, ink: null })
        }
        if (records.length > 0) {
          await tx.table('inkDocs').bulkPut(records)
          for (let i = 0; i < stripped.length; i += 100) {
            await tx.table('notes').bulkPut(stripped.slice(i, i + 100))
          }
        }
      })
    this.version(3)
      .stores({
        notes: 'id, folderId, updatedAt, isDeleted',
        folders: 'id, name, parentId',
        tags: 'id, name',
        settings: 'key',
        inkDocs: 'noteId',
        pages: 'id, noteId, [noteId+index]',
        pdfs: 'noteId',
      })
      .upgrade(async (tx) => {
        // Add parentId=null to all existing folders
        const folders = await tx.table('folders').toArray()
        if (folders.length > 0) {
          await tx.table('folders').bulkPut(
            folders.map((f) => ({ ...f, parentId: null })),
          )
        }
        // Migrate existing single-page notes: create a Page record for each note
        // that has content or ink.
        const notes = await tx.table('notes').toArray()
        const inkDocs = await tx.table('inkDocs').toArray()
        const inkByNote = new Map<string, InkDocRecord>()
        for (const rec of inkDocs) inkByNote.set(rec.noteId, rec)

        const pages: PageRecord[] = []
        for (const note of notes) {
          const hasContent = note.content !== null && note.content !== undefined
          const hasInk = inkByNote.has(note.id)
          if (hasContent || hasInk) {
            pages.push({
              id: note.id, // page id = note id for the first page
              noteId: note.id,
              index: 0,
              template: 'blank',
              createdAt: note.createdAt,
              updatedAt: note.updatedAt,
            })
          }
        }
        if (pages.length > 0) {
          await tx.table('pages').bulkPut(pages)
        }
      })
    this.version(4)
      .stores({
        notes: 'id, folderId, updatedAt, isDeleted',
        folders: 'id, name, parentId',
        tags: 'id, name',
        settings: 'key',
        inkDocs: 'noteId',
        pages: 'id, noteId, [noteId+index]',
        pdfs: 'noteId',
        blobs: 'id',
      })
      .upgrade(async (tx) => {
        const { pages, blobs } = upgradePages(
          await tx.table('notes').toArray(),
          await tx.table('pages').toArray(),
        )
        if (blobs.length > 0) await tx.table('blobs').bulkPut(blobs)
        if (pages.length > 0) await tx.table('pages').bulkPut(pages)
      })
    this.version(5).stores({
      notes: 'id, folderId, updatedAt, isDeleted',
      folders: 'id, name, parentId',
      tags: 'id, name',
      settings: 'key',
      inkDocs: 'noteId',
      pages: 'id, noteId, [noteId+index]',
      pdfs: 'noteId',
      blobs: 'id',
      recordings: 'id, noteId',
      audioChunks: '[recordingId+seq], recordingId',
      meta: 'key',
    })
  }
}

/** Pre-upgrade copy of the library (see library/safety.ts). Lives beside the main database, so wipe() must remove it too. */
export const SAFETY_DB = 'tala-safety'

export const db = new TalaDatabase()

// Surface IndexedDB contention (another tab holding a connection during
// delete/upgrade) instead of letting requests block silently forever.
db.on('blocked', () => {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tala:db-blocked'))
})
