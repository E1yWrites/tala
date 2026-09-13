import { db } from '../db'
import type { PageInkRecord } from '@/types/models'

/** Per-page annotations of document-backed notes. */
export const pageInkRepository = {
  async byNote(noteId: string): Promise<PageInkRecord[]> {
    return db.pageInk.where('noteId').equals(noteId).toArray()
  },
  async all(): Promise<PageInkRecord[]> {
    return db.pageInk.toArray()
  },
  async put(record: PageInkRecord): Promise<void> {
    await db.pageInk.put(record)
  },
  async bulkPut(records: PageInkRecord[]): Promise<void> {
    await db.pageInk.bulkPut(records)
  },
  async remove(id: string): Promise<void> {
    await db.pageInk.delete(id)
  },
  async removeByNote(noteId: string): Promise<void> {
    await db.pageInk.where('noteId').equals(noteId).delete()
  },
  async removeByNotes(noteIds: string[]): Promise<void> {
    if (noteIds.length === 0) return
    await db.pageInk.where('noteId').anyOf(noteIds).delete()
  },
}
