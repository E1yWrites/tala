import { strFromU8, strToU8, unzip, zip, type Unzipped, type Zippable } from 'fflate'
import type {
  AssetRecord,
  DocumentPage,
  DocumentRecord,
  Folder,
  InkDocRecord,
  Note,
  PageInkRecord,
  PageTextNote,
  Tag,
  AppSettings,
} from '@/types/models'
import { pageInkKey } from '@/types/models'
import type { InkDoc } from '@/types/ink'
import { db } from '@/database/db'
import {
  assetRepository,
  documentRepository,
  folderRepository,
  inkRepository,
  noteRepository,
  pageInkRepository,
  settingsRepository,
  tagRepository,
} from '@/database/repositories'
import { useNoteStore } from '@/store/noteStore'
import { normalizeNote, sanitizeInkDoc } from '@/utils/exportImport'
import { createId } from '@/utils/id'
import { sha256Hex } from '@/lib/documents/assets'

/* ---------------------------------------------------------------------------
   Tala package — the one portable ZIP format for sharing a note or backing
   up a whole library, documents and all.

     manifest.json                 versioned index of everything below
     notes/<noteId>.json           Note (typed content, metadata)
     ink/<noteId>.json             handwriting (InkDoc)
     ink/<noteId>/pages/<pageId>.json   page annotations of document notes
     documents/<documentId>.json   DocumentRecord (page model, conversion info)
     assets/<assetId>.<ext>        raw file bytes (PDF, DOCX, rendered HTML…)
     metadata/folders.json, metadata/tags.json, metadata/settings.json

   Import validates before it writes: manifest shape/version, entry paths
   (no traversal), every referenced file present, asset sizes + SHA-256,
   duplicate ids. Writes happen in a single IndexedDB transaction, so a bad
   package changes nothing. Colliding ids never overwrite unrelated data —
   by default they are re-minted so the import lands as copies.
--------------------------------------------------------------------------- */

export const PACKAGE_FORMAT = 'tala-package'
export const PACKAGE_FORMAT_VERSION = 1
/** Manifest versions this build can read. */
export const SUPPORTED_FORMAT_VERSIONS = [1]
export const APP_VERSION = '1.0.0'

export interface ManifestNote {
  id: string
  title: string
  path: string
  ink: string | null
  pageInk: Array<{ pageId: string; path: string }>
  documentId: string | null
  updatedAt: number
}

export interface ManifestDocument {
  id: string
  noteId: string
  kind: DocumentRecord['kind']
  format: DocumentRecord['source']['format']
  path: string
  assetIds: string[]
}

export interface ManifestAsset {
  id: string
  path: string
  mime: string
  bytes: number
  sha256: string
}

export interface PackageManifest {
  format: typeof PACKAGE_FORMAT
  formatVersion: number
  app: { name: 'tala'; version: string; minFormatVersion: number }
  exportedAt: number
  scope: 'note' | 'library'
  notes: ManifestNote[]
  documents: ManifestDocument[]
  assets: ManifestAsset[]
  folders: string | null
  tags: string | null
  settings: string | null
}

export class PackageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PackageError'
  }
}

const MIME_EXT: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'application/vnd.ms-powerpoint': 'ppt',
  'text/html': 'html',
}

const extFor = (mime: string): string => MIME_EXT[mime] ?? 'bin'

/* -------------------------------- Export --------------------------------- */

export interface ExportOptions {
  /** Specific notes (share); omit for the whole library. */
  noteIds?: string[]
  /** Include trashed notes (library backups do; shares don't). */
  includeDeleted?: boolean
  onProgress?: (fraction: number, message: string) => void
}

const json = (v: unknown): Uint8Array => strToU8(JSON.stringify(v))

