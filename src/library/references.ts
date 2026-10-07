import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import type { Folder, Note, Tag } from '@/types/models'

/**
 * Drops links that point at rows that no longer exist (imports and merges can
 * leave them): note → folder, note → tag, folder → parent. Pure; returns only
 * the rows that changed so the caller can persist exactly those.
 */
export function repairRefs(
  notes: Note[],
  folders: Folder[],
  tags: Tag[],
): { notes: Note[]; folders: Folder[] } {
  const folderIds = new Set(folders.map((f) => f.id))
  const tagIds = new Set(tags.map((t) => t.id))
  return {
    notes: notes
      .filter(
        (n) =>
          (n.folderId !== null && !folderIds.has(n.folderId)) ||
          n.tagIds.some((id) => !tagIds.has(id)),
      )
      .map((n) => ({
        ...n,
        folderId: n.folderId !== null && folderIds.has(n.folderId) ? n.folderId : null,
        tagIds: n.tagIds.filter((id) => tagIds.has(id)),
      })),
    folders: folders
      .filter((f) => f.parentId !== null && !folderIds.has(f.parentId))
      .map((f) => ({ ...f, parentId: null })),
  }
}

/**
 * Deletes folders and moves every note inside them (trashed ones too) to the
 * root, in one transaction. Throws on failure; the caller rolls its store back.
 */
export async function removeFolders(ids: string[]): Promise<void> {
  await db.transaction('rw', db.notes, db.folders, async () => {
    const inside = await db.notes.where('folderId').anyOf(ids).toArray()
    await db.notes.bulkPut(inside.map((n) => ({ ...n, folderId: null })))
    await db.folders.bulkDelete(ids)
  })
  useNoteStore.setState((s) => ({
    notes: s.notes.map((n) => (n.folderId !== null && ids.includes(n.folderId) ? { ...n, folderId: null } : n)),
  }))
}

/** Deletes a tag and strips it from every note, in one transaction. Throws on failure. */
export async function removeTag(id: string): Promise<void> {
  await db.transaction('rw', db.tags, db.notes, async () => {
    const tagged = await db.notes.filter((n) => n.tagIds.includes(id)).toArray()
    await db.notes.bulkPut(tagged.map((n) => ({ ...n, tagIds: n.tagIds.filter((t) => t !== id) })))
    await db.tags.delete(id)
  })
  useNoteStore.setState((s) => ({
    notes: s.notes.map((n) => (n.tagIds.includes(id) ? { ...n, tagIds: n.tagIds.filter((t) => t !== id) } : n)),
  }))
}
