import { db } from '../db'
import type { Note } from '@/types/models'

/** All note CRUD flows through here — the seam for a future backend. */
export const noteRepository = {
  async all(): Promise<Note[]> {
    return db.notes.toArray()
  },
  async get(id: string): Promise<Note | undefined> {
    return db.notes.get(id)
  },
  async put(note: Note): Promise<void> {
    await db.notes.put(note)
  },
  async bulkPut(notes: Note[]): Promise<void> {
    await db.notes.bulkPut(notes)
  },
  async remove(id: string): Promise<void> {
    await db.notes.delete(id)
  },
  async bulkRemove(ids: string[]): Promise<void> {
    await db.notes.bulkDelete(ids)
  },
}