/** Collects everything the package needs and zips it. */
export async function buildPackage(opts: ExportOptions = {}): Promise<Uint8Array> {
  const progress = opts.onProgress ?? (() => {})
  await useNoteStore.getState().flushInk()
  progress(0.05, 'Collecting notes…')

  const scope: PackageManifest['scope'] = opts.noteIds ? 'note' : 'library'
  const allNotes = await noteRepository.all()
  const wanted = new Set(opts.noteIds)
  const notes = allNotes.filter((n) => (opts.noteIds ? wanted.has(n.id) : true) && (opts.includeDeleted || scope === 'library' || !n.isDeleted))
  if (notes.length === 0) throw new PackageError('There is nothing to export.')
  const noteIds = new Set(notes.map((n) => n.id))

  const [inkAll, folders, tags] = await Promise.all([inkRepository.all(), folderRepository.all(), tagRepository.all()])
  const inkByNote = new Map(inkAll.filter((r) => noteIds.has(r.noteId)).map((r) => [r.noteId, r.doc]))
  const usedFolderIds = new Set(notes.map((n) => n.folderId).filter((x): x is string => !!x))
  const usedTagIds = new Set(notes.flatMap((n) => n.tagIds))
  const exportFolders = scope === 'library' ? folders : folders.filter((f) => usedFolderIds.has(f.id))
  const exportTags = scope === 'library' ? tags : tags.filter((t) => usedTagIds.has(t.id))

  const files: Zippable = {}
  const manifest: PackageManifest = {
    format: PACKAGE_FORMAT,
    formatVersion: PACKAGE_FORMAT_VERSION,
    app: { name: 'tala', version: APP_VERSION, minFormatVersion: 1 },
    exportedAt: Date.now(),
    scope,
    notes: [],
    documents: [],
    assets: [],
    folders: 'metadata/folders.json',
    tags: 'metadata/tags.json',
    settings: null,
  }

  const assetIds = new Set<string>()
  let i = 0
  for (const note of notes) {
    i++
    progress(0.05 + (0.6 * i) / notes.length, `Packing ${note.title || 'Untitled'}…`)
    const { ink: _ink, ...plain } = note
    const notePath = `notes/${note.id}.json`
    files[notePath] = json(plain)
    const entry: ManifestNote = {
      id: note.id,
      title: note.title,
      path: notePath,
      ink: null,
      pageInk: [],
      documentId: note.documentId ?? null,
      updatedAt: note.updatedAt,
    }
    const ink = inkByNote.get(note.id)
    if (ink && ink.strokes.length > 0) {
      entry.ink = `ink/${note.id}.json`
      files[entry.ink] = json(ink)
    }
    if (note.documentId) {
      const doc = await documentRepository.get(note.documentId)
      if (doc) {
        const docPath = `documents/${doc.id}.json`
        files[docPath] = json(doc)
        const ids = [doc.assetId, ...(doc.originalAssetId && doc.originalAssetId !== doc.assetId ? [doc.originalAssetId] : [])]
        ids.forEach((id) => assetIds.add(id))
        manifest.documents.push({ id: doc.id, noteId: note.id, kind: doc.kind, format: doc.source.format, path: docPath, assetIds: ids })
        for (const rec of await pageInkRepository.byNote(note.id)) {
          if (rec.doc.strokes.length === 0) continue
          const p = `ink/${note.id}/pages/${rec.pageId}.json`
          files[p] = json(rec.doc)
          entry.pageInk.push({ pageId: rec.pageId, path: p })
        }
      } else {
        // Dangling reference (document row lost): export as a plain note
        entry.documentId = null
        files[notePath] = json({ ...plain, documentId: null })
      }
    }
    manifest.notes.push(entry)
  }

  let a = 0
  for (const id of assetIds) {
    a++
    progress(0.65 + (0.25 * a) / assetIds.size, 'Packing files…')
    const asset = await assetRepository.get(id)
    if (!asset) continue
    const path = `assets/${id}.${extFor(asset.mime)}`
    files[path] = [new Uint8Array(asset.data), { level: 0 }] // already compressed formats
    manifest.assets.push({ id, path, mime: asset.mime, bytes: asset.bytes, sha256: asset.sha256 })
  }

  files['metadata/folders.json'] = json(exportFolders)
  files['metadata/tags.json'] = json(exportTags)
  if (scope === 'library') {
    manifest.settings = 'metadata/settings.json'
    files['metadata/settings.json'] = json(await settingsRepository.get())
  }
  files['manifest.json'] = json(manifest)

  progress(0.92, 'Compressing…')
  return new Promise<Uint8Array>((resolve, reject) => {
    zip(files, { level: 6 }, (err, data) => (err ? reject(err) : resolve(data)))
  })
}

