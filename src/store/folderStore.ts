import { create } from 'zustand'
import { toast } from 'sonner'
import { folderRepository } from '@/database/repositories/folderRepository'
import { removeFolders } from '@/library/references'
import { useUIStore } from './uiStore'
import { createId } from '@/utils/id'
import type { Folder } from '@/types/models'

interface FolderState {
  folders: Folder[]
  hydrated: boolean
  /** Set of folder ids whose children are expanded in the sidebar. */
  expandedFolderIds: Set<string>
  hydrate: (folders: Folder[]) => void
  createFolder: (name: string, parentId?: string | null) => Folder | null
  renameFolder: (id: string, name: string) => Promise<boolean>
  moveFolder: (id: string, newParentId: string | null) => Promise<boolean>
  deleteFolder: (id: string) => Promise<boolean>
  toggleFolderExpand: (id: string) => void
}

async function persist(folder: Folder): Promise<boolean> {
  try {
    await folderRepository.put(folder)
    return true
  } catch (err) {
    console.error('[tala] failed to persist folder', err)
    toast.error('Storage error — could not save folder')
    return false
  }
}

/** Check if moving `folderId` under `targetParentId` would create a cycle. */
function wouldCycle(folders: Folder[], folderId: string, targetParentId: string | null): boolean {
  if (targetParentId === null) return false
  if (folderId === targetParentId) return true
  let current = folders.find((f) => f.id === targetParentId)
  while (current) {
    if (current.id === folderId) return true
    current = current.parentId ? folders.find((f) => f.id === current!.parentId) : undefined
  }
  return false
}

/** Get all descendant ids of a folder (for recursive operations). */
function descendantIds(folders: Folder[], parentId: string): string[] {
  const children = folders.filter((f) => f.parentId === parentId)
  const ids: string[] = []
  for (const child of children) {
    ids.push(child.id)
    ids.push(...descendantIds(folders, child.id))
  }
  return ids
}

export const useFolderStore = create<FolderState>()((set, get) => ({
  folders: [],
  hydrated: false,
  expandedFolderIds: new Set(),

  hydrate(folders) {
    set({
      folders: [...folders].sort((a, b) => a.name.localeCompare(b.name)),
      hydrated: true,
    })
  },

  createFolder(name, parentId = null) {
    const trimmed = name.trim()
    if (!trimmed) return null
    // Check for duplicate name within the same parent
    const existing = get().folders.find(
      (f) =>
        f.parentId === parentId &&
        f.name.toLowerCase() === trimmed.toLowerCase(),
    )
    if (existing) {
      toast.info(`Folder "${existing.name}" already exists`)
      return existing
    }
    const folder: Folder = {
      id: createId(),
      name: trimmed,
      parentId: parentId ?? null,
      createdAt: Date.now(),
    }
    set((s) => ({
      folders: [...s.folders, folder].sort((a, b) => a.name.localeCompare(b.name)),
    }))
    void persist(folder).then((ok) => {
      if (!ok) {
        set((s) => ({ folders: s.folders.filter((f) => f.id !== folder.id) }))
      }
    })
    return folder
  },

  async renameFolder(id, name) {
    const trimmed = name.trim()
    if (!trimmed) return false
    const prev = get().folders.find((f) => f.id === id)
    if (!prev || prev.name === trimmed) return false
    const collision = get().folders.find(
      (f) =>
        f.id !== id &&
        f.parentId === prev.parentId &&
        f.name.toLowerCase() === trimmed.toLowerCase(),
    )
    if (collision) {
      toast.info(`Folder "${collision.name}" already exists`)
      return false
    }
    const next = { ...prev, name: trimmed }
    set((s) => ({
      folders: s.folders
        .map((f) => (f.id === id ? next : f))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }))
    const ok = await persist(next)
    if (!ok) {
      set((s) => ({ folders: s.folders.map((f) => (f.id === id ? prev : f)) }))
      return false
    }
    return true
  },

  async moveFolder(id, newParentId) {
    const prev = get().folders.find((f) => f.id === id)
    if (!prev) return false
    if (prev.parentId === newParentId) return false
    if (wouldCycle(get().folders, id, newParentId)) {
      toast.error('Cannot move a folder into one of its own subfolders')
      return false
    }
    const next = { ...prev, parentId: newParentId }
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? next : f)),
    }))
    const ok = await persist(next)
    if (!ok) {
      set((s) => ({ folders: s.folders.map((f) => (f.id === id ? prev : f)) }))
      return false
    }
    return true
  },

  async deleteFolder(id) {
    const prevFolders = get().folders
    const target = prevFolders.find((f) => f.id === id)
    if (!target) return false

    // Collect all descendant folders + the target itself
    const toDelete = [id, ...descendantIds(prevFolders, id)]

    set((s) => ({
      folders: s.folders.filter((f) => !toDelete.includes(f.id)),
    }))
    try {
      await removeFolders(toDelete)

      const view = useUIStore.getState().activeView
      if (view.kind === 'folder' && view.refId && toDelete.includes(view.refId)) {
        useUIStore.getState().setView({ kind: 'all' })
      }
    } catch (err) {
      console.error('[tala] failed to delete folder', err)
      set({ folders: prevFolders })
      toast.error('Could not delete folder')
      return false
    }
    return true
  },

  toggleFolderExpand(id) {
    set((s) => {
      const next = new Set(s.expandedFolderIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { expandedFolderIds: next }
    })
  },
}))

export const selectFolderById =
  (id: string | null | undefined) =>
  (s: FolderState): Folder | undefined =>
    id ? s.folders.find((f) => f.id === id) : undefined
