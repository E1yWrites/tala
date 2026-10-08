import { useEffect, useRef, useState } from 'react'
import type { RenderTask } from 'pdfjs-dist'
import type { PageRecord } from '@/types/models'
import { useBlobUrl } from '@/library/blobs'
import { pageSize } from '@/library/pageSize'
import { loadPdf } from '@/library/pdfImport'
import { useZoom } from '@/canvas/ZoomColumn'

/** iOS Safari refuses canvases much past 16M pixels; stay well under. */
const MAX_CANVAS_PIXELS = 12_000_000

const FRAME = 'w-full rounded-control border border-lineSoft bg-white shadow-rest'

/**
 * The sheet behind a PDF-imported page: drawn from the original PDF at the
 * width it is shown, or a stored raster for pages imported before v4.
 */
export function PageBackground({
  noteId,
  page,
  label,
}: {
  noteId: string
  page: PageRecord
  label: string
}): React.ReactNode {
  return page.pdfPage ? (
    <PdfCanvas noteId={noteId} page={page} label={label} />
  ) : (
    <StoredImage blobId={page.backgroundBlobId} label={label} />
  )
}

/** Stand-in for a page scrolled away from the screen: the same box, nothing drawn. */
export function PageFrame({ page }: { page: PageRecord }): React.ReactNode {
  const { w, h } = pageSize(page)
  return <div className={FRAME} style={{ aspectRatio: `${w} / ${h}` }} />
}

function StoredImage({ blobId, label }: { blobId: string | undefined; label: string }): React.ReactNode {
  const url = useBlobUrl(blobId)
  return url ? <img src={url} alt={label} className={FRAME} /> : <div className={`${FRAME} aspect-[595/842]`} />
}

function PdfCanvas({ noteId, page, label }: { noteId: string; page: PageRecord; label: string }): React.ReactNode {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  /** Shown width in 40px steps: re-render when the layout really changes, not on every pixel. */
  const [width, setWidth] = useState(0)
  const { w, h } = pageSize(page)
  /** Zoom in half steps so a pinch re-renders a few times, not every frame. */
  const zoomStep = Math.ceil(useZoom() * 2) / 2

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width / 40) * 40))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap || width === 0) return
    let stale = false
    let task: RenderTask | undefined
    void (async () => {
      try {
        const pdf = await loadPdf(noteId)
        const pdfPage = await pdf.getPage(page.pdfPage!)
        if (stale) return
        let scale = (wrap.clientWidth * Math.min(window.devicePixelRatio || 1, 2) * zoomStep) / w
        scale = Math.min(scale, Math.sqrt(MAX_CANVAS_PIXELS / (w * h)))
        const viewport = pdfPage.getViewport({ scale })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        task = pdfPage.render({ canvasContext: canvas.getContext('2d')!, viewport })
        await task.promise
      } catch (err) {
        if ((err as Error).name !== 'RenderingCancelledException') console.error('[tala] PDF render failed', err)
      }
    })()
    return () => {
      stale = true
      task?.cancel()
    }
  }, [noteId, page.pdfPage, w, h, width, zoomStep])

  return (
    <div ref={wrapRef} className={FRAME} style={{ aspectRatio: `${w} / ${h}` }}>
      <canvas ref={canvasRef} role="img" aria-label={label} className="block h-full w-full" />
    </div>
  )
}
