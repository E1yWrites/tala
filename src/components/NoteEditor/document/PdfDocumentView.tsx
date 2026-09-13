import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { RefObject } from 'react'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import {
  ArrowDown,
  ArrowUp,
  Download,
  FileDown,
  LayoutGrid,
  RotateCw,
  Trash2,
  Type,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { toast } from 'sonner'
import type { DocumentPage, DocumentRecord, Note, PageTextNote } from '@/types/models'
import { pageInkKey } from '@/types/models'
import type { InkDoc, InkPointerMode, InkStroke } from '@/types/ink'
import { useNoteStore } from '@/store/noteStore'
import { useUIStore } from '@/store/uiStore'
import { assetRepository } from '@/database/repositories/assetRepository'
import { pageInkRepository } from '@/database/repositories/pageInkRepository'
import { displaySize, exportAnnotatedPdf, openPdf, renderPage, type RenderHandle } from '@/lib/documents/pdf'
import { emptyPageInk, rotateInkDoc90, rotateTextNotes90 } from '@/lib/documents/pageInk'
import { downloadAsset } from '@/lib/documents/assets'
import { getInkClipboard } from '@/lib/inkSession'
import { createId } from '@/utils/id'
import { cn } from '@/utils/cn'
import { sanitizeFilename } from '@/utils/markdown'
import { InkLayer, type InkLayerHandle, type InkPrefsSnapshot } from '../ink/InkLayer'
import { ToolButton, ToolSeparator } from '../toolbar/ToolButton'
import { confirmAction } from '../../NoteList/noteActions'

/* ---------------------------------------------------------------------------
   PDF surface: a vertical stack of pages, each a lazily rendered pdf.js
   canvas with its own InkLayer on top. Ink is stored per page (page-space
   points) through the same note-store pipeline as ordinary handwriting, so
   autosave, flush-on-leave and undo/redo all come for free.

   The host (NoteEditor) keeps its toolbar; this component exposes one
   InkLayerHandle that routes each action to the right page:
     undo/redo → the page last drawn on, selection ops → the page holding
     the selection, paste/select-all → the page last touched.
--------------------------------------------------------------------------- */

const PAGE_GAP = 20
const THUMB_WIDTH = 96
/** Largest canvas edge we let a page render at (memory guard). */
const MAX_CANVAS_EDGE = 4096

const ZOOM_STEPS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3]

interface PdfDocumentViewProps {
  note: Note
  document: DocumentRecord
  /** Handwriting on (pen mode). */
  drawing: boolean
  prefs: InkPrefsSnapshot
  readOnly: boolean
  /** Editor scroll container — pages live inside it; two-finger pan needs it. */
  scrollRef: RefObject<HTMLDivElement | null>
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void
  onPaletteRequest?: (x: number, y: number) => void
  onSelectionChange?: (count: number, shapes: number) => void
  onStrokeCommitted?: (stroke: InkStroke) => void
  onRequestTool?: (tool: InkPointerMode) => void
}

/** Shared observer so hundreds of pages don't each create their own. */
function useVisibility(root: RefObject<HTMLElement | null>, margin: string) {
  const callbacks = useRef(new Map<Element, (ratio: number, visible: boolean) => void>())
  const observer = useRef<IntersectionObserver | null>(null)
  useEffect(() => {
    observer.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) callbacks.current.get(e.target)?.(e.intersectionRatio, e.isIntersecting)
      },
      { root: root.current, rootMargin: margin, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] },
    )
    for (const el of callbacks.current.keys()) observer.current.observe(el)
    return () => observer.current?.disconnect()
  }, [root, margin])
  return useCallback((el: Element | null, cb: ((ratio: number, visible: boolean) => void) | null) => {
    if (!el) return
    if (cb) {
      callbacks.current.set(el, cb)
      observer.current?.observe(el)
    } else {
      callbacks.current.delete(el)
      observer.current?.unobserve(el)
    }
  }, [])
}