/* ------------------------------- Validation ------------------------------ */

/** True for a safe relative path: no traversal, no absolute/drive prefixes. */
export function isSafeEntryPath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0 || p.length > 512) return false
  if (p.includes('\\') || p.startsWith('/') || /^[a-zA-Z]:/.test(p) || p.includes('\0')) return false
  const parts = p.split('/')
  return parts.every((part) => part.length > 0 && part !== '.' && part !== '..')
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0

function parseManifest(raw: unknown): PackageManifest {
  if (!isObj(raw)) throw new PackageError('manifest.json is not an object.')
  if (raw.format !== PACKAGE_FORMAT) throw new PackageError('This ZIP is not a Tala package (missing format marker).')
  const version = raw.formatVersion
  if (typeof version !== 'number' || !SUPPORTED_FORMAT_VERSIONS.includes(version)) {
    throw new PackageError(`This package uses format version ${String(version)}, which this version of Tala cannot read. Update Tala and try again.`)
  }
  if (raw.scope !== 'note' && raw.scope !== 'library') throw new PackageError('manifest.json has an invalid scope.')
  const notes = Array.isArray(raw.notes) ? raw.notes : null
  const documents = Array.isArray(raw.documents) ? raw.documents : []
  const assets = Array.isArray(raw.assets) ? raw.assets : []
  if (!notes) throw new PackageError('manifest.json lists no notes.')
  const seen = new Set<string>()
  const dupe = (id: string, what: string): void => {
    if (seen.has(id)) throw new PackageError(`Malformed package: duplicate ${what} id "${id}".`)
    seen.add(id)
  }
  const mNotes: ManifestNote[] = notes.map((n: unknown) => {
    if (!isObj(n) || !isStr(n.id) || !isStr(n.path)) throw new PackageError('Malformed package: bad note entry.')
    dupe(n.id, 'note')
    const pageInk = Array.isArray(n.pageInk) ? n.pageInk : []
    return {
      id: n.id,
      title: typeof n.title === 'string' ? n.title : '',
      path: n.path,
      ink: isStr(n.ink) ? n.ink : null,
      pageInk: pageInk.map((p: unknown) => {
        if (!isObj(p) || !isStr(p.pageId) || !isStr(p.path)) throw new PackageError('Malformed package: bad page ink entry.')
        return { pageId: p.pageId, path: p.path }
      }),
      documentId: isStr(n.documentId) ? n.documentId : null,
      updatedAt: typeof n.updatedAt === 'number' ? n.updatedAt : 0,
    }
  })
  const mDocs: ManifestDocument[] = documents.map((d: unknown) => {
    if (!isObj(d) || !isStr(d.id) || !isStr(d.noteId) || !isStr(d.path)) throw new PackageError('Malformed package: bad document entry.')
    dupe(d.id, 'document')
    return {
      id: d.id,
      noteId: d.noteId,
      kind: d.kind as DocumentRecord['kind'],
      format: d.format as DocumentRecord['source']['format'],
      path: d.path,
      assetIds: Array.isArray(d.assetIds) ? (d.assetIds as unknown[]).filter(isStr) : [],
    }
  })
  const mAssets: ManifestAsset[] = assets.map((a: unknown) => {
    if (!isObj(a) || !isStr(a.id) || !isStr(a.path) || !isStr(a.mime) || typeof a.bytes !== 'number' || !isStr(a.sha256)) {
      throw new PackageError('Malformed package: bad asset entry.')
    }
    dupe(a.id, 'asset')
    return { id: a.id, path: a.path, mime: a.mime, bytes: a.bytes, sha256: a.sha256.toLowerCase() }
  })
  const paths = [
    ...mNotes.map((n) => n.path),
    ...mNotes.flatMap((n) => [n.ink, ...n.pageInk.map((p) => p.path)]),
    ...mDocs.map((d) => d.path),
    ...mAssets.map((a) => a.path),
    raw.folders,
    raw.tags,
    raw.settings,
  ].filter((p): p is string => typeof p === 'string')
  for (const p of paths) if (!isSafeEntryPath(p)) throw new PackageError(`Malformed package: unsafe entry path "${p}".`)
  return {
    format: PACKAGE_FORMAT,
    formatVersion: version,
    app: isObj(raw.app) && isStr(raw.app.version) ? { name: 'tala', version: raw.app.version, minFormatVersion: 1 } : { name: 'tala', version: 'unknown', minFormatVersion: 1 },
    exportedAt: typeof raw.exportedAt === 'number' ? raw.exportedAt : 0,
    scope: raw.scope,
    notes: mNotes,
    documents: mDocs,
    assets: mAssets,
    folders: isStr(raw.folders) ? raw.folders : null,
    tags: isStr(raw.tags) ? raw.tags : null,
    settings: isStr(raw.settings) ? raw.settings : null,
  }
}

