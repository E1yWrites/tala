import Dexie, { type Table } from 'dexie'
import type { AppSettings, Folder, Note, Tag } from '@/types/models'

/* ---------------------------------------------------------------------------
   IndexedDB schema (Dexie).
   All persistence flows through repositories in src/database/repositories —
   components and stores never touch Dexie directly.
--------------------------------------------------------------------------- */

class NotelyDatabase extends Dexie {
  notes!: Table<Note, string>
  folders!: Table<Folder, string>
  tags!: Table<Tag, string>
  settings!: Table<AppSettings, string>

  constructor() {
    super('notely')
    this.version(1).stores({
      // Primary key first; secondary indexes only where bulk queries need them
      notes: 'id, folderId, updatedAt, isDeleted',
      folders: 'id, name',
      tags: 'id, name',
      settings: 'key',
    })
  }
}

export const db = new NotelyDatabase()

// Surface IndexedDB contention (another tab holding a connection during
// delete/upgrade) instead of letting requests block silently forever.
db.on('blocked', () => {
  window.dispatchEvent(new CustomEvent('notely:db-blocked'))
})
