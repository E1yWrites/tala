import type { Folder, Note, SortKey, Tag, ViewRef } from '@/types/models'
import { docPreview } from './doc'

/* Shared logic for "which notes are visible in this view" and ordering. */

const WEEK_MS = 7 * 24 * 3_600_000

export function notesForView(notes: Note[], view: ViewRef): Note[] {
  switch (view.kind) {
    case 'home':
    case 'settings':
      return []
    case 'all':
      return notes.filter((n) => !n.isDeleted && !n.isArchived)
    case 'favorites':
      return notes.filter((n) => !n.isDeleted && !n.isArchived && n.isFavorite)
    case 'pinned':
      return notes.filter((n) => !n.isDeleted && !n.isArchived && n.isPinned)
    case 'recent':
      return notes.filter(
        (n) => !n.isDeleted && !n.isArchived && Date.now() - n.updatedAt < WEEK_MS,
      )
    case 'archive':
      return notes.filter((n) => !n.isDeleted && n.isArchived)
    case 'trash':
      return notes.filter((n) => n.isDeleted)
    case 'folder':
      return notes.filter(
        (n) => !n.isDeleted && !n.isArchived && n.folderId === view.refId,
      )
    case 'tag':
      return notes.filter(
        (n) => !n.isDeleted && !n.isArchived && n.tagIds.includes(view.refId ?? ''),
      )
  }
}

/** Pinned-first everywhere except trash/archive where pinning is irrelevant. */
export function sortNotes(notes: Note[], sortKey: SortKey, pinnedFirst = true): Note[] {
  const sorted = [...notes]
  sorted.sort((a, b) => {
    if (pinnedFirst && a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1
    switch (sortKey) {
      case 'updated-desc':
        return b.updatedAt - a.updatedAt
      case 'updated-asc':
        return a.updatedAt - b.updatedAt
      case 'created-desc':
        return b.createdAt - a.createdAt
      case 'title-asc':
        return displayTitle(a).localeCompare(displayTitle(b))
      case 'title-desc':
        return displayTitle(b).localeCompare(displayTitle(a))
    }
  })
  return sorted
}

export function displayTitle(note: Note): string {
  return note.title.trim() || 'Untitled'
}

export interface ViewMeta {
  title: string
  description: string | null
}

export function viewMeta(
  view: ViewRef,
  folders: Folder[],
  tags: Tag[],
): ViewMeta {
  switch (view.kind) {
    case 'home':
      return { title: 'Home', description: null }
    case 'all':
      return { title: 'All Notes', description: null }
    case 'favorites':
      return { title: 'Favorites', description: 'Notes you starred' }
    case 'pinned':
      return { title: 'Pinned', description: 'Kept at the top of lists' }
    case 'recent':
      return { title: 'Recent', description: 'Edited in the last 7 days' }
    case 'archive':
      return { title: 'Archive', description: 'Out of the way, never lost' }
    case 'trash':
      return { title: 'Trash', description: 'Notes are removed forever after deletion here' }
    case 'folder': {
      const folder = folders.find((f) => f.id === view.refId)
      return { title: folder?.name ?? 'Folder', description: null }
    }
    case 'tag': {
      const tag = tags.find((t) => t.id === view.refId)
      return { title: tag ? `#${tag.name}` : 'Tag', description: null }
    }
    case 'settings':
      return { title: 'Settings', description: null }
  }
}

/** Text used by search filtering within the current list. */
export function searchableText(note: Note): string {
  return `${note.title}\u0000${docPreview(note.content, 4000)}`
}
