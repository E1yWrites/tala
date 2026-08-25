import { db } from '../db'
import type { InkDocRecord } from '@/types/models'

/** Handwriting records live apart from notes so metadata edits stay cheap. */
export const inkRepository = {
  async all(): Promise<InkDocRecord[]> {
    return db.inkDocs.toArray()
  },
  async get(noteId: string): Promise<InkDocRecord | undefined> {
    return db.inkDocs.get(noteId)
  },
  async put(record: InkDocRecord): Promise<void> {
    await db.inkDocs.put(record)
  },
  async bulkPut(records: InkDocRecord[]): Promise<void> {
    await db.inkDocs.bulkPut(records)
  },
  async remove(noteId: string): Promise<void> {
    await db.inkDocs.delete(noteId)
  },
  async bulkRemove(noteIds: string[]): Promise<void> {
    await db.inkDocs.bulkDelete(noteIds)
  },
}
