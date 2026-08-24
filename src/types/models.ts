import type { JSONContent } from '@tiptap/core'
import type { InkDoc } from './ink'

/* ---------------------------------------------------------------------------
   Domain models — the single source of truth for the app's data shape.
   These models are storage-agnostic: swapping IndexedDB for a backend later
   only requires re-implementing src/database/repositories.
--------------------------------------------------------------------------- */

export interface Note {
  id: string
  title: string
  /** Tiptap document JSON. Null for brand-new empty notes. */
  content: JSONContent | null
  /** Handwriting layer (vector strokes). Absent/null = no handwriting. */
  ink?: InkDoc | null
  folderId: string | null
  tagIds: string[]
  isPinned: boolean
  isFavorite: boolean
  isArchived: boolean
  isDeleted: boolean
  deletedAt: number | null
  createdAt: number
  updatedAt: number
}

export interface Folder {
  id: string
  name: string
  createdAt: number
}

export interface Tag {
  id: string
  name: string
  /** Key into TAG_COLOR palette (src/data/palette.ts) */
  color: string
  createdAt: number
}

export type ThemeMode = 'light' | 'dark' | 'system'
export type ViewDensity = 'compact' | 'comfortable' | 'grid'
export type SortKey =
  | 'updated-desc'
  | 'updated-asc'
  | 'created-desc'
  | 'title-asc'
  | 'title-desc'

export interface Profile {
  name: string
  role: string
}

export interface AppSettings {
  key: 'app'
  theme: ThemeMode
  editorFontSize: number // px (13–19)
  editorLineHeight: number // 1.5 | 1.7 | 1.9
  autosaveEnabled: boolean
  confirmBeforeDelete: boolean
  viewDensity: ViewDensity
  sortKey: SortKey
  profile: Profile
}

/* ---------------------------------- Views --------------------------------- */

export type ViewKind =
  | 'home'
  | 'all'
  | 'favorites'
  | 'pinned'
  | 'recent'
  | 'archive'
  | 'trash'
  | 'folder'
  | 'tag'
  | 'settings'

export interface ViewRef {
  kind: ViewKind
  /** folder id when kind === 'folder', tag id when kind === 'tag' */
  refId?: string
}

export const isSameView = (a: ViewRef, b: ViewRef): boolean =>
  a.kind === b.kind && a.refId === b.refId

/* --------------------------------- Modals --------------------------------- */

export type ModalIntent =
  | { kind: 'new-note' }
  | { kind: 'palette' }
  | { kind: 'search' }
  | { kind: 'share'; noteId: string }
   | { kind: 'folder-editor'; folderId?: string }
  | { kind: 'move-note'; noteId: string }
  | { kind: 'tag-editor'; noteId: string }
  | {
      kind: 'confirm'
      title: string
      message: string
      confirmLabel?: string
      danger?: boolean
      onConfirm: () => void
    }

/* -------------------------------- Templates ------------------------------- */

export interface NoteTemplate {
  id: string
  name: string
  description: string
  icon: string // lucide icon name, resolved in TemplatePickerModal
  suggestedTags?: string[]
  doc: () => JSONContent
}
