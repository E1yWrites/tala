import type {
  AppSettings,
  BlobRecord,
  Folder,
  InkDocRecord,
  MetaRecord,
  Note,
  PageRecord,
  PdfRecord,
  RecordingRecord,
  Tag,
} from '@/types/models'
import type { InkDoc, InkEntry } from '@/types/ink'
import { DEFAULT_SETTINGS } from '@/data/defaults'
import { sanitizeDoc } from '@/utils/doc'
import JSZip from 'jszip'
import { toast } from 'sonner'
import { BITUIN } from '@/coach/copy'
import { detectEnv } from '@/coach/env'
import { downloadBlob } from '@/utils/markdown'
import { shareFile } from '@/utils/native'
import { usePrefsStore } from '@/store/prefsStore'
import { flush } from '@/library/notes'
import { dump, restore, type Snapshot } from '@/library/snapshot'

export interface BackupFile {
  app: 'tala'
  /** 1 = pre-v2 inline note.ink; 2 = handwriting in inkDocs; 3 = per-page text, PDFs and blobs. */
  version: 1 | 2 | 3
  exportedAt: number
  notes: Note[]
  folders: Folder[]
  tags: Tag[]
  settings: AppSettings | null
  inkDocs?: InkDocRecord[]
  /** Multi-page notes + PDF pages. Optional so v1/v2 JSON imports still work. */
  pages?: PageRecord[]
  pdfs?: PdfRecord[]
  /** Lecture audio rows (metadata only: the audio itself is never inside a backup). */
  recordings?: RecordingRecord[]
  /** Study days and the weekly goal. */
  meta?: MetaRecord[]
  /** Binary payloads: the bytes are separate zip entries named `blobs/<id>`. */
  blobs?: Array<{ id: string; type: string }>
  /** Runtime only (filled by importBackupFile from the zip entries); never serialized. */
  blobData?: BlobRecord[]
}

/** A parsed backup as library rows, ready for `restore()`. */
export function backupToSnapshot(backup: BackupFile): Partial<Snapshot> {
  return {
    notes: backup.notes,
    folders: backup.folders,
    tags: backup.tags,
    settings: backup.settings ? [backup.settings] : [],
    inkDocs: backup.inkDocs,
    pages: backup.pages,
    pdfs: backup.pdfs,
    blobs: backup.blobData,
    recordings: backup.recordings,
    meta: backup.meta,
  }
}

/** The JSON half of a backup. Blob bytes travel as separate zip entries (or files, in the mirror). */
export function snapshotToBackup(s: Snapshot): BackupFile {
  return {
    app: 'tala',
    version: 3,
    exportedAt: Date.now(),
    notes: s.notes,
    folders: s.folders,
    tags: s.tags,
    settings: s.settings[0] ?? null,
    inkDocs: s.inkDocs,
    pages: s.pages,
    pdfs: s.pdfs,
    recordings: s.recordings,
    meta: s.meta,
    blobs: s.blobs.map((b) => ({ id: b.id, type: b.data.type })),
  }
}

