import type { AppSettings, Folder, InkDocRecord, Note, Tag } from '@/types/models'
import { DEFAULT_SETTINGS } from '@/data/defaults'
import {
  folderRepository,
  inkRepository,
  noteRepository,
  settingsRepository,
  tagRepository,
} from '@/database/repositories'
import { useNoteStore } from '@/store/noteStore'

export interface BackupFile {
  app: 'notely'
  /** 1 = pre-v2 inline note.ink; 2 = handwriting in inkDocs. */
  version: 1 | 2
  exportedAt: number
  notes: Note[]
  folders: Folder[]
  tags: Tag[]
  settings: AppSettings | null
  inkDocs?: InkDocRecord[]
}

export async function buildBackup(): Promise<BackupFile> {
  // Pending debounced handwriting must land before we snapshot IndexedDB
  await useNoteStore.getState().flushInk()
  const [notes, folders, tags, settings, inkDocs] = await Promise.all([
    noteRepository.all(),
    folderRepository.all(),
    tagRepository.all(),
    settingsRepository.get().catch(() => null),
    inkRepository.all(),
  ])
  return {
    app: 'notely',
    version: 2,
    exportedAt: Date.now(),
    notes,
    folders,
    tags,
    settings,
    inkDocs,
  }
}

function stamp(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export async function downloadBackup(): Promise<void> {
  const data = await buildBackup()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `notely-backup-${stamp()}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
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
  if (b.app !== 'notely' || !Array.isArray(b.notes) || !Array.isArray(b.folders) || !Array.isArray(b.tags)) {
    throw new Error('That file is not a Notely backup.')
  }
  if (b.version !== 1 && b.version !== 2) {
    throw new Error(`Unsupported backup version: ${String(b.version)}`)
  }
  const notes = b.notes.map(normalizeNote).filter((n): n is Note => n !== null)
  const folders = dedupeByName(b.folders.filter(isStorableRecord))
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

  return {
    ...(b as BackupFile),
    version: 2,
    notes,
    folders,
    tags,
    settings: sanitizeSettings(b.settings),
    inkDocs,
  }
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
  return doc as unknown as Note['ink']
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
  const { db } = await import('@/database/db')
  const { hydrateAll } = await import('@/database/hydration')
  const inkDocs = backup.inkDocs ?? []

  await db.transaction('rw', [db.notes, db.folders, db.tags, db.settings, db.inkDocs], async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.notes.clear(),
        db.folders.clear(),
        db.tags.clear(),
        db.inkDocs.clear(),
      ])
    }
    await db.folders.bulkPut(backup.folders)
    await db.tags.bulkPut(backup.tags)
    await db.notes.bulkPut(backup.notes)
    if (inkDocs.length > 0) await db.inkDocs.bulkPut(inkDocs)
    if (backup.settings) await db.settings.put(backup.settings)
  })

  await hydrateAll()
  // Open editors may hold pre-import docs — let them resync (see NoteEditor)
  window.dispatchEvent(new CustomEvent('notely:external-sync'))
  return { notes: backup.notes.length, folders: backup.folders.length, tags: backup.tags.length }
}
