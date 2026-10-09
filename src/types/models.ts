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
  /** Legacy inline handwriting (v1 storage). Always null after migration. */
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
  /** A journal note: the month it logs, `YYYY-MM`. Its pages are that month's days. */
  journal?: string
}

/** Handwriting stored out-of-line (v2+), keyed by its owning note. */
export interface InkDocRecord {
  noteId: string
  doc: InkDoc
}

/** Sheet size in PDF points (1 pt = 1/72 in). */
export interface PageSize {
  w: number
  h: number
  kind: 'a4' | 'letter' | 'slide' | 'pdf'
}

/** One sheet of a Note. Owns its typed text; its Ink is keyed by this id. */
export interface PageRecord {
  id: string
  noteId: string
  index: number
  template: 'blank' | 'ruled' | 'grid'
  /**
   * Tiptap JSON typed on this page. `undefined` only on rows written before
   * v4, where page 1's text still lives in the legacy `Note.content`.
   */
  content?: JSONContent | null
  /** Plain text of `content` (typed pages) or the PDF text layer, for search and previews. */
  text?: string
  /** EXPERIMENT: text recognised from the page's handwriting (see library/inkText.ts). Searched, never shown. */
  inkText?: string
  /** Missing on legacy rows; read it through `pageSize()`. */
  size?: PageSize
  /** 1-based page number inside the note's imported PDF (see PdfRecord). */
  pdfPage?: number
  /** Pre-rendered raster background (PDF pages imported before v4), stored in `blobs`. */
  backgroundBlobId?: string
  /** Pre-v4 data-URL background; the v4 upgrade moves it into `blobs`. */
  background?: string | null
  /** A journal page: the day it logs, `YYYY-MM-DD`. Entries on it count from this day. */
  day?: string
  createdAt: number
  updatedAt: number
}

/** Binary payload kept out of the light rows so boot never loads it. */
export interface BlobRecord {
  id: string
  data: Blob
}

/** Lecture audio. Rows are light; the bytes live in `audioChunks` and are never loaded at boot. */
export interface RecordingRecord {
  id: string
  noteId: string
  /** Epoch ms. Strokes drawn while recording carry `ts`; `ts - startedAt` is the audio position. */
  startedAt: number
  /** Tracked by the recorder itself: browsers report `Infinity` for a chunked WebM. */
  durationMs: number
  mime: string
  /** `recording` on a row at boot means the app died mid-lecture; it becomes `interrupted`. */
  status: 'recording' | 'complete' | 'interrupted'
  chunkCount: number
  bytes: number
}

/** One timesliced piece of a recording, written the moment the browser hands it over. */
export interface AudioChunkRecord {
  recordingId: string
  seq: number
  data: Blob
}

/** Small key/value rows that belong in a backup (study days, weekly goal). Device prefs live in prefsStore instead. */
export interface MetaRecord {
  key: string
  value: unknown
}

/** The original PDF a note was imported from; the bytes live in `blobs`. */
export interface PdfRecord {
  noteId: string
  blobId: string
  pageCount: number
  createdAt: number
}

export interface Folder {
  id: string
  name: string
  parentId: string | null
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
  avatar?: string | null
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
  setupCompleted: boolean
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
  | 'tasks'
  | 'agenda'
  | 'money'
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
  | { kind: 'folder-editor'; folderId?: string; parentId?: string }
  | { kind: 'move-note'; noteId: string }
  | { kind: 'tag-editor'; noteId: string }
  | { kind: 'profile-picture' }
  | { kind: 'install-guide' }
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
