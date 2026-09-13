import type { JSONContent } from '@tiptap/core'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { createId } from '@/utils/id'
import type {
  AssetRecord,
  DocumentFormat,
  DocumentRecord,
  ImportStrategy,
  Note,
} from '@/types/models'
import { FORMAT_LABEL, FORMAT_MIME, MalformedFileError, UnsupportedFileError, inspectFile } from './formats'
import { resolveAsset } from './assets'
import { buildPageModel, openPdf } from './pdf'
import {
  docxToEditable,
  docxToRendered,
  pptxToEditable,
  pptxToRendered,
  type EditableConversion,
  type RenderedConversion,
} from './office'

/* ---------------------------------------------------------------------------
   Document import pipeline. One file in → one note (+ document record and
   assets) out, written in a single IndexedDB transaction so a failure or a
   cancellation halfway leaves nothing behind.

   Strategy resolution (AUTO picks the safest representation):

     PDF          → page model + page ink, always (no conversion involved)
     DOCX / PPTX  → editable Tala content when the conversion is faithful,
                    otherwise a layout-preserving rendering; the original
                    file is kept as an asset either way
     DOC / PPT    → original kept as an attachment (no browser-side
                    converter exists for the legacy binary formats)
--------------------------------------------------------------------------- */

export type ImportStage = 'inspecting' | 'reading' | 'converting' | 'rendering' | 'saving' | 'done'

export interface ImportProgress {
  stage: ImportStage
  /** 0..1 when known. */
  fraction: number
  message: string
}

export interface ImportOptions {
  strategy?: ImportStrategy
  folderId?: string | null
  tagIds?: string[]
  signal?: AbortSignal
  onProgress?: (p: ImportProgress) => void
}

/** What the user ends up with — phrased for the result toast. */
export type Representation = 'pdf' | 'editable' | 'preserve' | 'original'

export interface ImportResult {
  note: Note
  document: DocumentRecord | null
  format: DocumentFormat
  representation: Representation
  /** Plain-language explanation of what Tala did and why. */
  message: string
  warnings: string[]
}

export class ImportCancelledError extends Error {
  constructor() {
    super('Import cancelled')
    this.name = 'ImportCancelledError'
  }
}

const titleFromFileName = (name: string): string => {
  const i = name.lastIndexOf('.')
  return (i > 0 ? name.slice(0, i) : name).trim() || 'Imported document'
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new ImportCancelledError()
}

interface Planned {
  note: Note
  document: DocumentRecord | null
  assets: AssetRecord[]
  representation: Representation
  message: string
  warnings: string[]
}

function baseNote(file: File, opts: ImportOptions): Note {
  const now = Date.now()
  return {
    id: createId(),
    title: titleFromFileName(file.name),
    content: null,
    ink: null,
    folderId: opts.folderId ?? null,
    tagIds: opts.tagIds ?? [],
    isPinned: false,
    isFavorite: false,
    isArchived: false,
    isDeleted: false,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
    documentId: null,
  }
}

function baseDocument(note: Note, file: File, format: DocumentFormat, strategy: ImportStrategy): DocumentRecord {
  const now = Date.now()
  return {
    id: createId(),
    noteId: note.id,
    kind: 'original-only',
    source: { fileName: file.name, mime: FORMAT_MIME[format], bytes: file.size, format },
    assetId: '',
    originalAssetId: null,
    strategy,
    importNote: null,
    createdAt: now,
    updatedAt: now,
  }
}

