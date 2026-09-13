import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
import type { DocumentPage, DocumentRecord, PageTextNote } from '@/types/models'
import type { InkDoc, InkStroke } from '@/types/ink'
import { DEFAULT_OPACITY } from '@/types/ink'
import { createId } from '@/utils/id'
import { strokeOutlineD, shapePathD } from '@/utils/ink'
import { MalformedFileError } from './formats'

/* ---------------------------------------------------------------------------
   PDF document model on top of pdf.js (viewing) and pdf-lib (writing).

   • The page model (DocumentPage[]) is built once at import from pdf.js page
     metadata; ordering / deletion / rotation later edit that array only —
     the original bytes stay untouched in the asset store.
   • Rendering is per page, on demand, at the requested scale; nothing is
     rasterised up front. Thumbnails are just tiny renders.
   • Export copies the live pages (in their current order) into a new
     pdf-lib document and stamps page ink on top as vector paths — the same
     outline geometry the screen draws, so what you see is what you get.

   pdf.js's legacy build is used on purpose: the modern build assumes very
   recent JS (e.g. Uint8Array.toHex) that WebKitGTK / older WebView2 lack.
--------------------------------------------------------------------------- */

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let pdfjsPromise: Promise<PdfJsModule> | null = null

/** Lazily loads pdf.js (≈1 MB) the first time a PDF is opened or imported. */
export async function loadPdfJs(): Promise<PdfJsModule> {
  pdfjsPromise ??= (async () => {
    const mod = await import('pdfjs-dist/legacy/build/pdf.mjs')
    if (typeof window !== 'undefined' && !mod.GlobalWorkerOptions.workerSrc) {
      // Vite emits the worker as its own chunk; the URL import keeps the
      // relative base ('./') that file:// and tauri:// deployments rely on.
      const worker = await import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?url')
      mod.GlobalWorkerOptions.workerSrc = worker.default
    }
    return mod
  })()
  return pdfjsPromise
}

/** A parsed PDF, plus the loading task so callers can cancel/destroy it. */
export interface OpenPdf {
  doc: PDFDocumentProxy
  destroy: () => Promise<void>
}

export async function openPdf(data: ArrayBuffer | Uint8Array, opts: { signal?: AbortSignal } = {}): Promise<OpenPdf> {
  const pdfjs = await loadPdfJs()
  // pdf.js transfers the buffer to its worker (detaching the caller's copy),
  // so hand it a private copy — callers keep using their bytes afterwards.
  const bytes = (data instanceof Uint8Array ? data : new Uint8Array(data)).slice()
  // Standard 14 fonts + CMaps are copied to public/pdfjs at build time
  // (scripts/copy-pdfjs-assets.mjs) so text in exotic encodings renders.
  const assetBase =
    typeof document !== 'undefined' ? new URL('pdfjs/', document.baseURI).href : undefined
  const task = pdfjs.getDocument({
    data: bytes,
    ...(assetBase
      ? {
          standardFontDataUrl: `${assetBase}standard_fonts/`,
          cMapUrl: `${assetBase}cmaps/`,
          cMapPacked: true,
          wasmUrl: `${assetBase}wasm/`,
        }
      : {}),
  })
  const onAbort = (): void => {
    void task.destroy()
  }
  opts.signal?.addEventListener('abort', onAbort, { once: true })
  try {
    const doc = await task.promise
    return {
      doc,
      destroy: async () => {
        opts.signal?.removeEventListener('abort', onAbort)
        await task.destroy()
      },
    }
  } catch (err) {
    opts.signal?.removeEventListener('abort', onAbort)
    const name = (err as { name?: string })?.name
    if (name === 'PasswordException') {
      throw new MalformedFileError('This PDF is password-protected. Remove the password and import again.')
    }
    if (name === 'InvalidPDFException' || name === 'MissingPDFException' || name === 'UnexpectedResponseException') {
      throw new MalformedFileError('This PDF could not be read — the file may be damaged or truncated.')
    }
    throw err
  }
}