function parseJsonEntry(files: Unzipped, path: string, what: string): unknown {
  const bytes = files[path]
  if (!bytes) throw new PackageError(`Malformed package: missing ${what} (${path}).`)
  try {
    return JSON.parse(strFromU8(bytes))
  } catch {
    throw new PackageError(`Malformed package: ${what} is not valid JSON (${path}).`)
  }
}

function sanitizePage(raw: unknown): DocumentPage | null {
  if (!isObj(raw) || !isStr(raw.id)) return null
  const num = (v: unknown, fb: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fb)
  const texts = Array.isArray(raw.texts)
    ? (raw.texts as unknown[])
        .map((t): PageTextNote | null =>
          isObj(t) && isStr(t.id) && typeof t.text === 'string'
            ? { id: t.id, x: num(t.x, 0), y: num(t.y, 0), width: num(t.width, 200), text: t.text, size: num(t.size, 14), color: isStr(t.color) ? t.color : '#1f2937' }
            : null,
        )
        .filter((t): t is PageTextNote => t !== null)
    : undefined
  return {
    id: raw.id,
    sourceIndex: Math.max(0, Math.round(num(raw.sourceIndex, 0))),
    width: Math.max(1, num(raw.width, 612)),
    height: Math.max(1, num(raw.height, 792)),
    rotation: [0, 90, 180, 270].includes(num(raw.rotation, 0)) ? num(raw.rotation, 0) : 0,
    ...(texts && texts.length > 0 ? { texts } : {}),
  }
}

const DOC_KINDS = new Set(['pdf', 'rendered-html', 'original-only'])
const DOC_FORMATS = new Set(['pdf', 'docx', 'doc', 'pptx', 'ppt'])

function sanitizeDocument(raw: unknown, entry: ManifestDocument): DocumentRecord {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.assetId)) throw new PackageError(`Malformed package: bad document record (${entry.path}).`)
  if (!DOC_KINDS.has(raw.kind as string)) throw new PackageError(`Malformed package: unknown document kind "${String(raw.kind)}".`)
  const src = isObj(raw.source) ? raw.source : {}
  const format = DOC_FORMATS.has(src.format as string) ? (src.format as DocumentRecord['source']['format']) : entry.format
  if (!DOC_FORMATS.has(format)) throw new PackageError('Malformed package: unknown document format.')
  const pages = Array.isArray(raw.pages) ? (raw.pages as unknown[]).map(sanitizePage).filter((p): p is DocumentPage => p !== null) : undefined
  if (raw.kind === 'pdf' && (!pages || pages.length === 0)) throw new PackageError('Malformed package: PDF document without pages.')
  return {
    id: raw.id,
    noteId: isStr(raw.noteId) ? raw.noteId : entry.noteId,
    kind: raw.kind as DocumentRecord['kind'],
    source: {
      fileName: isStr(src.fileName) ? src.fileName : 'document',
      mime: isStr(src.mime) ? src.mime : 'application/octet-stream',
      bytes: typeof src.bytes === 'number' ? src.bytes : 0,
      format,
    },
    assetId: raw.assetId,
    originalAssetId: isStr(raw.originalAssetId) ? raw.originalAssetId : null,
    ...(pages ? { pages } : {}),
    strategy: raw.strategy === 'editable' || raw.strategy === 'preserve' ? raw.strategy : 'auto',
    importNote: typeof raw.importNote === 'string' ? raw.importNote : null,
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : Date.now(),
    updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : Date.now(),
  }
}

