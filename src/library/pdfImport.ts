import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import { db } from '@/database/db'
import type { Note } from '@/types/models'
import { getBlob } from './blobs'
import { createPdfNote, type PdfPageInfo } from './notes'

// Lazy worker setup: only when a PDF is first touched
let workerReady = false
function ensureWorker(): void {
  if (workerReady) return
  GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
  workerReady = true
}

/**
 * Imports a PDF as a note. The original bytes are kept as-is; per page we
 * only read its size and text layer, one page at a time, so memory stays flat
 * on long documents. Pages are rendered from the original when shown.
 */
export async function importPdf(
  file: File,
  folderId: string | null,
  onProgress?: (current: number, total: number) => void,
): Promise<Note> {
  ensureWorker()
  // pdf.js transfers its input to the worker, so hand it a copy and keep the file
  const doc = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  try {
    if (doc.numPages === 0) throw new Error('PDF has no pages')
    const pages: PdfPageInfo[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress?.(i, doc.numPages)
      const page = await doc.getPage(i)
      const { width, height } = page.getViewport({ scale: 1 })
      const text = (await page.getTextContent()).items
        .map((item) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      page.cleanup()
      pages.push({ w: width, h: height, text })
    }
    return await createPdfNote({
      title: file.name.replace(/\.pdf$/i, '') || 'Imported PDF',
      folderId,
      pdf: new Blob([file], { type: 'application/pdf' }),
      pages,
    })
  } finally {
    void doc.destroy()
  }
}

/** The open note's PDF, kept loaded for page renders. Only one lives at a time. */
let open: { noteId: string; doc: Promise<PDFDocumentProxy> } | null = null

export function loadPdf(noteId: string): Promise<PDFDocumentProxy> {
  if (open?.noteId === noteId) return open.doc
  void open?.doc.then((d) => d.destroy(), () => undefined)
  ensureWorker()
  const doc = (async () => {
    const record = await db.pdfs.get(noteId)
    const blob = record && (await getBlob(record.blobId))
    if (!blob) throw new Error('The original PDF is missing')
    return getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise
  })()
  open = { noteId, doc }
  // Don't cache a failure: the next render retries
  doc.catch(() => {
    if (open?.doc === doc) open = null
  })
  return doc
}