/** Builds the live page model (one entry per source page). */
export async function buildPageModel(pdf: PDFDocumentProxy): Promise<DocumentPage[]> {
  const pages: DocumentPage[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale: 1 })
    pages.push({
      id: createId(),
      sourceIndex: i - 1,
      width: Math.round(vp.width * 100) / 100,
      height: Math.round(vp.height * 100) / 100,
      rotation: 0,
    })
    page.cleanup()
  }
  return pages
}

/** Size of a page as displayed (user rotation applied). */
export function displaySize(page: DocumentPage): { width: number; height: number } {
  return page.rotation % 180 === 0
    ? { width: page.width, height: page.height }
    : { width: page.height, height: page.width }
}

export interface RenderHandle {
  /** Resolves when drawing finished; rejects with RenderingCancelledException on cancel. */
  promise: Promise<void>
  cancel: () => void
}

/**
 * Renders one page into `canvas` at `scale` CSS px per PDF point, honouring
 * devicePixelRatio for crisp output. Returns a cancel handle — a scrolled-away
 * page should cancel instead of finishing an invisible render.
 */
export function renderPage(
  pdfPage: PDFPageProxy,
  page: DocumentPage,
  canvas: HTMLCanvasElement,
  scale: number,
  dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
): RenderHandle {
  const viewport = pdfPage.getViewport({ scale: scale * dpr, rotation: pdfPage.rotate + page.rotation })
  canvas.width = Math.max(1, Math.floor(viewport.width))
  canvas.height = Math.max(1, Math.floor(viewport.height))
  canvas.style.width = `${Math.floor(viewport.width / dpr)}px`
  canvas.style.height = `${Math.floor(viewport.height / dpr)}px`
  const ctx = canvas.getContext('2d', { alpha: false })
  if (!ctx) return { promise: Promise.resolve(), cancel: () => {} }
  const task: RenderTask = pdfPage.render({ canvas, canvasContext: ctx, viewport })
  return { promise: task.promise, cancel: () => task.cancel() }
}

/* -------------------------------- Export --------------------------------- */

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '')
  const full = h.length === 3 || h.length === 4 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(n)) return { r: 0, g: 0, b: 0 }
  return { r: ((n >> 16) & 255) / 255, g: ((n >> 8) & 255) / 255, b: (n & 255) / 255 }
}

/** Alpha channel of #rrggbbaa colours (1 when absent). */
function hexAlpha(hex: string): number {
  const h = hex.replace('#', '')
  if (h.length === 8) return parseInt(h.slice(6, 8), 16) / 255
  if (h.length === 4) return parseInt(h[3]! + h[3]!, 16) / 255
  return 1
}

export interface ExportPdfInput {
  document: DocumentRecord
  /** Original PDF bytes. */
  source: ArrayBuffer | Uint8Array
  /** Page ink keyed by page id. */
  inkByPage: Record<string, InkDoc | undefined>
  /** Page text notes keyed by page id; defaults to each page's own `texts`. */
  textByPage?: Record<string, PageTextNote[] | undefined>
}

/**
 * Writes a new PDF containing the live pages in their current order with
 * annotations drawn as vector paths. Ink coordinates are page points
 * (InkDoc.width === page width), so a stroke maps 1:1 without resampling.
 */
