import { create } from 'zustand'
import { toast } from 'sonner'
import { db } from '@/database/db'
import { tagRepository } from '@/database/repositories/tagRepository'
import { noteRepository } from '@/database/repositories/noteRepository'
import { useNoteStore } from './noteStore'
import { useUIStore } from './uiStore'
import { TAG_COLOR_KEYS } from '@/data/defaults'
import { createId } from '@/utils/id'
import type { Tag } from '@/types/models'

interface TagState {
  tags: Tag[]
  hydrated: boolean
  hydrate: (tags: Tag[]) => void
  /** Find an existing tag (case-insensitive) or create it. */
  ensureTag: (name: string) => Promise<Tag | null>
  ensureTags: (names: string[]) => Promise<Tag[]>
  renameTag: (id: string, name: string) => void
  /** Patch name/color of an existing tag (persisted optimistically). */
  updateTag: (id: string, patch: Partial<Pick<Tag, 'name' | 'color'>>) => void
  /** Deletes a tag and strips it from every note. */
  deleteTag: (id: string) => Promise<void>
  /** Removes tags that no note references anymore (after permanent deletes). */
  pruneUnused: () => Promise<void>
}

async function persist(tag: Tag): Promise<boolean> {
  try {
    await tagRepository.put(tag)
    return true
  } catch (err) {
    console.error('[tala] failed to persist tag', err)
    toast.error('Storage error — could not save tag')
    return false
  }
}

export const useTagStore = create<TagState>()((set, get) => ({
  tags: [],
  hydrated: false,

  hydrate(tags) {
    set({
      tags: [...tags].sort((a, b) => a.name.localeCompare(b.name)),
      hydrated: true,
    })
  },

  async ensureTag(name) {
    const trimmed = name.trim().replace(/^#/, '')
    if (!trimmed) return null
    const existing = get().tags.find(
      (t) => t.name.toLowerCase() === trimmed.toLowerCase(),
    )
    if (existing) return existing

    // Cycle palette colors based on current count for pleasant distribution
    const color = TAG_COLOR_KEYS[get().tags.length % TAG_COLOR_KEYS.length]
    const tag: Tag = { id: createId(), name: trimmed, color, createdAt: Date.now() }
    set((s) => ({ tags: [...s.tags, tag].sort((a, b) => a.name.localeCompare(b.name)) }))
    const ok = await persist(tag)
    if (!ok) {
      set((s) => ({ tags: s.tags.filter((t) => t.id !== tag.id) }))
      return null
    }
    return tag
  },

  async ensureTags(names) {
    const resolved: Tag[] = []
    for (const name of names) {
      const tag = await get().ensureTag(name)
      if (tag && !resolved.some((t) => t.id === tag.id)) resolved.push(tag)
    }
    return resolved
  },

  renameTag(id, name) {
    const trimmed = name.trim()
    if (!trimmed) return
    get().updateTag(id, { name: trimmed })
  },

  updateTag(id, patch) {
    const prev = get().tags.find((t) => t.id === id)
    if (!prev) return
    const next: Tag = {
      ...prev,
      ...patch,
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
    }
    if (next.name === prev.name && next.color === prev.color) return
    // Keep names unique (case-insensitive), matching createFolder's invariant
    if (patch.name !== undefined) {
      const collision = get().tags.find(
        (t) => t.id !== id && t.name.toLowerCase() === next.name.toLowerCase(),
      )
      if (collision) {
        toast.info(`Tag "${collision.name}" already exists`)
        return
      }
    }
    set((s) => ({
      tags: s.tags.map((t) => (t.id === id ? next : t)).sort((a, b) => a.name.localeCompare(b.name)),
    }))
    void persist(next).then((ok) => {
      if (!ok) {
        set((s) => ({ tags: s.tags.map((t) => (t.id === id ? prev : t)) }))
      }
    })
  },

  async deleteTag(id) {
    const prevTags = get().tags
    if (!prevTags.some((t) => t.id === id)) return

    set((s) => ({ tags: s.tags.filter((t) => t.id !== id) }))

    try {
      // One transaction: tag removal + reference stripping succeed or fail together.
      await db.transaction('rw', db.tags, db.notes, async () => {
        await tagRepository.remove(id)
        // Re-read current notes inside the transaction to avoid stale snapshots
        const currentAffected = useNoteStore
          .getState()
          .notes.filter((n) => n.tagIds.includes(id))
        if (currentAffected.length > 0) {
          await noteRepository.bulkPut(
            currentAffected.map((n) => ({ ...n, tagIds: n.tagIds.filter((t) => t !== id) })),
          )
        }
      })
      const finalAffected = useNoteStore
        .getState()
        .notes.filter((n) => n.tagIds.includes(id))
      if (finalAffected.length > 0) {
        useNoteStore.setState((s) => ({
          notes: s.notes.map((n) =>
            n.tagIds.includes(id) ? { ...n, tagIds: n.tagIds.filter((t) => t !== id) } : n,
          ),
        }))
      }

      // If the deleted tag is on screen, don't leave a ghost empty view
      const view = useUIStore.getState().activeView
      if (view.kind === 'tag' && view.refId === id) {
        useUIStore.getState().setView({ kind: 'all' })
      }
    } catch (err) {
      console.error('[tala] failed to delete tag', err)
      set({ tags: prevTags })
      toast.error('Could not delete tag')
    }
  },

  async pruneUnused() {
    const referenced = new Set<string>()
    for (const n of useNoteStore.getState().notes) {
      for (const id of n.tagIds) referenced.add(id)
    }
    const dead = get().tags.filter((t) => !referenced.has(t.id))
    if (dead.length === 0) return
    const prevTags = get().tags
    set((s) => ({ tags: s.tags.filter((t) => referenced.has(t.id)) }))
    try {
      await db.transaction('rw', db.tags, async () => {
        await tagRepository.bulkRemove(dead.map((t) => t.id))
      })
    } catch (err) {
      console.error('[tala] failed to prune tags', err)
      set({ tags: prevTags })
    }
  },
}))

export const selectTagById =
  (id: string | null | undefined) =>
  (s: TagState): Tag | undefined =>
    id ? s.tags.find((t) => t.id === id) : undefined