/** `.tala` archive: manifest.json + backup.json + one `blobs/<id>` entry per blob. */
export async function snapshotToZip(s: Snapshot): Promise<Blob> {
  const data = snapshotToBackup(s)
  const zip = new JSZip()
  zip.file(
    'manifest.json',
    JSON.stringify(
      { app: 'tala', format: 'tala-backup', version: 2, exportedAt: data.exportedAt, noteCount: s.notes.length },
      null,
      2,
    ),
  )
  zip.file('backup.json', JSON.stringify(data, null, 2))
  for (const b of s.blobs) zip.file(`blobs/${b.id}`, await b.data.arrayBuffer())
  return zip.generateAsync({ type: 'blob' })
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Saves a backup: the share sheet on phones and tablets (Files, iCloud, a
 * messaging app: downloads are unreliable in an installed iOS app), a normal
 * download everywhere else. Records the time so the weekly nudge can rest.
 */
export async function downloadBackup(): Promise<void> {
  // Pending debounced handwriting must land before we snapshot IndexedDB
  await flush()
  const blob = await snapshotToZip(await dump())
  const name = `tala-backup-${stamp()}.tala`

  let shared = false
  const { platform } = detectEnv()
  if (platform === 'capacitor') {
    // The app has no downloads: the share sheet is the only way out (Files, AirDrop, a chat)
    if (!(await shareFile(name, blob))) return
    shared = true
  } else if (platform === 'ios' || platform === 'android') {
    const file = new File([blob], name, { type: 'application/octet-stream' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Tala backup' })
        shared = true
      } catch (err) {
        // Closing the sheet is a choice, not a failure: nothing was saved
        if ((err as Error).name === 'AbortError') return
        // Anything else (e.g. the tap's permission lapsed while zipping): fall back to a download
      }
    }
  }
  if (!shared) downloadBlob(name, blob)
  usePrefsStore.getState().setCoach({ lastBackupAt: Date.now(), backupSnoozeUntil: 0 })
  toast.success(shared ? BITUIN.reaction.backupShared : BITUIN.reaction.backupDone)
}

/**
 * Reads a backup file from disk: a `.tala` ZIP (manifest.json + backup.json)
 * or a legacy `.json` export. Returns a validated BackupFile.
 */
export async function importBackupFile(file: File): Promise<BackupFile> {
  if (/\.tala$/i.test(file.name)) {
    let zip: JSZip
    let backupJson = ''
    try {
      zip = await JSZip.loadAsync(await file.arrayBuffer())
      backupJson = (await zip.file('backup.json')?.async('string')) ?? ''
    } catch {
      throw new Error('That file is not a valid .tala archive.')
    }
    if (!backupJson) throw new Error('That .tala file contains no backup data.')
    const backup = parseBackup(backupJson)
    backup.blobData = []
    for (const { id, type } of backup.blobs ?? []) {
      const bytes = await zip.file(`blobs/${id}`)?.async('arraybuffer')
      if (bytes) backup.blobData.push({ id, data: new Blob([bytes], { type }) })
    }
    return backup
  }
  return parseBackup(await file.text())
}

/** Validates an uploaded file's shape. Throws with a human-readable message. */
export function parseBackup(text: string): BackupFile {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const b = raw as Partial<BackupFile>
  if (b.app !== 'tala' || !Array.isArray(b.notes) || !Array.isArray(b.folders) || !Array.isArray(b.tags)) {
    throw new Error('That file is not a Tala backup.')
  }
  if (b.version !== 1 && b.version !== 2 && b.version !== 3) {
    throw new Error(`Unsupported backup version: ${String(b.version)}`)
  }
  const notes = b.notes.map(normalizeNote).filter((n): n is Note => n !== null)
  const folders = dedupeByName(b.folders.filter(isStorableRecord)).map((f) => ({
    ...f,
    parentId: typeof f.parentId === 'string' ? (f.parentId as string) : null,
  }))
  const tags = dedupeByName(b.tags.filter(isStorableRecord))

  // Handwriting: v2 carries dedicated records; v1 kept ink inline per note.
  // Both paths funnel into the same sanitized record list.
  const byId = new Map<string, InkDocRecord>()
  if (Array.isArray(b.inkDocs)) {
    for (const rec of b.inkDocs) {
      const doc = sanitizeInkDoc(rec)
      if (doc && isStr((rec as { noteId?: unknown }).noteId)) {
        byId.set(rec.noteId, { noteId: rec.noteId, doc })
      }
    }
  }
  for (const n of notes) {
    if (!n.ink) continue
    if (!byId.has(n.id)) byId.set(n.id, { noteId: n.id, doc: n.ink })
  }
  const inkDocs = Array.from(byId.values())
  // Inline ink now lives in inkDocs; don't write it twice
  for (let i = 0; i < notes.length; i++) if (notes[i]!.ink) notes[i] = { ...notes[i]!, ink: null }
  const pages = Array.isArray(b.pages)
    ? (b.pages as unknown[]).map(normalizePage).filter((p): p is PageRecord => p !== null)
    : []

  const pdfs = Array.isArray(b.pdfs)
    ? (b.pdfs as unknown[]).map(normalizePdf).filter((p): p is PdfRecord => p !== null)
    : []
  const blobs = Array.isArray(b.blobs)
    ? (b.blobs as unknown[])
        .filter((x): x is { id: string; type?: unknown } => isObj(x) && isStr(x.id))
        .map((x) => ({ id: x.id, type: typeof x.type === 'string' ? x.type : '' }))
    : []

  const recordings = Array.isArray(b.recordings)
    ? (b.recordings as unknown[]).map(normalizeRecording).filter((r): r is RecordingRecord => r !== null)
    : []
  const meta = Array.isArray(b.meta)
    ? (b.meta as unknown[]).filter((m): m is MetaRecord => isObj(m) && isStr(m.key) && 'value' in m)
        .map((m) => ({ key: m.key, value: m.value }))
    : []

  return {
    ...(b as BackupFile),
    version: 3,
    notes,
    folders,
    tags,
    settings: sanitizeSettings(b.settings),
    inkDocs,
    pages,
    pdfs,
    blobs,
    recordings,
    meta,
  }
}

function normalizeRecording(raw: unknown): RecordingRecord | null {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.noteId)) return null
  const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : d)
  return {
    id: raw.id,
    noteId: raw.noteId,
    startedAt: num(raw.startedAt, Date.now()),
    durationMs: num(raw.durationMs, 0),
    mime: typeof raw.mime === 'string' ? raw.mime : '',
    // a lecture cannot be live inside a file
    status: raw.status === 'complete' ? 'complete' : 'interrupted',
    chunkCount: num(raw.chunkCount, 0),
    bytes: num(raw.bytes, 0),
  }
}

