import { db } from '../db'
import type { AssetRecord } from '@/types/models'

/**
 * Binary storage. Bytes are stored as raw ArrayBuffers (no base64) in their
 * own table, so a 30 MB PDF never rides along with a note or document row.
 */
export const assetRepository = {
  async get(id: string): Promise<AssetRecord | undefined> {
    return db.assets.get(id)
  },
  async ids(): Promise<string[]> {
    return db.assets.toCollection().primaryKeys()
  },
  async findBySha(sha256: string): Promise<AssetRecord | undefined> {
    return db.assets.where('sha256').equals(sha256).first()
  },
  async put(record: AssetRecord): Promise<void> {
    await db.assets.put(record)
  },
  async bulkPut(records: AssetRecord[]): Promise<void> {
    await db.assets.bulkPut(records)
  },
  async remove(id: string): Promise<void> {
    await db.assets.delete(id)
  },
  async bulkRemove(ids: string[]): Promise<void> {
    await db.assets.bulkDelete(ids)
  },
}