/** Everything a package contains, validated and ready to write. */
export interface ParsedPackage {
  manifest: PackageManifest
  notes: Note[]
  ink: InkDocRecord[]
  pageInk: PageInkRecord[]
  documents: DocumentRecord[]
  assets: AssetRecord[]
  folders: Folder[]
  tags: Tag[]
  settings: AppSettings | null
}

/** Unzips and validates. Throws PackageError with a user-facing message. */
export async function readPackage(data: ArrayBuffer | Uint8Array, opts: { verifyHashes?: boolean } = {}): Promise<ParsedPackage> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (bytes.length < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new PackageError('That file is not a ZIP archive.')
  const files = await new Promise<Unzipped>((resolve, reject) => {
    try {
      unzip(bytes, (err, out) => (err ? reject(new PackageError(`Could not read the ZIP: ${err.message}`)) : resolve(out)))
    } catch (err) {
      reject(new PackageError(`Could not read the ZIP: ${(err as Error).message}`))
    }
  })
  for (const p of Object.keys(files)) {
    if (p.endsWith('/')) continue
    if (!isSafeEntryPath(p)) throw new PackageError(`Malformed package: unsafe entry path "${p}".`)
  }
  if (!files['manifest.json']) throw new PackageError('That ZIP is not a Tala package (no manifest.json).')
  const manifest = parseManifest(parseJsonEntry(files, 'manifest.json', 'manifest'))

  const notes: Note[] = []
  const ink: InkDocRecord[] = []
  const pageInk: PageInkRecord[] = []
  for (const m of manifest.notes) {
    const note = normalizeNote(parseJsonEntry(files, m.path, 'note'))
    if (!note) throw new PackageError(`Malformed package: note ${m.id} is unreadable.`)
    if (note.id !== m.id) throw new PackageError(`Malformed package: note file ${m.path} does not match its manifest id.`)
    note.ink = null
    note.documentId = m.documentId
    notes.push(note)
    if (m.ink) {
      const doc = sanitizeInkDoc({ doc: parseJsonEntry(files, m.ink, 'handwriting') })
      if (!doc) throw new PackageError(`Malformed package: handwriting for note ${m.id} is unreadable.`)
      ink.push({ noteId: note.id, doc })
    }
    for (const p of m.pageInk) {
      const doc = sanitizeInkDoc({ doc: parseJsonEntry(files, p.path, 'page annotations') })
      if (!doc) throw new PackageError(`Malformed package: page annotations for note ${m.id} are unreadable.`)
      pageInk.push({ id: pageInkKey(note.id, p.pageId), noteId: note.id, pageId: p.pageId, doc })
    }
  }

  const documents: DocumentRecord[] = manifest.documents.map((d) => {
    const rec = sanitizeDocument(parseJsonEntry(files, d.path, 'document'), d)
    if (rec.id !== d.id) throw new PackageError(`Malformed package: document file ${d.path} does not match its manifest id.`)
    if (!manifest.notes.some((n) => n.id === rec.noteId)) throw new PackageError(`Malformed package: document ${rec.id} belongs to a note that is not in the package.`)
    return rec
  })
  for (const n of manifest.notes) {
    if (n.documentId && !documents.some((d) => d.id === n.documentId)) {
      throw new PackageError(`Malformed package: note "${n.title || n.id}" references a missing document.`)
    }
  }

  const assets: AssetRecord[] = []
  for (const a of manifest.assets) {
    const raw = files[a.path]
    if (!raw) throw new PackageError(`Malformed package: missing file ${a.path}.`)
    if (raw.length !== a.bytes) throw new PackageError(`Malformed package: ${a.path} is ${raw.length} bytes, manifest says ${a.bytes}.`)
    const buf = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer
    if (opts.verifyHashes !== false) {
      const hash = await sha256Hex(buf)
      if (hash !== a.sha256) throw new PackageError(`Malformed package: ${a.path} failed its integrity check.`)
    }
    assets.push({ id: a.id, mime: a.mime, bytes: a.bytes, sha256: a.sha256, data: buf, createdAt: Date.now() })
  }
  for (const d of documents) {
    const needed = [d.assetId, d.originalAssetId].filter((x): x is string => !!x)
    for (const id of needed) {
      if (!assets.some((x) => x.id === id)) throw new PackageError(`Malformed package: document "${d.source.fileName}" references a missing file.`)
    }
  }

  const readList = <T extends { id: string; name: string }>(path: string | null, what: string): T[] => {
    if (!path) return []
    const raw = parseJsonEntry(files, path, what)
    if (!Array.isArray(raw)) throw new PackageError(`Malformed package: ${what} list is invalid.`)
    return raw.filter((x): x is T => isObj(x) && isStr(x.id) && isStr(x.name))
  }
  const folders = readList<Folder>(manifest.folders, 'folders').map((f) => ({ id: f.id, name: f.name, createdAt: typeof f.createdAt === 'number' ? f.createdAt : Date.now() }))
  const tags = readList<Tag>(manifest.tags, 'tags').map((t) => ({ id: t.id, name: t.name, color: isStr(t.color) ? t.color : 'gray', createdAt: typeof t.createdAt === 'number' ? t.createdAt : Date.now() }))

  let settings: AppSettings | null = null
  if (manifest.settings) {
    const raw = parseJsonEntry(files, manifest.settings, 'settings')
    settings = isObj(raw) && raw.key === 'app' ? (raw as unknown as AppSettings) : null
  }

  return { manifest, notes, ink, pageInk, documents, assets, folders, tags, settings }
}