function normalizePdf(raw: unknown): PdfRecord | null {
  if (!isObj(raw) || !isStr(raw.noteId) || !isStr(raw.blobId)) return null
  return {
    noteId: raw.noteId,
    blobId: raw.blobId,
    pageCount: typeof raw.pageCount === 'number' && Number.isFinite(raw.pageCount) ? raw.pageCount : 0,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
  }
}

/** Coerces one backup page into a safe PageRecord, dropping broken entries. */
function normalizePage(raw: unknown): PageRecord | null {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.noteId)) return null
  const index = typeof raw.index === 'number' && Number.isFinite(raw.index) ? raw.index : 0
  const template = raw.template === 'ruled' || raw.template === 'grid' ? raw.template : 'blank'
  const now = Date.now()
  const page: PageRecord = {
    id: raw.id,
    noteId: raw.noteId,
    index,
    template,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : now,
  }
  // Pre-v4 pages carry no `content`: leave it undefined so restore() upgrades them.
  if (isObj(raw.content) || raw.content === null) page.content = sanitizeDoc(raw.content)
  if (typeof raw.text === 'string') page.text = raw.text
  if (typeof raw.inkText === 'string') page.inkText = raw.inkText
  const size = raw.size
  if (
    isObj(size) &&
    typeof size.w === 'number' && size.w > 0 &&
    typeof size.h === 'number' && size.h > 0 &&
    (size.kind === 'a4' || size.kind === 'letter' || size.kind === 'slide' || size.kind === 'pdf')
  ) {
    page.size = { w: size.w, h: size.h, kind: size.kind }
  }
  if (typeof raw.pdfPage === 'number' && raw.pdfPage >= 1) page.pdfPage = Math.floor(raw.pdfPage)
  if (isStr(raw.backgroundBlobId)) page.backgroundBlobId = raw.backgroundBlobId
  if (typeof raw.background === 'string' && raw.background.length > 0) page.background = raw.background
  if (typeof raw.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.day)) page.day = raw.day
  return page
}

/** Drops duplicate ids and case-insensitive duplicate names (first wins). */
function dedupeByName<T extends { id: string; name: string }>(items: T[]): T[] {
  const seenIds = new Set<string>()
  const seenNames = new Set<string>()
  return items.filter((item) => {
    const lowerName = item.name.toLowerCase()
    if (seenIds.has(item.id) || seenNames.has(lowerName)) return false
    seenIds.add(item.id)
    seenNames.add(lowerName)
    return true
  })
}

/**
 * Coerces a backup's settings into a safe AppSettings. Anything missing or
 * of the wrong type falls back to defaults; a non-settings object yields
 * null so restore keeps the local settings instead of persisting garbage
 * (e.g. theme:"banana") that the app would then trust forever.
 */
