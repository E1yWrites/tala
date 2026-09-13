import { db } from '../db'
import type { DocumentRecord } from '@/types/models'

/** Imported-document metadata (PDF page model, conversion info, asset refs). */
export const documentRepository = {
  async all(): Promise<DocumentRecord[]> {
    return db.documents.toArray()
  },
  async get(id: string): Promise<DocumentRecord | undefined> {
    return db.documents.get(id)
  },
  async byNote(noteId: string): Promise<DocumentRecord[]> {
    return db.documents.where('noteId').equals(noteId).toArray()
  },
  async put(record: DocumentRecord): Promise<void> {
    await db.documents.put(record)
  },
  async bulkPut(records: DocumentRecord[]): Promise<void> {
    await db.documents.bulkPut(records)
  },
  async remove(id: string): Promise<void> {
    await db.documents.delete(id)
  },
  async bulkRemove(ids: string[]): Promise<void> {
    await db.documents.bulkDelete(ids)
  },
  /** Ids of documents that reference the asset (primary or original). */
  async referencingAsset(assetId: string): Promise<string[]> {
    const [a, b] = await Promise.all([
      db.documents.where('assetId').equals(assetId).primaryKeys(),
      db.documents.where('originalAssetId').equals(assetId).primaryKeys(),
    ])
    return Array.from(new Set([...a, ...b]))
  },
}
