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
  /**
   * Imported document backing this note (PDF, Word, PowerPoint) — see
   * DocumentRecord. Absent/null for ordinary typed notes (v3+).
   */
  documentId?: string | null
}

/** Handwriting stored out-of-line (v2+), keyed by its owning note. */
export interface InkDocRecord {
  noteId: string
  doc: InkDoc
}

/* ------------------------------- Documents -------------------------------- */

/** Source file formats the importer understands. */
export type DocumentFormat = 'pdf' | 'docx' | 'doc' | 'pptx' | 'ppt'

/**
 * How an imported file is represented inside Tala:
 *  - `pdf`            page model rendered by pdf.js, annotated with page ink
 *  - `rendered-html`  a self-contained HTML rendering (DOCX "preserve
 *                     appearance"), shown read-only in a sandboxed frame
 *  - `original-only`  the original file is kept as an attachment; the note's
 *                     typed content (if any) came from an editable conversion
 */
export type DocumentKind = 'pdf' | 'rendered-html' | 'original-only'

/** User-facing import strategies. `auto` picks the safest representation. */
export type ImportStrategy = 'auto' | 'editable' | 'preserve'

/** One live page of a PDF document. */
export interface DocumentPage {
  /**
   * Stable per-page id — page annotations key off this, so reordering or
   * deleting pages never orphans ink.
   */
  id: string
  /** 0-based index into the source PDF. */
  sourceIndex: number
  /** Page size in PDF points (after the source page's own rotation). */
  width: number
  height: number
  /** Extra user rotation in degrees (0 | 90 | 180 | 270). */
  rotation: number
  /** Typed notes placed on the page (displayed-page points). */
  texts?: PageTextNote[]
}

/** A typed note placed on a document page. */
export interface PageTextNote {
  id: string
  /** Top-left corner in displayed-page points. */
  x: number
  y: number
  /** Wrapping width in points. */
  width: number
  text: string
  /** Font size in points. */
  size: number
  color: string
}

export interface DocumentSource {
  fileName: string
  mime: string
  bytes: number
  format: DocumentFormat
}

export interface DocumentRecord {
  id: string
  noteId: string
  kind: DocumentKind
  source: DocumentSource
  /** Primary asset: PDF bytes, rendered HTML, or the original binary. */
  assetId: string
  /** Original file kept next to a converted representation (may equal assetId). */
  originalAssetId: string | null
  /** PDF only — ordered live pages. */
  pages?: DocumentPage[]
  /** Which strategy produced this representation. */
  strategy: ImportStrategy
  /** Human-readable note about the conversion, shown in the editor banner. */
  importNote: string | null
  createdAt: number
  updatedAt: number
}

/**
 * Large binaries live here; records elsewhere only hold ids. Bytes are kept
 * as an ArrayBuffer rather than a Blob: every engine structured-clones it
 * losslessly (WebKit has a history of Blob-in-IndexedDB bugs) and it never
 * goes through base64.
 */
export interface AssetRecord {
  id: string
  mime: string
  bytes: number
  /** Hex SHA-256 of the data — dedupes re-imports and validates packages. */
  sha256: string
  data: ArrayBuffer
  createdAt: number
}

/** Page annotations for a document-backed note: one record per page. */
export interface PageInkRecord {
  /** `${noteId}#${pageId}` — same key the note store uses in `inkDocs`. */
  id: string
  noteId: string
  pageId: string
  doc: InkDoc
}

/** Composite ink key for a document page. */
export const pageInkKey = (noteId: string, pageId: string): string => `${noteId}#${pageId}`

/** Splits an ink key into its owner note id and (optional) page id. */
export function parseInkKey(key: string): { noteId: string; pageId: string | null } {
  const i = key.indexOf('#')
  return i === -1 ? { noteId: key, pageId: null } : { noteId: key.slice(0, i), pageId: key.slice(i + 1) }
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
  /** Import PDF / Word / PowerPoint files (optionally pre-picked via drag & drop). */
  | { kind: 'import-document'; files?: File[] }
  /** Import a Tala ZIP package (share or full backup). */
  | { kind: 'import-package'; file?: File }
  | { kind: 'folder-editor'; folderId?: string }
  | { kind: 'move-note'; noteId: string }
  | { kind: 'tag-editor'; noteId: string }
  | { kind: 'profile-picture' }
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