function sanitizeSettings(raw: unknown): AppSettings | null {
  if (!isObj(raw) || raw.key !== 'app') return null
  const numOr = (v: unknown, fallback: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : fallback
  const themes = ['light', 'dark', 'system']
  const densities = ['compact', 'comfortable', 'grid']
  const sortKeys = ['updated-desc', 'updated-asc', 'created-desc', 'title-asc', 'title-desc']
  const s = DEFAULT_SETTINGS
  const profile =
    isObj(raw.profile) && typeof raw.profile.name === 'string'
      ? { name: raw.profile.name, role: typeof raw.profile.role === 'string' ? raw.profile.role : s.profile.role }
      : s.profile
  return {
    key: 'app',
    theme: themes.includes(raw.theme as string) ? (raw.theme as AppSettings['theme']) : s.theme,
    editorFontSize: numOr(raw.editorFontSize, s.editorFontSize, 12, 24),
    editorLineHeight: numOr(raw.editorLineHeight, s.editorLineHeight, 1.2, 2.4),
    autosaveEnabled: typeof raw.autosaveEnabled === 'boolean' ? raw.autosaveEnabled : s.autosaveEnabled,
    confirmBeforeDelete:
      typeof raw.confirmBeforeDelete === 'boolean' ? raw.confirmBeforeDelete : s.confirmBeforeDelete,
    viewDensity: densities.includes(raw.viewDensity as string)
      ? (raw.viewDensity as AppSettings['viewDensity'])
      : s.viewDensity,
    sortKey: sortKeys.includes(raw.sortKey as string) ? (raw.sortKey as AppSettings['sortKey']) : s.sortKey,
    profile,
    setupCompleted: typeof raw.setupCompleted === 'boolean' ? raw.setupCompleted : s.setupCompleted,
  }
}

/* --------------------------- per-item validation --------------------------- */

const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** Minimal shape check for an out-of-line handwriting record. */
function sanitizeInkDoc(rec: unknown): Note['ink'] {
  if (!isObj(rec)) return null
  const doc = rec.doc
  if (!isObj(doc) || !Array.isArray((doc as { strokes?: unknown }).strokes)) return null
  const entries = (doc as { entries?: unknown }).entries
  if (entries === undefined) return doc as unknown as Note['ink']
  // Hand-drawn entries: keep only well-formed ones
  const ok = Array.isArray(entries)
    ? entries.filter(
        (e): e is InkEntry =>
          isObj(e) && isStr(e.id) && isStr(e.line) && isStr(e.at) && Array.isArray(e.strokeIds) && e.strokeIds.every(isStr),
      )
    : []
  return { ...(doc as unknown as InkDoc), entries: ok }
}

function isStorableRecord(v: unknown): v is Folder | Tag {
  return isObj(v) && isStr(v.id) && isStr((v as { name?: unknown }).name)
}

/**
 * Coerces one backup note into a safe Note, filling missing fields with sane
 * defaults and dropping entries too broken to display. Prevents a hand-edited
 * or future-drifted file from crashing the app after import.
 */
function normalizeNote(raw: unknown): Note | null {
  if (!isObj(raw) || !isStr(raw.id)) return null
  const num = (v: unknown, fallback: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : fallback
  const bool = (v: unknown): boolean => v === true
  const content =
    isObj(raw.content) || raw.content === null ? (raw.content as Note['content']) : null
  const ink =
    isObj(raw.ink) && Array.isArray((raw.ink as { strokes?: unknown }).strokes)
      ? (raw.ink as unknown as Note['ink'])
      : null
  const tagIds = Array.isArray(raw.tagIds)
    ? (raw.tagIds as unknown[]).filter(isStr)
    : []
  return {
    id: raw.id,
    title: typeof raw.title === 'string' ? raw.title : '',
    content,
    ink,
    folderId: isStr(raw.folderId) ? raw.folderId : null,
    tagIds,
    isPinned: bool(raw.isPinned),
    isFavorite: bool(raw.isFavorite),
    isArchived: bool(raw.isArchived),
    isDeleted: bool(raw.isDeleted),
    deletedAt: typeof raw.deletedAt === 'number' ? raw.deletedAt : null,
    createdAt: num(raw.createdAt, Date.now()),
    updatedAt: num(raw.updatedAt, num(raw.createdAt, Date.now())),
    ...(typeof raw.journal === 'string' && /^\d{4}-\d{2}$/.test(raw.journal) ? { journal: raw.journal } : {}),
  }
}

/**
 * Restores a backup.
 * - "merge" keeps existing notes and overwrites on id collisions.
 * - "replace" wipes the library first.
 * Refreshes all stores from IndexedDB afterwards.
 */
export async function restoreBackup(
  backup: BackupFile,
  mode: 'merge' | 'replace',
): Promise<{ notes: number; folders: number; tags: number }> {
  await restore(backupToSnapshot(backup), mode)
  // Dynamic: boot -> safety -> this module would otherwise be an import cycle
  const { hydrateAll } = await import('@/library/boot')
  await hydrateAll()
  // Open editors may hold pre-import docs — let them resync (see NoteEditor)
  window.dispatchEvent(new CustomEvent('tala:external-sync', { detail: 'restore' }))
  return { notes: backup.notes.length, folders: backup.folders.length, tags: backup.tags.length }
}