async function planPdf(file: File, bytes: ArrayBuffer, opts: ImportOptions): Promise<Planned> {
  opts.onProgress?.({ stage: 'converting', fraction: 0.3, message: 'Reading pages…' })
  const opened = await openPdf(bytes, { signal: opts.signal })
  let pages
  try {
    pages = await buildPageModel(opened.doc)
  } finally {
    await opened.destroy().catch(() => {})
  }
  throwIfAborted(opts.signal)
  if (pages.length === 0) throw new MalformedFileError('This PDF has no pages.')
  opts.onProgress?.({ stage: 'saving', fraction: 0.8, message: 'Storing document…' })
  const { asset, isNew } = await resolveAsset(bytes, 'application/pdf')
  const note = baseNote(file, opts)
  const document = baseDocument(note, file, 'pdf', 'auto')
  document.kind = 'pdf'
  document.assetId = asset.id
  document.originalAssetId = asset.id
  document.pages = pages
  document.importNote = `${pages.length} page${pages.length === 1 ? '' : 's'} — draw on any page; the original PDF stays untouched.`
  note.documentId = document.id
  return {
    note,
    document,
    assets: isNew ? [asset] : [],
    representation: 'pdf',
    message: `Imported ${pages.length} page${pages.length === 1 ? '' : 's'}. Draw or write on any page.`,
    warnings: [],
  }
}

/** Decides between editable and preserved output for Office files. */
export function chooseOfficeStrategy(
  requested: ImportStrategy,
  editable: EditableConversion | null,
): 'editable' | 'preserve' {
  if (requested === 'editable') return 'editable'
  if (requested === 'preserve') return 'preserve'
  if (!editable) return 'preserve'
  return editable.lossy ? 'preserve' : 'editable'
}

async function planOffice(
  file: File,
  bytes: ArrayBuffer,
  format: 'docx' | 'pptx',
  opts: ImportOptions,
): Promise<Planned> {
  const requested = opts.strategy ?? 'auto'
  const label = FORMAT_LABEL[format]
  const toEditable = format === 'docx' ? docxToEditable : pptxToEditable
  const toRendered = format === 'docx' ? docxToRendered : pptxToRendered

  // The editable conversion doubles as the searchable text copy, so it runs
  // unless the user explicitly asked to preserve appearance only.
  let editable: EditableConversion | null = null
  let editableError: Error | null = null
  if (requested !== 'preserve') {
    opts.onProgress?.({ stage: 'converting', fraction: 0.25, message: `Converting ${label}…` })
    try {
      editable = await toEditable(bytes)
    } catch (err) {
      if (requested === 'editable') throw err
      editableError = err as Error
    }
    throwIfAborted(opts.signal)
  }

  const chosen = chooseOfficeStrategy(requested, editable)
  let rendered: RenderedConversion | null = null
  if (chosen === 'preserve') {
    opts.onProgress?.({ stage: 'rendering', fraction: 0.55, message: `Rendering ${label} layout…` })
    try {
      rendered = await toRendered(bytes)
    } catch (err) {
      // Rendering failed: fall back to editable text if we have it.
      if (!editable) throw err
      rendered = null
    }
    throwIfAborted(opts.signal)
  }

  opts.onProgress?.({ stage: 'saving', fraction: 0.85, message: 'Storing document…' })
  const original = await resolveAsset(bytes, FORMAT_MIME[format])
  const assets: AssetRecord[] = original.isNew ? [original.asset] : []

  const note = baseNote(file, opts)
  const document = baseDocument(note, file, format, requested)
  document.originalAssetId = original.asset.id
  const warnings = [...(editable?.warnings ?? []), ...(rendered?.warnings ?? [])]
  if (editableError) warnings.push(`Editable conversion failed: ${editableError.message}`)

  if (rendered) {
    const htmlAsset = await resolveAsset(new TextEncoder().encode(rendered.html), 'text/html')
    if (htmlAsset.isNew) assets.push(htmlAsset.asset)
    document.kind = 'rendered-html'
    document.assetId = htmlAsset.asset.id
    document.importNote =
      requested === 'preserve'
        ? 'Original layout preserved (read-only). The original file is attached.'
        : editable
          ? `Preserved the original layout because ${editable.warnings[0] ? editable.warnings[0].toLowerCase() : 'some elements could not be converted safely'}. The text is still searchable.`
          : 'Preserved the original layout. The original file is attached.'
    // Keep the text copy for search + "switch to editable" without re-import.
    note.content = editable?.content ?? null
    note.documentId = document.id
    return {
      note,
      document,
      assets,
      representation: 'preserve',
      message:
        requested === 'preserve'
          ? 'Imported with its original layout preserved.'
          : `Preserved original layout because ${editable?.warnings[0] ? editable.warnings[0].toLowerCase() : 'some elements could not be converted safely'}.`,
      warnings,
    }
  }

  const content: JSONContent = editable?.content ?? { type: 'doc', content: [] }
  document.kind = 'original-only'
  document.assetId = original.asset.id
  document.importNote =
    warnings.length > 0
      ? `Imported as editable content — ${warnings[0]!.toLowerCase()}. The original file is attached.`
      : 'Imported as editable content. The original file is attached.'
  note.content = content
  note.documentId = document.id
  return {
    note,
    document,
    assets,
    representation: 'editable',
    message: warnings.length > 0 ? `Imported as editable content (${warnings[0]!.toLowerCase()}).` : 'Imported as editable content.',
    warnings,
  }
}

