import type { InkDoc } from '@/types/ink'
import type { PageRecord } from '@/types/models'
import { getBlob } from '@/library/blobs'
import { pageSize } from '@/library/pageSize'
import { loadPdf } from '@/library/pdfImport'
import { strokeOutlineD } from '@/utils/ink'

/* ---------------------------------------------------------------------------
   Page thumbnails: paper (or the PDF page) with the ink on top, drawn on a
   plain canvas and handed back as a Blob. Typed text is deliberately not
   drawn: a page with no ink and no background shows a text card instead (see
   PageStrip). Thumbnails are derived data and never stored.
--------------------------------------------------------------------------- */

const ALPHA: Record<string, number> = { highlighter: 0.4, pencil: 0.82 }

export const hasThumbnailArt = (page: PageRecord, ink: InkDoc | null): boolean =>
  !!(page.pdfPage || page.backgroundBlobId || (ink && ink.strokes.length > 0))

/** `width` is CSS px of the finished thumbnail; it is drawn at `dpr` times that. */
export async function renderThumbnail(
  page: PageRecord,
  ink: InkDoc | null,
  width: number,
  dpr = 2,
): Promise<Blob | null> {
  const { w: pw, h: ph } = pageSize(page)
  const cw = Math.round(width * dpr)
  const ch = Math.round((cw * ph) / pw)
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, cw, ch)

  if (page.pdfPage) {
    const pdf = await loadPdf(page.noteId)
    const pdfPage = await pdf.getPage(page.pdfPage)
    const viewport = pdfPage.getViewport({ scale: cw / pw })
    await pdfPage.render({ canvasContext: ctx, viewport }).promise
  } else if (page.backgroundBlobId) {
    const blob = await getBlob(page.backgroundBlobId)
    if (blob) {
      const bmp = await createImageBitmap(blob)
      ctx.drawImage(bmp, 0, 0, cw, ch)
      bmp.close()
    }
  }

  if (ink && ink.strokes.length > 0) {
    const s = cw / ink.width
    ctx.setTransform(s, 0, 0, s, 0, 0)
    for (const stroke of ink.strokes) {
      ctx.globalAlpha = ALPHA[stroke.tool] ?? 1
      ctx.fillStyle = stroke.color
      ctx.fill(new Path2D(strokeOutlineD(stroke)))
    }
    ctx.globalAlpha = 1
  }

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
