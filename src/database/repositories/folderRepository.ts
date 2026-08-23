import { db } from '../db'
import type { Folder } from '@/types/models'

export const folderRepository = {
  async all(): Promise<Folder[]> {
    return db.folders.toArray()
  },
  async put(folder: Folder): Promise<void> {
    await db.folders.put(folder)
  },
  async remove(id: string): Promise<void> {
    await db.folders.delete(id)
  },
}