async function planLegacy(file: File, bytes: ArrayBuffer, format: 'doc' | 'ppt', opts: ImportOptions): Promise<Planned> {
  opts.onProgress?.({ stage: 'saving', fraction: 0.8, message: 'Storing document…' })
  const original = await resolveAsset(bytes, FORMAT_MIME[format])
  const note = baseNote(file, opts)
  const document = baseDocument(note, file, format, opts.strategy ?? 'auto')
  document.kind = 'original-only'
  document.assetId = original.asset.id
  document.originalAssetId = original.asset.id
  const modern = format === 'doc' ? '.docx' : '.pptx'
  document.importNote = `Legacy ${FORMAT_LABEL[format]} — Tala keeps the original file attached. Save it as ${modern} in ${format === 'doc' ? 'Word' : 'PowerPoint'} to import it as editable text.`
  note.documentId = document.id
  return {
    note,
    document,
    assets: original.isNew ? [original.asset] : [],
    representation: 'original',
    message: `Attached the original file. Convert it to ${modern} to import as editable text.`,
    warnings: ['Legacy binary format — no editable conversion available'],
  }
}

/** Writes note + document + new assets atomically, then registers them in the store. */
async function commitPlanned(p: Planned): Promise<void> {
  await db.transaction('rw', [db.notes, db.documents, db.assets], async () => {
    if (p.assets.length > 0) await db.assets.bulkPut(p.assets)
    if (p.document) await db.documents.put(p.document)
    await db.notes.put(p.note)
  })
  useNoteStore.getState().adoptImported(p.note, p.document)
}

export async function importDocumentFile(file: File, opts: ImportOptions = {}): Promise<ImportResult> {
  throwIfAborted(opts.signal)
  opts.onProgress?.({ stage: 'inspecting', fraction: 0.02, message: 'Checking file…' })
  const format = await inspectFile(file)
  throwIfAborted(opts.signal)
  opts.onProgress?.({ stage: 'reading', fraction: 0.1, message: 'Reading file…' })
  const bytes = await file.arrayBuffer()
  throwIfAborted(opts.signal)

  let planned: Planned
  switch (format) {
    case 'pdf':
      planned = await planPdf(file, bytes, opts)
      break
    case 'docx':
    case 'pptx':
      planned = await planOffice(file, bytes, format, opts)
      break
    case 'doc':
    case 'ppt':
      planned = await planLegacy(file, bytes, format, opts)
      break
    default:
      throw new UnsupportedFileError(`Unsupported format: ${String(format)}`)
  }
  throwIfAborted(opts.signal)
  await commitPlanned(planned)
  opts.onProgress?.({ stage: 'done', fraction: 1, message: 'Done' })
  return {
    note: planned.note,
    document: planned.document,
    format,
    representation: planned.representation,
    message: planned.message,
    warnings: planned.warnings,
  }
}

/** Human-friendly error text for the import UI. */
export function describeImportError(err: unknown): string {
  if (err instanceof ImportCancelledError) return 'Import cancelled.'
  if (err instanceof UnsupportedFileError || err instanceof MalformedFileError) return err.message
  if (err instanceof Error && /quota|QuotaExceeded/i.test(err.message)) {
    return 'Not enough storage space to keep this document. Free up space and try again.'
  }
  return `Import failed: ${err instanceof Error ? err.message : String(err)}`
}
