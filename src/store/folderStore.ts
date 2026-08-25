import { create } from 'zustand'
import { toast } from 'sonner'
import { db } from '@/database/db'
import { folderRepository } from '@/database/repositories/folderRepository'
import { useNoteStore } from './noteStore'
import { useUIStore } from './uiStore'
import { noteRepository } from '@/database/repositories/noteRepository'
import { createId } from '@/utils/id'
import type { Folder } from '@/types/models'

interface FolderState {
  folders: Folder[]
  hydrated: boolean
  hydrate: (folders: Folder[]) => void
  createFolder: (name: string) => Folder | null
  /** Returns false when the name was empty or collides with another folder. */
  renameFolder: (id: string, name: string) => Promise<boolean>
  /**
   * Deletes a folder; its live notes move back to the root (folderId = null).
   * Trashed notes keep their folderId so restoring returns them home.
   */
  deleteFolder: (id: string) => Promise<boolean>
}

async function persist(folder: Folder): Promise<boolean> {
  try {
    await folderRepository.put(folder)
    return true
  } catch (err) {
    console.error('[notely] failed to persist folder', err)
    toast.error('Storage error — could not save folder')
    return false
  }
}

export const useFolderStore = create<FolderState>()((set, get) => ({
  folders: [],
  hydrated: false,

  hydrate(folders) {
    set({
      folders: [...folders].sort((a, b) => a.name.localeCompare(b.name)),
      hydrated: true,
    })
  },

  createFolder(name) {
    const trimmed = name.trim()
    if (!trimmed) return null
    const existing = get().folders.find(
      (f) => f.name.toLowerCase() === trimmed.toLowerCase(),
    )
    if (existing) {
      toast.info(`Folder "${existing.name}" already exists`)
      return existing
    }
    const folder: Folder = { id: createId(), name: trimmed, createdAt: Date.now() }
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
      (f) => f.id !== id && f.name.toLowerCase() === trimmed.toLowerCase(),
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

  async deleteFolder(id) {
    const prevFolders = get().folders
    const target = prevFolders.find((f) => f.id === id)
    if (!target) return false

    set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }))
    try {
      // Re-home live notes to root; trashed notes keep folderId so a later
      // restore puts them back where they came from. One Dexie transaction
      // keeps disk state atomic.
      await db.transaction('rw', db.notes, db.folders, async () => {
        // Index lookup instead of a full table scan (notes carry ink blobs)
        const notesInFolder = await db.notes.where('folderId').equals(id).toArray()
        const moved = notesInFolder.filter((n) => !n.isDeleted)
        if (moved.length > 0) {
          await noteRepository.bulkPut(moved.map((n) => ({ ...n, folderId: null })))
        }
        await folderRepository.remove(id)
      })

      // Sync in-memory notes to match what was persisted
      useNoteStore.setState((s) => ({
        notes: s.notes.map(
          (n) => (n.folderId === id && !n.isDeleted ? { ...n, folderId: null } : n),
        ),
      }))

      // If the deleted folder is on screen, don't leave a ghost empty view
      const view = useUIStore.getState().activeView
      if (view.kind === 'folder' && view.refId === id) {
        useUIStore.getState().setView({ kind: 'all' })
      }
    } catch (err) {
      console.error('[notely] failed to delete folder', err)
      set({ folders: prevFolders })
      toast.error('Could not delete folder')
      return false
    }
    return true
  },
}))

export const selectFolderById =
  (id: string | null | undefined) =>
  (s: FolderState): Folder | undefined =>
    id ? s.folders.find((f) => f.id === id) : undefined
