import Dexie, { type Table } from 'dexie'
import type { AppSettings, Folder, Note, Tag } from '@/types/models'
import type { InkDocRecord } from '@/types/models'

/* ---------------------------------------------------------------------------
   IndexedDB schema (Dexie).
   All persistence flows through repositories in src/database/repositories —
   components and stores never touch Dexie directly.

   v2 splits handwriting out of the notes table: ink payloads can reach
   hundreds of KB, and rewriting them on every metadata touch (rename, tag,
   pin) was wasteful. Notes keep an `ink?: null` legacy field only for
   migration; live ink lives in `inkDocs` keyed by note id.
--------------------------------------------------------------------------- */

class TalaDatabase extends Dexie {
  notes!: Table<Note, string>
  folders!: Table<Folder, string>
  tags!: Table<Tag, string>
  settings!: Table<AppSettings, string>
  inkDocs!: Table<InkDocRecord, string>

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
  }
}

export const db = new TalaDatabase()

// Surface IndexedDB contention (another tab holding a connection during
// delete/upgrade) instead of letting requests block silently forever.
db.on('blocked', () => {
  window.dispatchEvent(new CustomEvent('tala:db-blocked'))
})
