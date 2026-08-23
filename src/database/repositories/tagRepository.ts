import { db } from '../db'
import type { Tag } from '@/types/models'

export const tagRepository = {
  async all(): Promise<Tag[]> {
    return db.tags.toArray()
  },
  async put(tag: Tag): Promise<void> {
    await db.tags.put(tag)
  },
  async bulkPut(tags: Tag[]): Promise<void> {
    await db.tags.bulkPut(tags)
  },
  async remove(id: string): Promise<void> {
    await db.tags.delete(id)
  },
  async bulkRemove(ids: string[]): Promise<void> {
    await db.tags.bulkDelete(ids)
  },
}