export const PdfDocumentView = forwardRef<InkLayerHandle, PdfDocumentViewProps>(function PdfDocumentView(
  { note, document: doc, drawing, prefs, readOnly, scrollRef, onHistoryChange, onPaletteRequest, onSelectionChange, onStrokeCommitted, onRequestTool },
  ref,
) {
  const inkDocs = useNoteStore((s) => s.inkDocs)
  const saveInk = useNoteStore((s) => s.saveInk)
  const loadPageInk = useNoteStore((s) => s.loadPageInk)
  const pageInkLoaded = useNoteStore((s) => s.pageInkLoaded[note.id] === true)
  const updateDocument = useNoteStore((s) => s.updateDocument)

  const [pdf, setPdf] = useState<PDFDocumentProxy | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [zoom, setZoom] = useState<number | 'fit'>('fit')
  const [showThumbs, setShowThumbs] = useState(false)
  const [textTool, setTextTool] = useState(false)
  const [currentPageId, setCurrentPageId] = useState<string | null>(doc.pages?.[0]?.id ?? null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [exporting, setExporting] = useState(false)

  const rootRef = useRef<HTMLDivElement | null>(null)
  const handles = useRef(new Map<string, InkLayerHandle>())
  const selectionCounts = useRef(new Map<string, number>())
  const shapeCounts = useRef(new Map<string, number>())
  const focusedPageRef = useRef<string | null>(null)
  const lastEditedPageRef = useRef<string | null>(null)
  const visibleRatios = useRef(new Map<string, number>())
  const sourceBytesRef = useRef<ArrayBuffer | null>(null)

  const pages = doc.pages ?? []

  /* ------------------------------ Loading -------------------------------- */

  useEffect(() => {
    void loadPageInk(note.id)
  }, [loadPageInk, note.id])

  useEffect(() => {
    let cancelled = false
    let opened: Awaited<ReturnType<typeof openPdf>> | null = null
    setPdf(null)
    setLoadError(null)
    ;(async () => {
      const asset = await assetRepository.get(doc.assetId)
      if (!asset) throw new Error('The PDF file for this note is missing from storage.')
      sourceBytesRef.current = asset.data
      opened = await openPdf(asset.data)
      if (cancelled) {
        await opened.destroy()
        return
      }
      setPdf(opened.doc)
    })().catch((err: unknown) => {
      if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err))
    })
    return () => {
      cancelled = true
      void opened?.destroy()
    }
  }, [doc.assetId])

  useEffect(() => {
    const el = rootRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setContainerWidth(el.clientWidth))
    ro.observe(el)
    setContainerWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const observe = useVisibility(scrollRef, '600px 0px')

  const scaleFor = useCallback(
    (page: DocumentPage): number => {
      const { width } = displaySize(page)
      if (zoom === 'fit') return containerWidth > 0 ? Math.max(0.2, (containerWidth - 32) / width) : 1
      return zoom
    },
    [containerWidth, zoom],
  )

  /* ----------------------------- Ink routing ----------------------------- */

  const pageIds = useMemo(() => pages.map((p) => p.id), [pages])
  const focused = (): InkLayerHandle | undefined =>
    (focusedPageRef.current && handles.current.get(focusedPageRef.current)) ||
    (currentPageId ? handles.current.get(currentPageId) : undefined) ||
    handles.current.get(pageIds[0] ?? '')
  const lastEdited = (): InkLayerHandle | undefined =>
    (lastEditedPageRef.current && handles.current.get(lastEditedPageRef.current)) || focused()
  const withSelection = (): InkLayerHandle | undefined => {
    for (const [id, n] of selectionCounts.current) if (n > 0) return handles.current.get(id)
    return undefined
  }

  useImperativeHandle(
    ref,
    () => ({
      undo: () => lastEdited()?.undo(),
      redo: () => lastEdited()?.redo(),
      clearAll: () => {
        for (const h of handles.current.values()) h.clearAll()
      },
      deleteSelection: () => withSelection()?.deleteSelection(),
      duplicateSelection: () => withSelection()?.duplicateSelection(),
      copySelection: () => withSelection()?.copySelection(),
      cutSelection: () => withSelection()?.cutSelection(),
      paste: () => focused()?.paste(),
      rotateSelection: (deg) => withSelection()?.rotateSelection(deg),
      recolorSelection: (c) => withSelection()?.recolorSelection(c),
      selectAll: () => focused()?.selectAll(),
      clearSelection: () => {
        for (const h of handles.current.values()) h.clearSelection()
      },
      setShapeStyle: (patch) => withSelection()?.setShapeStyle(patch),
      resizeSelection: (f) => withSelection()?.resizeSelection(f),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentPageId, pageIds],
  )

  const totalSelection = useCallback(() => {
    let n = 0
    for (const v of selectionCounts.current.values()) n += v
    return n
  }, [])
  const totalShapes = (): number => {
    let n = 0
    for (const v of shapeCounts.current.values()) n += v
    return n
  }

  // Keyboard shortcuts for the routed handle (mirrors InkLayer's own set).
  useEffect(() => {
    if (!drawing) return
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      const ui = useUIStore.getState()
      if (ui.modalStack.length > 0 || ui.sidebarDrawerOpen) return
      const mod = e.ctrlKey || e.metaKey
      const k = e.key.toLowerCase()
      if (mod && k === 'z') {
        e.preventDefault()
        if (e.shiftKey) lastEdited()?.redo()
        else lastEdited()?.undo()
        return
      }
      if (mod && k === 'y') {
        e.preventDefault()
        lastEdited()?.redo()
        return
      }
      const sel = withSelection()
      if (mod && sel) {
        if (k === 'c') { e.preventDefault(); sel.copySelection(); return }
        if (k === 'x') { e.preventDefault(); sel.cutSelection(); return }
        if (k === 'd') { e.preventDefault(); sel.duplicateSelection(); return }
      }
      if (mod && k === 'v' && getInkClipboard().length > 0) {
        e.preventDefault()
        focused()?.paste()
        return
      }
      if (mod && k === 'a' && prefs.tool === 'select') {
        e.preventDefault()
        focused()?.selectAll()
        return
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && sel) {
        e.preventDefault()
        sel.deleteSelection()
        return
      }
      if (e.key === 'Escape' && totalSelection() > 0) {
        for (const h of handles.current.values()) h.clearSelection()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawing, prefs.tool])

  /* ---------------------------- Page mutations --------------------------- */

  const commitPages = useCallback(
    (next: DocumentPage[]) => void updateDocument(doc.id, { pages: next }),
    [doc.id, updateDocument],
  )

  const currentIndex = pages.findIndex((p) => p.id === currentPageId)

  const movePage = (dir: -1 | 1): void => {
    if (currentIndex < 0) return
    const j = currentIndex + dir
    if (j < 0 || j >= pages.length) return
    const next = pages.slice()
    ;[next[currentIndex], next[j]] = [next[j]!, next[currentIndex]!]
    commitPages(next)
  }

  const rotatePage = (): void => {
    const page = pages[currentIndex]
    if (!page) return
    const prev = displaySize(page)
    const key = pageInkKey(note.id, page.id)
    const ink = inkDocs[key]
    if (ink && ink.strokes.length > 0) saveInk(key, rotateInkDoc90(ink, prev))
    const rotated: DocumentPage = {
      ...page,
      rotation: (page.rotation + 90) % 360,
      ...(page.texts ? { texts: rotateTextNotes90(page.texts, prev) } : {}),
    }
    commitPages(pages.map((p) => (p.id === page.id ? rotated : p)))
  }

  const deletePage = (): void => {
    const page = pages[currentIndex]
    if (!page || pages.length <= 1) {
      toast.info('A document needs at least one page')
      return
    }
    confirmAction({
      title: 'Delete this page?',
      message: `Page ${currentIndex + 1} and any notes written on it will be removed from this document. The original file is not changed.`,
      confirmLabel: 'Delete page',
      danger: true,
      onConfirm: () => {
        const next = pages.filter((p) => p.id !== page.id)
        commitPages(next)
        void pageInkRepository.remove(pageInkKey(note.id, page.id)).catch(() => {})
        setCurrentPageId(next[Math.min(currentIndex, next.length - 1)]?.id ?? null)
      },
    })
  }

  const updateTexts = useCallback(
    (pageId: string, texts: PageTextNote[]) => {
      const fresh = useNoteStore.getState().documents[doc.id]
      if (!fresh?.pages) return
      commitPages(fresh.pages.map((p) => (p.id === pageId ? { ...p, texts } : p)))
    },
    [commitPages, doc.id],
  )

  /* -------------------------------- Export ------------------------------- */

  const exportPdf = async (): Promise<void> => {
    if (exporting) return
    setExporting(true)
    try {
      await useNoteStore.getState().flushInk(note.id)
      const asset = await assetRepository.get(doc.assetId)
      if (!asset) throw new Error('Source PDF missing')
      const records = await pageInkRepository.byNote(note.id)
      const inkByPage: Record<string, InkDoc | undefined> = {}
      for (const r of records) inkByPage[r.pageId] = r.doc
      // In-memory ink wins over what may still be in flight
      for (const p of pages) {
        const mem = useNoteStore.getState().inkDocs[pageInkKey(note.id, p.id)]
        if (mem) inkByPage[p.id] = mem
      }
      const fresh = useNoteStore.getState().documents[doc.id] ?? doc
      const bytes = await exportAnnotatedPdf({ document: fresh, source: asset.data, inkByPage })
      const blob = new Blob([bytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      const a = window.document.createElement('a')
      a.href = url
      a.download = `${sanitizeFilename(note.title || 'document')}.pdf`
      window.document.body.appendChild(a)
      a.click()
      a.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      toast.success('Annotated PDF exported')
    } catch (err) {
      console.error('[tala] pdf export failed', err)
      toast.error('Could not export the PDF', { description: err instanceof Error ? err.message : undefined })
    } finally {
      setExporting(false)
    }
  }

  const downloadOriginal = async (): Promise<void> => {
    const asset = await assetRepository.get(doc.originalAssetId ?? doc.assetId)
    if (!asset) {
      toast.error('The original file is missing from storage')
      return
    }
    downloadAsset(asset, doc.source.fileName)
  }

  /* ------------------------------ Navigation ----------------------------- */

  const scrollToPage = (id: string): void => {
    const el = rootRef.current?.querySelector<HTMLElement>(`[data-page-id="${id}"]`)
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
    setCurrentPageId(id)
    focusedPageRef.current = id
  }

  const onPageVisibility = useCallback((id: string, ratio: number) => {
    visibleRatios.current.set(id, ratio)
    let best: string | null = null
    let bestRatio = 0
    for (const [pid, r] of visibleRatios.current) {
      if (r > bestRatio) {
        best = pid
        bestRatio = r
      }
    }
    if (best) setCurrentPageId((cur) => (cur === best ? cur : best))
  }, [])

  const zoomIn = (): void => setZoom((z) => {
    const cur = z === 'fit' ? (pages[0] ? scaleFor(pages[0]) : 1) : z
    return ZOOM_STEPS.find((s) => s > cur + 0.01) ?? ZOOM_STEPS[ZOOM_STEPS.length - 1]!
  })
  const zoomOut = (): void => setZoom((z) => {
    const cur = z === 'fit' ? (pages[0] ? scaleFor(pages[0]) : 1) : z
    return [...ZOOM_STEPS].reverse().find((s) => s < cur - 0.01) ?? ZOOM_STEPS[0]!
  })

  /* -------------------------------- Render ------------------------------- */

  if (loadError) {
    return (
      <div className="mx-auto max-w-md rounded-wobbly-md border-2 border-dashed border-accent/50 bg-accent/[0.06] p-4 text-sm text-accent">
        Could not open this PDF: {loadError}
      </div>
    )
  }

  const zoomLabel = zoom === 'fit' ? 'Fit' : `${Math.round(zoom * 100)}%`

  return (
    <div ref={rootRef} className="pdf-view relative" data-testid="pdf-view">
      {/* Document toolbar — sticks under the editor header while scrolling */}
      <div
        role="toolbar"
        aria-label="Document tools"
        className="no-scrollbar sticky top-0 z-40 -mx-2 mb-3 flex items-center gap-0.5 overflow-x-auto rounded-wobbly-sm border border-lineSoft bg-panel/95 px-1.5 py-1 backdrop-blur"
      >
        <ToolButton icon={LayoutGrid} label="Page thumbnails" active={showThumbs} onClick={() => setShowThumbs((v) => !v)} />
        <span className="shrink-0 px-1.5 text-xs tabular-nums text-muted" aria-live="polite">
          {currentIndex >= 0 ? currentIndex + 1 : 1} / {pages.length}
        </span>
        <ToolSeparator />
        <ToolButton icon={ZoomOut} label="Zoom out" onClick={zoomOut} />
        <button
          type="button"
          onClick={() => setZoom('fit')}
          className={cn('h-8 shrink-0 rounded-wobbly-sm px-2 text-xs tabular-nums transition-colors hover:bg-raise', zoom === 'fit' ? 'text-ink' : 'text-muted')}
          aria-label="Fit page width"
        >
          {zoomLabel}
        </button>
        <ToolButton icon={ZoomIn} label="Zoom in" onClick={zoomIn} />
        {!readOnly && (
          <>
            <ToolSeparator />
            <ToolButton icon={Type} label="Add text note (click a page)" active={textTool} onClick={() => setTextTool((v) => !v)} />
            <ToolButton icon={RotateCw} label="Rotate page" onClick={rotatePage} />
            <ToolButton icon={ArrowUp} label="Move page up" disabled={currentIndex <= 0} onClick={() => movePage(-1)} />
            <ToolButton icon={ArrowDown} label="Move page down" disabled={currentIndex < 0 || currentIndex >= pages.length - 1} onClick={() => movePage(1)} />
            <ToolButton icon={Trash2} label="Delete page" disabled={pages.length <= 1} onClick={deletePage} className="hover:text-accent" />
          </>
        )}
        <ToolSeparator />
        <ToolButton icon={FileDown} label={exporting ? 'Exporting…' : 'Export annotated PDF'} disabled={exporting} onClick={() => void exportPdf()} />
        <ToolButton icon={Download} label="Download original file" onClick={() => void downloadOriginal()} />
      </div>

      {showThumbs && pdf && (
        <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto pb-1" role="list" aria-label="Pages">
          {pages.map((p, i) => (
            <PageThumbnail
              key={p.id}
              pdf={pdf}
              page={p}
              index={i}
              current={p.id === currentPageId}
              onSelect={() => scrollToPage(p.id)}
            />
          ))}
        </div>
      )}

      {!pdf && !loadError && (
        <div className="grid min-h-[40vh] place-items-center text-sm text-faint">Opening PDF…</div>
      )}

      {pdf && (
        <div className="flex flex-col items-center" style={{ gap: PAGE_GAP }}>
          {pages.map((p, i) => (
            <PdfPageView
              key={p.id}
              pdf={pdf}
              page={p}
              index={i}
              scale={scaleFor(p)}
              observe={observe}
              onVisibility={onPageVisibility}
              current={p.id === currentPageId}
              drawing={drawing && !readOnly}
              textTool={textTool && !readOnly}
              readOnly={readOnly}
              prefs={prefs}
              scrollRef={scrollRef}
              ink={pageInkLoaded ? inkDocs[pageInkKey(note.id, p.id)] ?? null : null}
              inkReady={pageInkLoaded}
              onInkChange={(d) => {
                lastEditedPageRef.current = p.id
                saveInk(pageInkKey(note.id, p.id), d)
              }}
              onFocusPage={() => {
                focusedPageRef.current = p.id
                setCurrentPageId(p.id)
              }}
              registerHandle={(h) => {
                if (h) handles.current.set(p.id, h)
                else handles.current.delete(p.id)
              }}
              onHistoryChange={(u, r) => {
                if (lastEditedPageRef.current === p.id || !lastEditedPageRef.current) onHistoryChange?.(u, r)
              }}
              onPaletteRequest={onPaletteRequest}
              onSelectionChange={(n, shapes) => {
                selectionCounts.current.set(p.id, n)
                shapeCounts.current.set(p.id, shapes)
                onSelectionChange?.(totalSelection(), totalShapes())
              }}
              onStrokeCommitted={onStrokeCommitted}
              onRequestTool={onRequestTool}
              onTextsChange={(texts) => updateTexts(p.id, texts)}
              onTextPlaced={() => setTextTool(false)}
            />
          ))}
        </div>
      )}
    </div>
  )
})

/* --------------------------------- Page ---------------------------------- */

interface PdfPageViewProps {
  pdf: PDFDocumentProxy
  page: DocumentPage
  index: number
  scale: number
  observe: (el: Element | null, cb: ((ratio: number, visible: boolean) => void) | null) => void
  onVisibility: (id: string, ratio: number) => void
  current: boolean
  drawing: boolean
  textTool: boolean
  readOnly: boolean
  prefs: InkPrefsSnapshot
  scrollRef: RefObject<HTMLDivElement | null>
  ink: InkDoc | null
  inkReady: boolean
  onInkChange: (doc: InkDoc) => void
  onFocusPage: () => void
  registerHandle: (h: InkLayerHandle | null) => void
  onHistoryChange: (canUndo: boolean, canRedo: boolean) => void
  onPaletteRequest?: (x: number, y: number) => void
  onSelectionChange: (n: number, shapes: number) => void
  onStrokeCommitted?: (stroke: InkStroke) => void
  onRequestTool?: (tool: InkPointerMode) => void
  onTextsChange: (texts: PageTextNote[]) => void
  onTextPlaced: () => void
}

const PdfPageView = memo(function PdfPageView({
  pdf,
  page,
  index,
  scale,
  observe,
  onVisibility,
  current,
  drawing,
  textTool,
  readOnly,
  prefs,
  scrollRef,
  ink,
  inkReady,
  onInkChange,
  onFocusPage,
  registerHandle,
  onHistoryChange,
  onPaletteRequest,
  onSelectionChange,
  onStrokeCommitted,
  onRequestTool,
  onTextsChange,
  onTextPlaced,
}: PdfPageViewProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const pdfPageRef = useRef<PDFPageProxy | null>(null)
  const renderRef = useRef<{ cancel: () => void } | null>(null)
  const [visible, setVisible] = useState(false)
  const [rendered, setRendered] = useState(false)
  const { width: dw, height: dh } = displaySize(page)
  const cssW = Math.round(dw * scale)
  const cssH = Math.round(dh * scale)

  useEffect(() => {
    const el = wrapRef.current
    observe(el, (ratio, isVisible) => {
      setVisible(isVisible)
      onVisibility(page.id, ratio)
    })
    return () => observe(el, null)
  }, [observe, onVisibility, page.id])

  // Render when visible; re-render on zoom / rotation (debounced so a
  // pinch-zoom doesn't queue a render per frame).
  useEffect(() => {
    if (!visible) {
      renderRef.current?.cancel()
      renderRef.current = null
      return
    }
    let cancelled = false
    const timer = window.setTimeout(async () => {
      try {
        pdfPageRef.current ??= await pdf.getPage(page.sourceIndex + 1)
        const canvas = canvasRef.current
        if (cancelled || !canvas) return
        renderRef.current?.cancel()
        const dpr = Math.min(window.devicePixelRatio || 1, MAX_CANVAS_EDGE / Math.max(cssW, cssH))
        const handle = renderPage(pdfPageRef.current, page, canvas, scale, Math.max(0.5, dpr))
        renderRef.current = handle
        await handle.promise
        if (!cancelled) setRendered(true)
      } catch (err) {
        const name = (err as { name?: string })?.name
        if (name !== 'RenderingCancelledException' && !cancelled) console.warn('[tala] page render failed', err)
      }
    }, rendered ? 150 : 0)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, scale, page.rotation, page.sourceIndex, pdf])

  useEffect(() => () => {
    renderRef.current?.cancel()
    pdfPageRef.current?.cleanup()
  }, [])

  const inkDoc = useMemo(() => ink ?? emptyPageInk(page), [ink, page])

  const placeText = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!textTool) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - rect.left) / scale
    const y = (e.clientY - rect.top) / scale
    const note: PageTextNote = { id: createId(), x, y, width: Math.min(220, dw - x), text: '', size: 14, color: '#1f2937' }
    onTextsChange([...(page.texts ?? []), note])
    onTextPlaced()
  }

  return (
    <div
      ref={wrapRef}
      data-page-id={page.id}
      data-page-index={index}
      className={cn('pdf-page relative shrink-0 bg-white shadow-sketch-sm', current && 'ring-2 ring-accent/50')}
      style={{ width: cssW, height: cssH, scrollMarginTop: 56 }}
      onPointerDownCapture={onFocusPage}
    >
      <canvas ref={canvasRef} className="absolute left-0 top-0" style={{ width: cssW, height: cssH }} aria-label={`Page ${index + 1}`} />
      {!rendered && (
        <div className="absolute inset-0 grid place-items-center text-xs text-faint" aria-hidden="true">
          Page {index + 1}
        </div>
      )}
      {/* Text notes sit between the page and the ink so ink can cross them */}
      {(page.texts ?? []).map((t) => (
        <PageTextNoteView
          key={t.id}
          note={t}
          scale={scale}
          readOnly={readOnly}
          onChange={(next) => onTextsChange((page.texts ?? []).map((n) => (n.id === t.id ? next : n)))}
          onDelete={() => onTextsChange((page.texts ?? []).filter((n) => n.id !== t.id))}
        />
      ))}
      {textTool && (
        <div
          className="absolute inset-0 z-[35] cursor-text"
          onClick={placeText}
          role="button"
          aria-label="Place a text note"
          tabIndex={-1}
        />
      )}
      <div className="absolute inset-0 overflow-hidden">
        {inkReady && (
          <InkLayer
            ref={registerHandle}
            ink={inkDoc}
            onChange={onInkChange}
            scrollRef={scrollRef}
            active={drawing && !textTool}
            prefs={prefs}
            keyboard={false}
            onPointerDownCapture={onFocusPage}
            onHistoryChange={onHistoryChange}
            onPaletteRequest={onPaletteRequest}
            onSelectionChange={onSelectionChange}
            onStrokeCommitted={onStrokeCommitted}
            onRequestTool={onRequestTool}
          />
        )}
      </div>
    </div>
  )
})

/* ------------------------------ Text notes ------------------------------- */

function PageTextNoteView({
  note,
  scale,
  readOnly,
  onChange,
  onDelete,
}: {
  note: PageTextNote
  scale: number
  readOnly: boolean
  onChange: (n: PageTextNote) => void
  onDelete: () => void
}): React.ReactNode {
  const [draft, setDraft] = useState(note.text)
  const [editing, setEditing] = useState(note.text === '')
  const timer = useRef<number | null>(null)
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)

  useEffect(() => setDraft(note.text), [note.text])

  const commit = (text: string): void => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => onChange({ ...note, text }), 400)
  }

  const onDragStart = (e: React.PointerEvent): void => {
    if (readOnly) return
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: note.x, oy: note.y }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onDragMove = (e: React.PointerEvent): void => {
    const d = dragRef.current
    if (!d) return
    onChange({ ...note, x: Math.max(0, d.ox + (e.clientX - d.startX) / scale), y: Math.max(0, d.oy + (e.clientY - d.startY) / scale) })
  }
  const onDragEnd = (): void => {
    dragRef.current = null
  }

  return (
    <div
      className="pdf-text-note group absolute z-[32]"
      style={{ left: note.x * scale, top: note.y * scale, width: note.width * scale }}
      data-testid="page-text-note"
    >
      {!readOnly && (
        <div
          className="absolute -left-1 -top-1 hidden h-3 w-3 cursor-move rounded-full border border-line bg-postit group-hover:block group-focus-within:block"
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          onPointerCancel={onDragEnd}
          aria-label="Move text note"
          role="button"
          tabIndex={-1}
        />
      )}
      {editing && !readOnly ? (
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            commit(e.target.value)
          }}
          onBlur={() => {
            setEditing(false)
            if (timer.current !== null) window.clearTimeout(timer.current)
            if (draft.trim() === '') onDelete()
            else if (draft !== note.text) onChange({ ...note, text: draft })
          }}
          aria-label="Text note"
          className="block w-full resize-none rounded-[3px] border border-dashed border-accent/60 bg-white/85 p-0.5 font-body leading-[1.3] text-[#1f2937] outline-none"
          style={{ fontSize: note.size * scale, color: note.color }}
          rows={Math.max(1, draft.split('\n').length)}
        />
      ) : (
        <div
          role={readOnly ? undefined : 'button'}
          tabIndex={readOnly ? undefined : 0}
          onClick={() => !readOnly && setEditing(true)}
          onKeyDown={(e) => {
            if (readOnly) return
            if (e.key === 'Enter') setEditing(true)
            if (e.key === 'Delete' || e.key === 'Backspace') onDelete()
          }}
          className="whitespace-pre-wrap break-words rounded-[3px] border border-transparent p-0.5 font-body leading-[1.3] hover:border-dashed hover:border-accent/40"
          style={{ fontSize: note.size * scale, color: note.color }}
        >
          {note.text}
        </div>
      )}
    </div>
  )
}