/* -------------------------------- Import --------------------------------- */

export type ConflictPolicy = 'copy' | 'overwrite' | 'skip'

export interface ImportPackageOptions {
  /**
   * What to do when a note id already exists locally:
   *   copy       import under fresh ids (default — never touches local data)
   *   overwrite  replace the local note (library restore / re-import)
   *   skip       leave the local note, drop the packaged one
   */
  onConflict?: ConflictPolicy
  /** Library scope only: wipe the library first. */
  replaceLibrary?: boolean
  /** Apply packaged settings (library scope only). */
  applySettings?: boolean
}

export interface ImportPackageResult {
  notes: number
  documents: number
  assets: number
  copied: number
  skipped: number
  overwritten: number
  firstNoteId: string | null
}

/** Case-insensitive name match for folders/tags. */
const byName = <T extends { name: string }>(items: T[]): Map<string, T> => new Map(items.map((i) => [i.name.trim().toLowerCase(), i]))

export async function importPackage(pkg: ParsedPackage, opts: ImportPackageOptions = {}): Promise<ImportPackageResult> {
  const policy = opts.onConflict ?? 'copy'
  const [existingNotes, existingFolders, existingTags] = await Promise.all([noteRepository.all(), folderRepository.all(), tagRepository.all()])
  const existingNoteIds = new Set(existingNotes.map((n) => n.id))
  const existingDocIds = new Set((await documentRepository.all()).map((d) => d.id))
  const existingAssetIds = new Set(await assetRepository.ids())

  // Folders / tags: reuse a same-named local one, else create (fresh id on collision).
  const folderMap = new Map<string, string>()
  const tagMap = new Map<string, string>()
  const newFolders: Folder[] = []
  const newTags: Tag[] = []
  const localFolders = byName(existingFolders)
  const localTags = byName(existingTags)
  const usedFolderIds = new Set(existingFolders.map((f) => f.id))
  const usedTagIds = new Set(existingTags.map((t) => t.id))
  for (const f of pkg.folders) {
    const local = localFolders.get(f.name.trim().toLowerCase())
    if (local) folderMap.set(f.id, local.id)
    else {
      const id = usedFolderIds.has(f.id) ? createId() : f.id
      usedFolderIds.add(id)
      const rec = { ...f, id }
      newFolders.push(rec)
      folderMap.set(f.id, id)
      localFolders.set(f.name.trim().toLowerCase(), rec)
    }
  }
  for (const t of pkg.tags) {
    const local = localTags.get(t.name.trim().toLowerCase())
    if (local) tagMap.set(t.id, local.id)
    else {
      const id = usedTagIds.has(t.id) ? createId() : t.id
      usedTagIds.add(id)
      const rec = { ...t, id }
      newTags.push(rec)
      tagMap.set(t.id, id)
      localTags.set(t.name.trim().toLowerCase(), rec)
    }
  }

  // Assets: identical content reuses the local asset; id collisions with
  // different content get a fresh id.
  const assetMap = new Map<string, string>()
  const newAssets: AssetRecord[] = []
  for (const a of pkg.assets) {
    const same = await assetRepository.findBySha(a.sha256)
    if (same && same.bytes === a.bytes) {
      assetMap.set(a.id, same.id)
      continue
    }
    const id = existingAssetIds.has(a.id) ? createId() : a.id
    existingAssetIds.add(id)
    assetMap.set(a.id, id)
    newAssets.push({ ...a, id })
  }

  const result: ImportPackageResult = { notes: 0, documents: 0, assets: newAssets.length, copied: 0, skipped: 0, overwritten: 0, firstNoteId: null }
  const notes: Note[] = []
  const ink: InkDocRecord[] = []
  const pageInk: PageInkRecord[] = []
  const documents: DocumentRecord[] = []
  const overwrittenIds: string[] = []
  const docById = new Map(pkg.documents.map((d) => [d.id, d]))

  for (const src of pkg.notes) {
    let noteId = src.id
    const collides = existingNoteIds.has(src.id) && !opts.replaceLibrary
    if (collides) {
      if (policy === 'skip') {
        result.skipped++
        continue
      }
      if (policy === 'copy') {
        noteId = createId()
        result.copied++
      } else {
        overwrittenIds.push(src.id)
        result.overwritten++
      }
    }
    const note: Note = {
      ...src,
      id: noteId,
      ink: null,
      folderId: src.folderId ? (folderMap.get(src.folderId) ?? null) : null,
      tagIds: src.tagIds.map((t) => tagMap.get(t)).filter((t): t is string => !!t),
      documentId: null,
    }
    if (src.documentId) {
      const d = docById.get(src.documentId)
      if (d) {
        const docId = existingDocIds.has(d.id) || noteId !== src.id ? createId() : d.id
        existingDocIds.add(docId)
        const assetId = assetMap.get(d.assetId)
        if (!assetId) throw new PackageError('Malformed package: document references an unknown file.')
        documents.push({
          ...d,
          id: docId,
          noteId,
          assetId,
          originalAssetId: d.originalAssetId ? (assetMap.get(d.originalAssetId) ?? null) : null,
        })
        note.documentId = docId
        result.documents++
      }
    }
    notes.push(note)
    result.notes++
    result.firstNoteId ??= noteId
    const srcInk = pkg.ink.find((r) => r.noteId === src.id)
    if (srcInk) ink.push({ noteId, doc: srcInk.doc })
    for (const p of pkg.pageInk) {
      if (p.noteId !== src.id) continue
      pageInk.push({ id: pageInkKey(noteId, p.pageId), noteId, pageId: p.pageId, doc: p.doc })
    }
  }

  await db.transaction(
    'rw',
    [db.notes, db.inkDocs, db.pageInk, db.documents, db.assets, db.folders, db.tags, db.settings],
    async () => {
      if (opts.replaceLibrary && pkg.manifest.scope === 'library') {
        await Promise.all([db.notes.clear(), db.inkDocs.clear(), db.pageInk.clear(), db.documents.clear(), db.assets.clear(), db.folders.clear(), db.tags.clear()])
      } else if (overwrittenIds.length > 0) {
        // Replacing a note replaces its handwriting and document rows too
        await db.inkDocs.bulkDelete(overwrittenIds)
        await db.pageInk.where('noteId').anyOf(overwrittenIds).delete()
        const oldDocs = await db.documents.where('noteId').anyOf(overwrittenIds).toArray()
        await db.documents.bulkDelete(oldDocs.map((d) => d.id))
      }
      if (newFolders.length > 0) await db.folders.bulkPut(newFolders)
      if (newTags.length > 0) await db.tags.bulkPut(newTags)
      if (newAssets.length > 0) await db.assets.bulkPut(newAssets)
      if (documents.length > 0) await db.documents.bulkPut(documents)
      if (notes.length > 0) await db.notes.bulkPut(notes)
      if (ink.length > 0) await db.inkDocs.bulkPut(ink)
      if (pageInk.length > 0) await db.pageInk.bulkPut(pageInk)
      if (opts.applySettings && pkg.settings) await db.settings.put(pkg.settings)
    },
  )
  return result
}

/** Ink-doc type re-export for consumers that only need the shape. */
export type { InkDoc }