export async function exportAnnotatedPdf(input: ExportPdfInput): Promise<Uint8Array> {
  const { PDFDocument, rgb, degrees } = await import('pdf-lib')
  const src = await PDFDocument.load(input.source, { ignoreEncryption: true, updateMetadata: false })
  const out = await PDFDocument.create()
  const pages = input.document.pages ?? []
  const indices = pages.map((p) => p.sourceIndex).filter((i) => i >= 0 && i < src.getPageCount())
  const copied = await out.copyPages(src, indices)

  copied.forEach((page, i) => {
    const model = pages[i]!
    if (model.rotation) page.setRotation(degrees(((page.getRotation().angle + model.rotation) % 360 + 360) % 360))
    out.addPage(page)

    const ink = input.inkByPage[model.id]
    const { width: pw, height: ph } = displaySize(model)
    const sx = ink && ink.width > 0 ? pw / ink.width : 1
    // pdf-lib's drawSvgPath uses a y-down SVG frame anchored at (x, y); the
    // page's own rotation is applied by the viewer, so draw in the unrotated
    // frame and let setRotation present it.
    const rot = ((page.getRotation().angle % 360) + 360) % 360
    // Content coordinates are relative to the crop box origin, which is not
    // always (0, 0); pdf.js sizes the page from the same box.
    const box = page.getCropBox()
    // Rotation-aware anchor: drawSvgPath maps the y-down SVG frame through
    // translate → rotate → scale(1,-1); these anchors put the displayed
    // page's visual top-left at the SVG origin for each rotation.
    const anchor =
      rot === 0 ? { x: box.x, y: box.y + ph, rotate: degrees(0) }
      : rot === 90 ? { x: box.x, y: box.y, rotate: degrees(90) }
      : rot === 180 ? { x: box.x + pw, y: box.y, rotate: degrees(180) }
      : { x: box.x + ph, y: box.y + pw, rotate: degrees(270) }
    /** Displayed point → unrotated page point (same mapping as the anchor). */
    const toPage = (dx: number, dy: number): { x: number; y: number } =>
      rot === 0 ? { x: box.x + dx, y: box.y + ph - dy }
      : rot === 90 ? { x: box.x + dy, y: box.y + dx }
      : rot === 180 ? { x: box.x + pw - dx, y: box.y + dy }
      : { x: box.x + ph - dy, y: box.y + pw - dx }
    const place = (d: string, opts: { color: string; opacity: number; width?: number; fill: boolean }) => {
      const { r, g, b } = hexToRgb(opts.color)
      const alpha = Math.max(0, Math.min(1, opts.opacity * hexAlpha(opts.color)))
      const common = { scale: sx, opacity: alpha, borderOpacity: alpha }
      if (opts.fill) {
        page.drawSvgPath(d, { ...common, ...anchor, color: rgb(r, g, b), borderWidth: 0 })
      } else {
        page.drawSvgPath(d, {
          ...common,
          ...anchor,
          borderColor: rgb(r, g, b),
          borderWidth: (opts.width ?? 1) * sx,
          borderLineCap: 1,
        })
      }
    }
    for (const s of ink?.strokes ?? []) {
      const opacity = s.opacity ?? DEFAULT_OPACITY[s.tool]
      if (s.shape) {
        const d = shapePathD(s)
        if (s.shape.fill && s.shape.fill !== 'none') place(d, { color: s.shape.fill, opacity, fill: true })
        place(d, { color: s.color, opacity, width: s.size, fill: false })
      } else {
        place(strokeOutlineD(s), { color: s.color, opacity, fill: true })
      }
    }
    const notes = input.textByPage?.[model.id] ?? model.texts ?? []
    for (const note of notes) {
      if (!note.text.trim()) continue
      const { r, g, b } = hexToRgb(note.color)
      const fontSize = note.size
      const lineHeight = fontSize * 1.3
      // Text notes are stored in displayed page points (no ink scaling).
      note.text.split('\n').forEach((line, li) => {
        const base = toPage(note.x, note.y + lineHeight * li + fontSize)
        page.drawText(line, {
          x: base.x,
          y: base.y,
          size: fontSize,
          color: rgb(r, g, b),
          rotate: degrees(rot),
        })
      })
    }
  })
  return out.save({ useObjectStreams: true })
}

/** Convenience: an InkStroke's colour as used by the export (tests). */
export const strokeExportColor = (s: InkStroke): string => s.color