/* ------------------------------- Thumbnail ------------------------------- */

const PageThumbnail = memo(function PageThumbnail({
  pdf,
  page,
  index,
  current,
  onSelect,
}: {
  pdf: PDFDocumentProxy
  page: DocumentPage
  index: number
  current: boolean
  onSelect: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { width: dw, height: dh } = displaySize(page)
  const scale = THUMB_WIDTH / dw
  useEffect(() => {
    let cancelled = false
    let handle: RenderHandle | null = null
    ;(async () => {
      const p = await pdf.getPage(page.sourceIndex + 1)
      if (cancelled || !canvasRef.current) return
      const h = renderPage(p, page, canvasRef.current, scale, 1)
      handle = h
      await h.promise.catch(() => {})
    })().catch(() => {})
    return () => {
      cancelled = true
      handle?.cancel()
    }
  }, [pdf, page, scale])
  return (
    <button
      type="button"
      role="listitem"
      onClick={onSelect}
      aria-label={`Go to page ${index + 1}`}
      aria-current={current || undefined}
      className={cn(
        'shrink-0 rounded-[4px] border-2 bg-white p-0.5 transition-colors',
        current ? 'border-accent' : 'border-lineSoft hover:border-line',
      )}
    >
      <canvas ref={canvasRef} style={{ width: THUMB_WIDTH, height: Math.round(dh * scale) }} className="block" />
      <span className="block pt-0.5 text-center text-[10px] tabular-nums text-muted">{index + 1}</span>
    </button>
  )
})
