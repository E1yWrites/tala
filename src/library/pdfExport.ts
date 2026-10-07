import { db } from '@/database/db'
import { getBlob } from './blobs'
import { flush } from './notes'
import { pageSize } from './pageSize'
import type { ExportInput, ExportPage } from './pdfExport.core'

/** Collect a note's pages, ink and original PDF into the worker's plain-data input. */
async function gather(noteId: string): Promise<{ input: ExportInput; transfer: ArrayBuffer[] }> {
  await flush(noteId) // queued writes land first, so the file matches the screen
  const pages = (await db.pages.where('noteId').equals(noteId).toArray()).sort((a, b) => a.index - b.index)
  const inks = await db.inkDocs.bulkGet(pages.map((p) => p.id))
  const transfer: ArrayBuffer[] = []

  const record = await db.pdfs.get(noteId)
  const originalBlob = record && (await getBlob(record.blobId))
  const original = originalBlob && (await originalBlob.arrayBuffer())
  if (original) transfer.push(original)

  const out: ExportPage[] = []
  for (const [i, page] of pages.entries()) {
    const { w, h } = pageSize(page)
    let image: ExportPage['image']
    if (!page.pdfPage && page.backgroundBlobId) {
      const blob = await getBlob(page.backgroundBlobId)
      if (blob) {
        const bytes = await blob.arrayBuffer()
        transfer.push(bytes)
        image = { bytes, type: blob.type === 'image/png' ? 'png' : 'jpg' }
      }
    }
    out.push({
      w,
      h,
      ...(page.pdfPage ? { pdfPage: page.pdfPage } : {}),
      ...(image ? { image } : {}),
      template: page.template,
      ink: inks[i]?.doc ?? null,
      text: page.text ?? '',
    })
  }
  return { input: { ...(original ? { original } : {}), pages: out }, transfer }
}

/** Render a note to a PDF: the original pages (if imported) with handwriting as vector paths. */
export async function exportNotePdf(noteId: string): Promise<Blob> {
  const { input, transfer } = await gather(noteId)
  const worker = new Worker(new URL('./pdfExport.worker.ts', import.meta.url), { type: 'module' })
  try {
    const bytes = await new Promise<Uint8Array>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<{ ok: true; bytes: Uint8Array } | { ok: false; error: string }>) =>
        e.data.ok ? resolve(e.data.bytes) : reject(new Error(e.data.error))
      worker.onerror = (e) => reject(new Error(e.message || 'PDF export worker failed'))
      worker.postMessage(input, transfer)
    })
    return new Blob([bytes as BlobPart], { type: 'application/pdf' })
  } finally {
    worker.terminate()
  }
}
