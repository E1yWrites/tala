import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { JSONContent } from '@tiptap/core'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GalleryHorizontal,
  MoreHorizontal,
  Minus,
  PenLine,
  Type,
  Folder as FolderIcon,
  Hash,
  LoaderCircle,
  Minimize2,
  Mic,
  Plus,
  RotateCcw,
  Share2,
  Star,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { useNoteStore } from '@/store/noteStore'
import { useFolderStore } from '@/store/folderStore'
import { useNotePages } from '@/store/pageStore'
import {
  addPage,
  deletePage,
  duplicatePage,
  flush as flushLibrary,
  movePage,
  patchNote,
  restoreNote,
  saveInk,
  savePageContent,
  saveTitle,
  setTemplate,
} from '@/library/notes'
import type { SaveResult } from '@/library/notes'
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { usePrefsStore } from '@/store/prefsStore'
import { useSettingsStore } from '@/store/settingsStore'
import type { Note } from '@/types/models'
import type { InkDoc, InkPointerMode, InkStroke } from '@/types/ink'
import { INK_PRESETS } from '@/types/ink'
import { cn } from '@/utils/cn'
import { folderColor } from '@/utils/folderColor'
import { formatFull, formatRelative } from '@/utils/dates'
import { FavoriteStar } from '../UI/FavoriteStar'
import { TagChip } from '../UI/TagChip'
import { Tooltip } from '../UI/Tooltip'
import { DropdownMenu, type MenuItem } from '../UI/DropdownMenu'
import { Button } from '../UI/Button'
import { isTypingTarget } from './ink/InkLayer'
import type { InkLayerHandle } from './ink/InkLayer'
import { PenBar } from './ink/PenBar'
import { InkEntryDialog } from './ink/InkEntryDialog'
import { dayKey } from '@/coach/study'
import { formatLongDay } from '@/entries/parse'
import { PageSheet, pageHeights } from './PageSheet'
import { ZoomColumn } from '@/canvas/ZoomColumn'
import { PageStrip } from '@/canvas/PageStrip'
import { inkHistoryState, recordInk, stepInk } from '@/canvas/inkHistory'
import { RecordingsPanel } from './Recordings'
import type { RecordingsHandle } from './Recordings'
import { useRecorderStore } from '@/library/recorder'
import { endSession, noteWriting, openSession } from '@/library/study'
import type { ZoomHandle } from '@/canvas/ZoomColumn'
import { BituinNudge } from '@/coach/BituinNudge'
import { useMediaQuery, BREAKPOINTS } from '@/hooks/useMediaQuery'
import { PenPalette } from './ink/PenPalette'
import type { PenPaletteState } from './ink/PenPalette'
import { buildNoteMenu, confirmAction, deleteForeverAndPrune } from '../NoteList/noteActions'

/** Pages mounted on each side of the one in view; the rest are sized boxes. */
const NEAR_PAGES = 2

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved'

function templateLabel(t: 'blank' | 'ruled' | 'grid'): string {
  switch (t) {
    case 'ruled':
      return 'Ruled'
    case 'grid':
      return 'Grid'
    default:
      return 'Blank'
  }
}

interface PendingPatch {
  title?: string
  /** Typed text per page id (several pages are open at once). */
  pages?: Record<string, JSONContent>
}

export function NoteEditor({ noteId }: { noteId: string }): React.ReactNode {
  const note: Note | undefined = useNoteStore((s) => s.notes.find((n) => n.id === noteId))
  const folders = useFolderStore((s) => s.folders)
  const tags = useTagStore((s) => s.tags)
  const selectNote = useUIStore((s) => s.selectNote)
  const focusMode = useUIStore((s) => s.focusMode)
  const toggleFocusMode = useUIStore((s) => s.toggleFocusMode)
  const readingLayout = usePrefsStore((s) => s.readingLayout)
  const toggleReadingLayout = usePrefsStore((s) => s.toggleReadingLayout)
  const openModal = useUIStore((s) => s.openModal)
  const autosaveEnabled = useSettingsStore((s) => s.settings.autosaveEnabled)
  const fontSize = useSettingsStore((s) => s.settings.editorFontSize)
  const lineHeight = useSettingsStore((s) => s.settings.editorLineHeight)

  /* --------------------------------- Pages --------------------------------- */

  const pages = useNotePages(noteId)
  const pagesRef = useRef(pages)
  pagesRef.current = pages
  /** The page in view: the counter, the page menu and Clear act on it. */
  const [current, setCurrent] = useState(() => {
    const want = useUIStore.getState().pendingPageId ?? usePrefsStore.getState().lastPages[noteId]
    return Math.max(0, pages.findIndex((p) => p.id === want))
  })
  const activePage = pages[Math.min(current, pages.length - 1)]
  /** Scroll this page to the top of the view once rendered (an index into the next `pages`). */
  const [target, setTarget] = useState<{ index: number } | null>(() => (current > 0 ? { index: current } : null))
  const goToPage = useCallback((index: number) => setTarget({ index }), [])
  const setLastPage = usePrefsStore((s) => s.setLastPage)

  // Open on the page Tasks pointed at, else where you left off
  useEffect(() => {
    useUIStore.getState().clearPendingPage()
  }, [])
  useEffect(() => {
    if (activePage) setLastPage(noteId, activePage.id)
  }, [activePage, noteId, setLastPage])

  const insertPage = useCallback(
    (at: number) => {
      addPage(noteId, undefined, at)
      goToPage(at)
    },
    [goToPage, noteId],
  )

  /* --------------------------------- Pen mode ------------------------------ */

  const inkPrefs = usePrefsStore((s) => s.inkPrefs)
  const setInkPrefs = usePrefsStore((s) => s.setInkPrefs)
  const inkDocs = useNoteStore((s) => s.inkDocs)
  const [penMode, setPenMode] = useState(false)
  // Bituin's corner chip only when no list pane sits beside the editor
  const isPhone = useMediaQuery(BREAKPOINTS.mobile)
  const leftHanded = usePrefsStore((st) => st.leftHanded)
  // Writing comes first: while pen mode is on, the stylesheet freezes every Bituin animation
  useEffect(() => {
    document.documentElement.toggleAttribute('data-pen', penMode)
    return () => document.documentElement.removeAttribute('data-pen')
  }, [penMode])
  const [penTool, setPenTool] = useState<InkPointerMode>(inkPrefs.tool)
  const [inkHistory, setInkHistory] = useState(() => inkHistoryState(noteId))
  /** Radial palette state — null = closed; cursor mode when opened by right-click. */
  const [penPalette, setPenPalette] = useState<PenPaletteState | null>(null)
  /** Count of selected ink strokes — drives the contextual delete button in PenBar. */
  const [selectionCount, setSelectionCount] = useState(0)
  const [entryDialog, setEntryDialog] = useState(false)
  /** Mounted ink layers by page id; a selection lives on one page at a time. */
  const inkHandles = useRef(new Map<string, InkLayerHandle>())
  const selectionRef = useRef<{ pageId: string; count: number } | null>(null)
  /** The page last written on keeps the wet-ink canvas until another page is scrolled into view. */
  const [engagedPageId, setEngagedPageId] = useState<string | null>(null)
  useEffect(() => setEngagedPageId(null), [current])
  const wetPageId = engagedPageId ?? activePage?.id
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const zoomRef = useRef<ZoomHandle>(null)
  const [zoomLevel, setZoomLevel] = useState(1)
  const [showStrip, setShowStrip] = useState(false)
  const [recordingsOpen, setRecordingsOpen] = useState(false)
  const recordingsRef = useRef<RecordingsHandle>(null)
  const recordingHere = useRecorderStore((s) => s.active?.noteId === noteId)
  /** Stable id for cleanup effects that must not re-run per render. */
  const noteIdRef = useRef(noteId)
  noteIdRef.current = noteId
  /** Fresh pen-mode flag for the native pencil event listener. */
  const penModeRef = useRef(penMode)
  penModeRef.current = penMode

  const refreshInkHistory = useCallback(() => {
    const next = inkHistoryState(noteId)
    setInkHistory((prev) => (prev.canUndo === next.canUndo && prev.canRedo === next.canRedo ? prev : next))
  }, [noteId])

  /** Ink commits hit the store instantly; the library writes them and debounces the note touch-up. */
  const handleInk = useCallback(
    (pageId: string, doc: InkDoc, before: InkStroke[]) => {
      // Strokes untouched (an entry was added): nothing for undo to step through
      if (before !== doc.strokes) recordInk(noteId, { pageId, before, after: doc.strokes })
      saveInk(noteId, pageId, doc)
      noteWriting()
      refreshInkHistory()
    },
    [noteId, refreshInkHistory],
  )

  /** Undo/redo the note's last handwriting change, on whichever page it was. */
  const stepInkHistory = useCallback(
    (dir: 'undo' | 'redo') => {
      const docs = (): Record<string, InkDoc> => useNoteStore.getState().inkDocs
      const op = stepInk(noteId, dir, (id) => !!docs()[id])
      const doc = op && docs()[op.pageId]
      if (op && doc) saveInk(noteId, op.pageId, { ...doc, strokes: dir === 'undo' ? op.before : op.after })
      refreshInkHistory()
    },
    [noteId, refreshInkHistory],
  )

  // A restore cleared every history; refresh the undo/redo buttons
  useEffect(() => {
    window.addEventListener('tala:external-sync', refreshInkHistory)
    return () => window.removeEventListener('tala:external-sync', refreshInkHistory)
  }, [refreshInkHistory])

  /** Clear the page in view. */
  const clearPageInk = (): void => {
    const doc = activePage && inkDocs[activePage.id]
    if (!activePage || !doc || doc.strokes.length === 0) return
    handleInk(activePage.id, { ...doc, strokes: [] }, doc.strokes)
    toast.success('Handwriting cleared')
  }

  const selectedLayer = (): InkLayerHandle | undefined => {
    const sel = selectionRef.current
    return sel ? inkHandles.current.get(sel.pageId) : undefined
  }

  const setSelection = (next: { pageId: string; count: number } | null): void => {
    selectionRef.current = next
    setSelectionCount(next?.count ?? 0)
  }

  /** Selecting on one page drops the selection on another. */
  const handleSelection = useCallback((pageId: string, count: number) => {
    const prev = selectionRef.current
    if (count > 0) {
      if (prev && prev.pageId !== pageId) inkHandles.current.get(prev.pageId)?.clearSelection()
      setSelection({ pageId, count })
    } else if (prev?.pageId === pageId) setSelection(null)
  }, [])

  const handleInkHandle = useCallback((pageId: string, handle: InkLayerHandle | null) => {
    if (handle) inkHandles.current.set(pageId, handle)
    else {
      inkHandles.current.delete(pageId)
      // scrolled away with strokes selected: the PenBar must not act on a page that is gone
      if (selectionRef.current?.pageId === pageId) setSelection(null)
    }
  }, [])

  const handleStrokeTap = useCallback((ts: number) => {
    void recordingsRef.current?.seekToTime(ts).then((ok) => ok && setRecordingsOpen(true))
  }, [])

  // A Session lasts while this note is open; Bituin wraps it up when it closes
  useEffect(() => {
    openSession(noteId)
    return () => endSession()
  }, [noteId])

  // Land pending ink touch-ups before the editor lets go of the note (unmount/switch)
  useEffect(() => {
    return () => {
      void flushLibrary(noteIdRef.current)
    }
  }, [])

  /** Stable prefs object — InkLayer's effects depend on its identity. */
  const inkLayerPrefs = useMemo(
    () => ({
      tool: penTool,
      color: inkPrefs.color,
      sizeIdx: inkPrefs.sizeIdx,
      eraserMode: inkPrefs.eraserMode,
      pencilHover: inkPrefs.pencil.hover,
    }),
    [penTool, inkPrefs.color, inkPrefs.sizeIdx, inkPrefs.eraserMode, inkPrefs.pencil.hover],
  )

  const handlePaletteRequest = useCallback((x: number, y: number) => {
    setPenPalette({ open: true, anchor: { x, y }, mode: 'cursor' })
  }, [])

  /** Tool the E/eraser shortcut should restore to when pressed again. */
  const preShortcutToolRef = useRef<InkPointerMode>(penTool)
  const handleToolShortcut = useCallback(
    (tool: InkPointerMode) => {
      setPenTool((cur) => {
        if (cur === tool) return preShortcutToolRef.current
        preShortcutToolRef.current = cur
        return tool
      })
    },
    [],
  )

  const updatePenPrefs = useCallback(
    (
      patch: Partial<{
        tool: InkPointerMode
        color: string
        sizeIdx: number
        eraserMode: 'stroke' | 'pixel'
        preset: import('@/types/ink').InkPreset
        pencil: import('@/store/prefsStore').PencilShortcuts
      }>,
    ) => {
      if (patch.tool !== undefined) setPenTool(patch.tool)
      const persistPatch: Parameters<typeof setInkPrefs>[0] = {}
      if (patch.color !== undefined) persistPatch.color = patch.color
      if (patch.sizeIdx !== undefined) persistPatch.sizeIdx = patch.sizeIdx
      if (patch.eraserMode !== undefined) persistPatch.eraserMode = patch.eraserMode
      if (patch.preset !== undefined) persistPatch.preset = patch.preset
      if (patch.pencil !== undefined)
        persistPatch.pencil = { ...usePrefsStore.getState().inkPrefs.pencil, ...patch.pencil }
      if (patch.tool !== undefined && patch.tool !== 'select') persistPatch.tool = patch.tool
      if (Object.keys(persistPatch).length > 0) setInkPrefs(persistPatch)
    },
    [setInkPrefs],
  )

  // Pen mode keys: Escape leaves it, Ctrl+Z/Y undo and redo handwriting across
  // pages, E/V toggle the eraser/lasso. Never while typing text or a dialog is up.
  useEffect(() => {
    if (!penMode) return
    const onKey = (e: KeyboardEvent): void => {
      const ui = useUIStore.getState()
      if (ui.modalStack.length > 0 || ui.sidebarDrawerOpen) return
      if (e.key === 'Escape') {
        setPenMode(false)
        return
      }
      if (isTypingTarget(e.target)) return
      const key = e.key.toLowerCase()
      if ((e.ctrlKey || e.metaKey) && (key === 'z' || key === 'y')) {
        const dir = key === 'y' || e.shiftKey ? 'redo' : 'undo'
        const state = inkHistoryState(noteId)
        if (dir === 'undo' ? !state.canUndo : !state.canRedo) return
        e.preventDefault()
        stepInkHistory(dir)
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && (key === 'e' || key === 'v')) {
        e.preventDefault()
        handleToolShortcut(key === 'e' ? 'eraser' : 'select')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handleToolShortcut, noteId, penMode, stepInkHistory])

  // Leaving pen mode dismisses the radial palette with it
  useEffect(() => {
    if (!penMode) setPenPalette(null)
  }, [penMode])

  /* ----------------------- Apple Pencil native contract --------------------
     The PencilKit (iPad) wrapper dispatches:
       window.dispatchEvent(new CustomEvent('tala:pencil', {
         detail: { kind: 'doubletap' | 'squeeze', timestamp: Date.now() },
       }))
     The web app replies by running whatever shortcut action the user picked
     in the radial palette (Pencil settings). Desktop browsers have no
     double-tap / squeeze surface, so this is inert here — but the E2E smoke
     drives it with a synthetic event to prove the pipeline. */
  useEffect(() => {
    const onPencil = (e: Event): void => {
      const kind = (e as CustomEvent<{ kind?: unknown; timestamp?: number }>).detail?.kind
      if (kind !== 'doubletap' && kind !== 'squeeze') return
      if (!penModeRef.current) {
        return
      }
      const ui = useUIStore.getState()
      if (ui.modalStack.length > 0) return
      const prefs = usePrefsStore.getState().inkPrefs
      const action = kind === 'doubletap' ? prefs.pencil.doubleTap : prefs.pencil.squeeze
      if (action === 'undo') {
        stepInkHistory('undo')
        return
      }
      if (action === 'palette') {
        setPenPalette({
          open: true,
          anchor: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
          mode: 'trigger',
        })
        return
      }
      // eraser / pen: route through the same setter the palette uses
      updatePenPrefs({ tool: action === 'eraser' ? 'eraser' : prefs.tool })
    }
    window.addEventListener('tala:pencil', onPencil)
    return () => window.removeEventListener('tala:pencil', onPencil)
  }, [stepInkHistory, updatePenPrefs])

  const [title, setTitle] = useState(note?.title ?? '')
  const [syncKey, setSyncKey] = useState(0)
  const [status, setStatus] = useState<SaveStatus>('idle')

  const pendingRef = useRef<PendingPatch>({})
  const timerRef = useRef<number | null>(null)

  /* ------------------------------ Autosave core --------------------------- */

  type FlushResult = 'saved' | 'nothing' | 'dropped' | 'failed'

  const flush = useCallback(async (opts?: { silent?: boolean }): Promise<FlushResult> => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    const patch = pendingRef.current
    const hadPending = Object.keys(patch).length > 0
    const id = noteIdRef.current
    // A permanently deleted note can never save — discard honestly.
    // A *trashed* note still exists, though: keep edits made before the
    // trash so restoring it brings the user's words back.
    if (!useNoteStore.getState().notes.some((n) => n.id === id)) {
      pendingRef.current = {}
      setStatus('idle')
      return hadPending ? 'dropped' : 'nothing'
    }
    if (!hadPending) {
      setStatus('idle')
      return 'nothing'
    }
    pendingRef.current = {}
    setStatus('saving')
    const saves: Array<Promise<SaveResult>> = []
    if (patch.title !== undefined) saves.push(saveTitle(id, patch.title))
    for (const [pageId, doc] of Object.entries(patch.pages ?? {})) saves.push(savePageContent(id, pageId, doc))
    const results = await Promise.all(saves)
    // Brief pause so the "Saving…" state is perceivable on fast devices
    await new Promise((r) => setTimeout(r, 150))
    if (results.includes('failed')) {
      // The library rolled back and told the user; keep the edit so the next save retries it
      const newer = pendingRef.current
      pendingRef.current = { ...patch, ...newer }
      if (patch.pages || newer.pages) pendingRef.current.pages = { ...patch.pages, ...newer.pages }
      setStatus('dirty')
      return 'failed'
    }
    if (Object.keys(pendingRef.current).length > 0) {
      // Edits arrived while "saving" — keep the unsaved guard active
      setStatus('dirty')
    } else if (opts?.silent || results.every((r) => r === 'scratch' || r === 'gone')) {
      // An untitled, content-less note is memory-only by design: don't claim "saved"
      setStatus('idle')
    } else {
      setStatus('saved')
    }
    return results.includes('gone') ? 'dropped' : 'saved'
  }, [])

  const flushRef = useRef(flush)
  flushRef.current = flush

  const markDirty = useCallback((): void => {
    setStatus((s) => (s === 'saving' ? s : 'dirty'))
    if (!autosaveEnabled) return
    if (timerRef.current !== null) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => void flushRef.current(), 700)
  }, [autosaveEnabled])

  // Reset local state when switching notes; flush anything left behind
  useEffect(() => {
    void flushRef.current({ silent: true })
    setTitle(note?.title ?? '')
    pendingRef.current = {}
    setStatus('idle')
    return () => {
      void flushRef.current({ silent: true })
    }
  }, [noteId]) // eslint-disable-line react-hooks/exhaustive-deps

  /** A page's typed text changed (each page has its own editor). */
  const handleText = useCallback(
    (pageId: string, doc: JSONContent) => {
      ;(pendingRef.current.pages ??= {})[pageId] = doc
      markDirty()
      noteWriting()
    },
    [markDirty],
  )

  /** A page scrolled out: save its text now, so remounting it shows what was typed. */
  const handleLeave = useCallback((pageId: string) => {
    if (pendingRef.current.pages?.[pageId]) void flushRef.current({ silent: true })
  }, [])

  // Ctrl+S force save (event dispatched by global hotkeys)
  useEffect(() => {
    const onSave = (): void => {
      void flush().then((result) => {
        if (result === 'dropped') {
          toast.error('That note was deleted — unsaved changes could not be kept')
        } else if (result !== 'failed') {
          toast.success('Saved')
        }
      })
    }
    window.addEventListener('tala:force-save', onSave)
    return () => window.removeEventListener('tala:force-save', onSave)
  }, [flush])

  // Import/restore replaced the library under us — reload the open note from
  // the store unless there are unsaved edits (those win; we keep them).
  useEffect(() => {
    const onExternalSync = (): void => {
      if (status !== 'idle' || Object.keys(pendingRef.current).length > 0) {
        toast.info('Library was imported — your unsaved edits were kept')
        return
      }
      const fresh = useNoteStore.getState().notes.find((n) => n.id === noteId)
      pendingRef.current = {}
      setStatus('idle')
      setTitle(fresh?.title ?? '')
      setSyncKey((k) => k + 1)
    }
    window.addEventListener('tala:external-sync', onExternalSync)
    return () => window.removeEventListener('tala:external-sync', onExternalSync)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId, status])

  // Warn before leaving with unsaved edits
  useEffect(() => {
    if (status !== 'dirty') return
    const handler = (e: BeforeUnloadEvent): void => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [status])

  // Tab hidden or page closing: don't wait out the 700 ms debounce. iPad
  // home-screen PWAs never fire beforeunload, so this is the only save there.
  useEffect(() => {
    const flushNow = (): void => void flushRef.current({ silent: true })
    const onVisibility = (): void => {
      if (document.visibilityState === 'hidden') flushNow()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pagehide', flushNow)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pagehide', flushNow)
    }
  }, [])

  /* If the open note disappears (deleted forever elsewhere), close it. */
  useEffect(() => {
    if (!note) selectNote(null)
  }, [note, selectNote])

  useEffect(() => {
    if (note?.isDeleted && useUIStore.getState().activeView.kind === 'trash') return
    if (note?.isDeleted && status === 'idle') {
      // Trashed from its own more-menu → bounce back to the list
      selectNote(null)
    }
  }, [note?.isDeleted, status, selectNote])

  /* ------------------------------- Handlers ------------------------------- */

  const onTitleChange = (value: string): void => {
    setTitle(value)
    pendingRef.current.title = value
    markDirty()
  }

  /* ---------------------------- Continuous scroll -------------------------- */

  const slots = useRef(new Map<string, HTMLElement>())
  /** Each slot's height as last seen, to tell how much a page above the view grew. */
  const slotHeights = useRef(new WeakMap<Element, number>())
  const resizeObs = useRef<ResizeObserver | null>(null)

  // A page above the view changing height (mounting, an image loading) would
  // push what you are looking at; scroll by the same amount so it stays put.
  // (The scroller turns native scroll anchoring off so the two never stack.)
  useEffect(() => {
    const ro = new ResizeObserver((entries) => {
      const sc = scrollRef.current
      for (const { target: el } of entries) {
        const h = (el as HTMLElement).offsetHeight
        const prev = slotHeights.current.get(el)
        slotHeights.current.set(el, h)
        const id = (el as HTMLElement).dataset.pageId
        if (id) pageHeights.set(id, h)
        if (!sc || prev === undefined || prev === h || h === 0) continue
        const r = el.getBoundingClientRect()
        const grew = (h - prev) * (r.height / h)
        if (r.bottom - grew <= sc.getBoundingClientRect().top + 1) sc.scrollTop += grew
      }
    })
    resizeObs.current = ro
    for (const el of slots.current.values()) ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const slotRef = useCallback((pageId: string, el: HTMLElement | null) => {
    const old = slots.current.get(pageId)
    if (old && old !== el) resizeObs.current?.unobserve(old)
    if (el) {
      slots.current.set(pageId, el)
      resizeObs.current?.observe(el)
    } else slots.current.delete(pageId)
  }, [])

  /** The page in view: the last one whose top is above the middle of the scroller. */
  const measureCurrent = useCallback(() => {
    const sc = scrollRef.current
    const list = pagesRef.current
    if (!sc || list.length === 0) return
    let i = 0
    if (sc.scrollTop <= 0) i = 0
    else if (sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2) i = list.length - 1
    else {
      const probe = sc.getBoundingClientRect().top + sc.clientHeight / 2
      let hi = list.length - 1
      while (i < hi) {
        const mid = (i + hi + 1) >> 1
        const top = slots.current.get(list[mid]!.id)?.getBoundingClientRect().top ?? Infinity
        if (top <= probe) i = mid
        else hi = mid - 1
      }
    }
    setCurrent(i)
  }, [])

  const scrollFrame = useRef<number | null>(null)
  const onScroll = (): void => {
    if (scrollFrame.current === null)
      scrollFrame.current = requestAnimationFrame(() => {
        scrollFrame.current = null
        measureCurrent()
      })
  }
  useEffect(() => () => {
    if (scrollFrame.current !== null) cancelAnimationFrame(scrollFrame.current)
  }, [])

  // Pages added, moved or deleted: bring the target page to the top, then re-read the page in view
  useLayoutEffect(() => {
    const sc = scrollRef.current
    if (target) {
      const id = pages[Math.min(target.index, pages.length - 1)]?.id
      const el = id ? slots.current.get(id) : undefined
      if (sc && el) sc.scrollTop += el.getBoundingClientRect().top - sc.getBoundingClientRect().top - 8
      setTarget(null)
      setCurrent(Math.min(target.index, pages.length - 1))
      return
    }
    if (current > pages.length - 1) measureCurrent()
  }, [pages, target]) // eslint-disable-line react-hooks/exhaustive-deps

  /* ------------------------------ Sub-renderers --------------------------- */

  if (!note) {
    return (
      <div className="grid h-full place-items-center text-sm text-faint">Loading note…</div>
    )
  }

  const surface: 'live' | 'archive' | 'trash' = note.isDeleted
    ? 'trash'
    : note.isArchived
      ? 'archive'
      : 'live'

  const tagObjects = note.tagIds
    .map((id) => tags.find((t) => t.id === id))
    .filter((t): t is NonNullable<typeof t> => t !== undefined)

  const folderItems: MenuItem[] = [
    {
      id: 'none',
      label: 'No folder',
      checked: note.folderId === null,
      onSelect: () => patchNote(note.id, { folderId: null }),
    },
    ...folders.map<MenuItem>((f) => ({
      id: f.id,
      label: f.name,
      checked: note.folderId === f.id,
      onSelect: () => patchNote(note.id, { folderId: f.id }),
    })),
  ]

  const currentFolder = folders.find((f) => f.id === note.folderId)

  /** Page 1's head: title, edit date, folder and tags. */
  const titleBlock = (focusText: () => void): React.ReactNode => (
    <>
      {/* Title */}
      <input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            focusText()
          }
        }}
        placeholder="Untitled note"
        aria-label="Note title"
        disabled={note.isDeleted}
        className="w-full bg-transparent text-[30px] font-bold leading-tight tracking-[-0.025em] placeholder:text-faint/60 disabled:cursor-default"
      />

      {/* Meta row */}
      <div className="mb-3 mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        {/* A journal's first page is a day too; later pages say theirs in place of "Page N" */}
        {pages[0]?.day && <span className="text-xs font-semibold text-muted">{formatLongDay(pages[0].day)}</span>}
        <time
          dateTime={new Date(note.updatedAt).toISOString()}
          title={formatFull(note.updatedAt)}
          className="text-xs tabular-nums text-faint"
        >
          Edited {formatRelative(note.updatedAt)}
        </time>
        {note.isArchived && !note.isDeleted && (
          <span className="rounded-control border border-lineSoft bg-raise px-1.5 py-px text-[11px] text-muted">
            Archived
          </span>
        )}
        {!note.isDeleted && (
          <DropdownMenu
            side="bottom"
            align="start"
            items={folderItems}
            trigger={(props) => (
              <button
                {...props}
                type="button"
                className="-ml-1.5 inline-flex h-6 items-center gap-1.5 rounded-control px-1.5 text-xs text-muted transition-colors hover:bg-raise hover:text-ink relative after:absolute after:-inset-2.5 after:content-['']"
              >
                {currentFolder ? (
                  <span className="size-2 rounded-full" style={{ background: folderColor(currentFolder.id) }} aria-hidden="true" />
                ) : (
                  <FolderIcon size={12} aria-hidden="true" />
                )}
                {currentFolder ? currentFolder.name : 'Set folder'}
              </button>
            )}
          />
        )}
        {!note.isDeleted && (
          <span className="flex flex-wrap items-center gap-1">
            {tagObjects.map((tag) => (
              <TagChip
                key={tag.id}
                tag={tag}
                onRemove={() =>
                  patchNote(note.id, { tagIds: note.tagIds.filter((t) => t !== tag.id) })
                }
              />
            ))}
            <Tooltip label="Edit tags">
              <button
                type="button"
                onClick={() => openModal({ kind: 'tag-editor', noteId: note.id })}
                aria-label="Edit tags"
                className="grid size-6 place-items-center rounded-full border border-dashed border-line text-faint transition-colors hover:border-ink hover:text-ink relative after:absolute after:-inset-2.5 after:content-['']"
              >
                <Plus size={11} />
              </button>
            </Tooltip>
          </span>
        )}
      </div>
    </>
  )

  return (
    <div className="relative flex h-full min-h-0 flex-col bg-canvas animate-editor-in">
      {(isPhone || focusMode) && !note.isDeleted && <BituinNudge placement="corner" />}
      {/* Header: where you are, then the few controls a lecture needs */}
      <header className="flex h-[52px] shrink-0 items-center gap-1.5 border-b border-lineSoft bg-panel pl-2 pr-2 md:pl-3 [@media(pointer:coarse)]:h-14">
        <Tooltip label="Back" side="bottom">
          <button
            type="button"
            onClick={() => selectNote(null)}
            aria-label="Back to list"
            className="grid size-9 shrink-0 place-items-center rounded-control text-muted transition-colors hover:bg-raise hover:text-ink [@media(pointer:coarse)]:size-11"
          >
            <ArrowLeft size={18} />
          </button>
        </Tooltip>

        <nav aria-label="Note location" className="flex min-w-0 flex-1 items-center gap-1 text-[13px] text-muted">
          {!note.isDeleted ? (
            <DropdownMenu
              side="bottom"
              align="start"
              items={folderItems}
              trigger={(props) => (
                <button
                  {...props}
                  type="button"
                  className="hidden max-w-[150px] shrink-0 items-center gap-1.5 rounded-control px-1.5 py-1 transition-colors hover:bg-raise hover:text-ink sm:inline-flex"
                >
                  {currentFolder ? (
                    <span className="size-2 shrink-0 rounded-full" style={{ background: folderColor(currentFolder.id) }} aria-hidden="true" />
                  ) : (
                    <FolderIcon size={13} aria-hidden="true" />
                  )}
                  <span className="truncate">{currentFolder ? currentFolder.name : 'No folder'}</span>
                </button>
              )}
            />
          ) : (
            <span className="hidden px-1.5 sm:inline">Trash</span>
          )}
          <ChevronRight size={14} className="hidden shrink-0 text-faint sm:block" aria-hidden="true" />
          <span className="min-w-0 truncate font-semibold text-ink">{note.title.trim() || 'Untitled'}</span>
          <SaveStatusChip status={status} autosave={autosaveEnabled} />
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          {!note.isDeleted && !readingLayout && (
            <div role="group" aria-label="Input mode" className="flex h-9 overflow-hidden rounded-control border border-lineSoft bg-panel [@media(pointer:coarse)]:h-11">
              {(
                [
                  { on: false, label: 'Type', Icon: Type },
                  { on: true, label: 'Write', Icon: PenLine },
                ] as const
              ).map(({ on, label, Icon }) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setPenMode(on)}
                  aria-pressed={penMode === on}
                  aria-label={label}
                  className={cn(
                    'inline-flex items-center justify-center gap-1.5 px-2.5 text-[13px] font-semibold transition-colors [@media(pointer:coarse)]:min-w-11',
                    penMode === on ? 'bg-accent text-accent-fg' : 'text-muted hover:text-ink',
                  )}
                >
                  <Icon size={15} aria-hidden="true" />
                  <span className="hidden xl:inline">{label}</span>
                </button>
              ))}
            </div>
          )}
          {!note.isDeleted && (
            <Tooltip label={recordingHere ? 'Recording: open lecture audio' : 'Record the lecture'} side="bottom">
              <button
                type="button"
                onClick={() => setRecordingsOpen((o) => !o)}
                aria-pressed={recordingsOpen || recordingHere}
                aria-label={recordingHere ? 'Lecture audio (recording)' : 'Lecture audio'}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-control border px-3 text-[13px] font-semibold transition-colors [@media(pointer:coarse)]:h-11',
                  recordingsOpen || recordingHere
                    ? 'border-danger/40 bg-danger-soft text-ink'
                    : 'border-lineSoft bg-panel text-ink hover:border-line',
                )}
              >
                <span aria-hidden="true" className={cn('size-2 rounded-full bg-danger', recordingHere && 'animate-pulse-soft')} />
                <span className="hidden md:inline">{recordingHere ? 'Recording' : 'Record'}</span>
                <Mic size={15} aria-hidden="true" className="md:hidden" />
              </button>
            </Tooltip>
          )}
          {!note.isDeleted && (
            <HeaderToggle
              label={note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              active={note.isFavorite}
              tone="gold"
              onClick={() => patchNote(note.id, { isFavorite: !note.isFavorite })}
            >
              {note.isFavorite ? <FavoriteStar size={HEADER_ICON_SIZE} /> : <Star size={HEADER_ICON_SIZE} />}
            </HeaderToggle>
          )}
          <HeaderToggle
            label="Share & export"
            active={false}
            onClick={() => openModal({ kind: 'share', noteId: note.id })}
          >
            <Share2 size={HEADER_ICON_SIZE} />
          </HeaderToggle>
          {focusMode && (
            <HeaderToggle label="Exit distraction-free mode" active onClick={toggleFocusMode}>
              <Minimize2 size={HEADER_ICON_SIZE} />
            </HeaderToggle>
          )}
          <DropdownMenu
            align="end"
            items={[
              ...(!note.isDeleted
                ? ([
                    {
                      id: 'reading-layout',
                      label: readingLayout ? 'Back to editing' : 'Reading layout',
                      onSelect: () => {
                        // Flush pending edits so the reading view shows current content
                        void flushRef.current({ silent: true })
                        toggleReadingLayout()
                      },
                    },
                    ...(!focusMode && !isPhone
                      ? [{ id: 'focus', label: 'Distraction-free mode', onSelect: toggleFocusMode } satisfies MenuItem]
                      : []),
                    { id: 'sep-view', label: '', type: 'separator', onSelect: () => {} },
                  ] satisfies MenuItem[])
                : []),
              ...(note.isDeleted
                ? buildNoteMenu(note, { surface }).filter(
                    (item) => item.id !== 'restore' && item.id !== 'delete-forever',
                  )
                : buildNoteMenu(note, { surface }).filter((item) => item.id !== 'favorite' && item.id !== 'share')),
            ]}
            trigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label="More options"
                className="grid size-9 place-items-center rounded-control text-muted transition-colors hover:bg-raise hover:text-ink [@media(pointer:coarse)]:size-11"
              >
                <MoreHorizontal size={HEADER_ICON_SIZE} />
              </button>
            )}
          />
        </div>
      </header>

      {/* Banners */}
      {note.isDeleted && (
        <div className="mx-6 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-lineSoft bg-panel px-3.5 py-2.5">
          <Trash2 size={14} className="text-muted" aria-hidden="true" />
          <p className="text-[13px] text-muted">
            This note is in the trash and is read-only.
          </p>
          <div className="ml-auto flex gap-2">
            <Button
              size="sm"
              variant="subtle"
              onClick={() => {
                restoreNote(note.id)
                toast.success('Note restored')
              }}
            >
              <RotateCcw size={12} />
              Restore
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-danger hover:text-danger"
              onClick={() =>
                confirmAction({
                  title: 'Delete forever?',
                  message: `“${note.title.trim() || 'Untitled'}” will be permanently deleted.`,
                  confirmLabel: 'Delete forever',
                  onConfirm: () => {
                    void deleteForeverAndPrune([note.id]).then((ok) => {
                      if (ok) toast.success('Note deleted forever')
                    })
                  },
                })
              }
            >
              Delete forever
            </Button>
          </div>
        </div>
      )}

      {/* Page navigation */}
      {!note.isDeleted && pages.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-1 gap-y-1 border-b border-lineSoft bg-panel/60 px-3 py-1.5 md:px-4">
          <div className="flex items-center rounded-control border border-lineSoft bg-panel" role="group" aria-label="Page">
            <button
              type="button"
              aria-label="Previous page"
              disabled={current <= 0}
              onClick={() => goToPage(current - 1)}
              className={PAGE_BTN}
            >
              <ChevronLeft size={15} />
            </button>
            <span className="px-1.5 text-xs font-medium tabular-nums whitespace-nowrap text-muted">
              <span aria-hidden="true">
                {current + 1} / {pages.length}
              </span>
              <span className="sr-only">
                Page {current + 1} of {pages.length}
              </span>
            </span>
            <button
              type="button"
              aria-label="Next page"
              disabled={current >= pages.length - 1}
              onClick={() => goToPage(current + 1)}
              className={PAGE_BTN}
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-pressed={showStrip}
            onClick={() => setShowStrip((v) => !v)}
            className={cn(showStrip && 'bg-selected text-ink')}
          >
            <GalleryHorizontal size={15} aria-hidden="true" />
            Pages
          </Button>
          <div className="ml-auto flex flex-wrap items-center justify-end gap-x-1 gap-y-1">
            {zoomLevel > 1 && (
              <Button
                size="sm"
                variant="ghost"
                aria-label="Reset zoom"
                className="tabular-nums md:hidden"
                onClick={() => zoomRef.current?.reset()}
              >
                Fit
              </Button>
            )}
            <div className="hidden items-center rounded-control border border-lineSoft bg-panel md:flex" role="group" aria-label="Zoom">
              <button
                type="button"
                aria-label="Zoom out"
                disabled={zoomLevel <= 1}
                onClick={() => zoomRef.current?.zoomBy(1 / 1.25)}
                className={PAGE_BTN}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                aria-label="Fit page to width"
                className="h-8 w-12 text-xs font-medium tabular-nums text-muted transition-colors hover:text-ink disabled:hover:text-muted [@media(pointer:coarse)]:h-10"
                disabled={zoomLevel <= 1}
                onClick={() => zoomRef.current?.reset()}
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                type="button"
                aria-label="Zoom in"
                disabled={zoomLevel >= 4}
                onClick={() => zoomRef.current?.zoomBy(1.25)}
                className={PAGE_BTN}
              >
                <Plus size={14} />
              </button>
            </div>
            <DropdownMenu
              align="end"
              items={[
                ...(['blank', 'ruled', 'grid'] as const).map<MenuItem>((t) => ({
                  id: `template-${t}`,
                  label: `Template: ${templateLabel(t)}`,
                  checked: activePage.template === t,
                  onSelect: () => setTemplate(note.id, activePage.id, t),
                })),
                { id: 'sep1', label: '', type: 'separator', onSelect: () => {} },
                { id: 'insert-before', label: 'Insert page before', onSelect: () => insertPage(current) },
                { id: 'insert-after', label: 'Insert page after', onSelect: () => insertPage(current + 1) },
                {
                  id: 'move-page-earlier',
                  label: 'Move page earlier',
                  disabled: current <= 0,
                  onSelect: () => {
                    movePage(note.id, activePage.id, current - 1)
                    goToPage(current - 1)
                  },
                },
                {
                  id: 'move-page-later',
                  label: 'Move page later',
                  disabled: current >= pages.length - 1,
                  onSelect: () => {
                    movePage(note.id, activePage.id, current + 1)
                    goToPage(current + 1)
                  },
                },
                {
                  id: 'duplicate-page',
                  label: 'Duplicate page',
                  onSelect: () => {
                    const copy = duplicatePage(note.id, activePage.id)
                    if (copy) goToPage(copy.index)
                  },
                },
                {
                  id: 'delete-page',
                  label: 'Delete page',
                  disabled: pages.length <= 1,
                  onSelect: () => deletePage(note.id, activePage.id),
                },
              ]}
              trigger={(triggerProps) => (
                <Button size="sm" variant="ghost" {...triggerProps}>
                  {templateLabel(activePage.template)} <ChevronDown size={12} />
                </Button>
              )}
            />
            <Button size="sm" variant="subtle" onClick={() => insertPage(pages.length)}>
              <Plus size={14} />
              <span className="hidden sm:inline">Add page</span>
              <span className="sr-only sm:hidden">Add page</span>
            </Button>
          </div>
        </div>
      )}
      <RecordingsPanel ref={recordingsRef} noteId={note.id} open={recordingsOpen} readOnly={note.isDeleted} />
      {!note.isDeleted && showStrip && pages.length > 0 && (
        <PageStrip noteId={note.id} pages={pages} activeIndex={current} onSelect={goToPage} />
      )}

      {/* Scrollable document: every page, one under the other */}
      <div
        ref={scrollRef}
        // No horizontal padding, in any mode: ink scales with the column's width,
        // so the column must be exactly as wide in Type and Write (and as before).
        className="editor-scroll min-h-0 flex-1 overflow-y-auto bg-panel md:bg-canvas md:py-6"
        onScroll={onScroll}
        onClick={(e) => {
          // tiptap renders links inert (openOnClick:false) — give them a way
          // out of the app. Under Tauri the opener plugin handles it; on the
          // web we fall back to a plain new tab.
          const anchor = (e.target as HTMLElement).closest?.('a[href]')
          if (!anchor) return
          e.preventDefault()
          const href = anchor.getAttribute('href') ?? ''
          if (!/^(https?:|mailto:)/i.test(href)) return
          if ('__TAURI_INTERNALS__' in window) {
            void import('@tauri-apps/plugin-opener').then((m) => m.openUrl(href))
          } else {
            window.open(href, '_blank', 'noopener,noreferrer')
          }
        }}
      >
        <ZoomColumn
          ref={zoomRef}
          scrollRef={scrollRef}
          maxWidth={720}
          onZoomChange={setZoomLevel}
          className="page-stack relative mx-auto w-full max-w-[720px] pb-24"
          style={
            {
              '--editor-font-size': `${fontSize}px`,
              '--editor-line-height': lineHeight,
            } as CSSProperties
          }
        >
          {pages.map((pg, i) => (
            <Fragment key={pg.id}>
              <PageSheet
                noteId={note.id}
                page={pg}
                index={i}
                near={Math.abs(i - current) <= NEAR_PAGES}
                current={i === current}
                readOnly={note.isDeleted}
                penMode={penMode}
                readingLayout={readingLayout}
                syncKey={syncKey}
                ink={inkDocs[pg.id] ?? null}
                wet={pg.id === wetPageId}
                inkPrefs={inkLayerPrefs}
                recording={recordingHere}
                head={i === 0 ? titleBlock : undefined}
                slotRef={slotRef}
                onText={handleText}
                onLeave={handleLeave}
                onInk={handleInk}
                onInkHandle={handleInkHandle}
                onEngage={setEngagedPageId}
                onSelection={handleSelection}
                onPalette={handlePaletteRequest}
                onStrokeTap={handleStrokeTap}
              />
              {note.isDeleted ? (
                <div className="h-6" />
              ) : (
                <div className="flex h-12 items-center gap-3 px-6 md:h-14">
                  <span className="h-px flex-1 bg-lineSoft md:bg-transparent" />
                  <Tooltip label={i === pages.length - 1 ? 'Add page' : 'Insert page'}>
                    <button
                      type="button"
                      onClick={() => insertPage(i + 1)}
                      aria-label={i === pages.length - 1 ? 'Add a page at the end' : `Insert a page after page ${i + 1}`}
                      className="grid size-8 place-items-center rounded-full border border-dashed border-line text-faint transition-colors hover:border-ink hover:text-ink [@media(pointer:coarse)]:size-10"
                    >
                      <Plus size={15} />
                    </button>
                  </Tooltip>
                  <span className="h-px flex-1 bg-lineSoft md:bg-transparent" />
                </div>
              )}
            </Fragment>
          ))}
        </ZoomColumn>
      </div>

      {/* Pen dock: floats on the page's outer edge, never scrolls away */}
      {penMode && !note.isDeleted && !readingLayout && (
        <div
          className={cn(
            // Tablet and up: a column on the page's outer edge (clear of the text inset).
            // Phone: a row along the bottom, so it never covers the writing column.
            'pointer-events-none absolute z-40 flex',
            'inset-x-2 bottom-3 justify-center',
            'md:inset-x-auto md:bottom-6 md:top-[112px] md:items-center',
            leftHanded ? 'md:left-2' : 'md:right-2',
          )}
        >
          <div className="pointer-events-auto max-w-full overflow-x-auto no-scrollbar md:max-h-full md:overflow-y-auto">
            <PenBar
              tool={penTool}
              color={inkPrefs.color}
              presetLabel={INK_PRESETS[inkPrefs.preset].label}
              canUndo={inkHistory.canUndo}
              canRedo={inkHistory.canRedo}
              onUndo={() => stepInkHistory('undo')}
              onRedo={() => stepInkHistory('redo')}
              onClear={clearPageInk}
              onTool={(t) => updatePenPrefs({ tool: t })}
              onOpenPalette={(anchor) => setPenPalette({ open: true, anchor, mode: 'trigger' })}
              selectionCount={selectionCount}
              onDeleteSelection={() => selectedLayer()?.deleteSelection()}
              onRecolorSelection={() => selectedLayer()?.recolorSelection(inkPrefs.color)}
              onDuplicateSelection={() => selectedLayer()?.duplicateSelection()}
              onEntrySelection={() => setEntryDialog(true)}
            />
          </div>
        </div>
      )}

      {entryDialog && (
        <InkEntryDialog
          onClose={() => setEntryDialog(false)}
          onSave={(line) => {
            const pageId = selectionRef.current?.pageId
            const day = pages.find((p) => p.id === pageId)?.day ?? dayKey(Date.now())
            selectedLayer()?.addEntry(line, day)
            setEntryDialog(false)
          }}
        />
      )}

      {/* Radial pen palette — hoisted once (portal) so right-click and
          pill-click both share the same open/close lifecycle. */}
      <PenPalette
        open={penPalette?.open ?? false}
        anchor={penPalette?.anchor ?? { x: 0, y: 0 }}
        anchorMode={penPalette?.mode}
        prefs={{
          tool: penTool,
          color: inkPrefs.color,
          sizeIdx: inkPrefs.sizeIdx,
          eraserMode: inkPrefs.eraserMode,
          preset: inkPrefs.preset,
          pencil: inkPrefs.pencil,
        }}
        onPrefs={updatePenPrefs}
        canUndo={inkHistory.canUndo}
        canRedo={inkHistory.canRedo}
        onUndo={() => stepInkHistory('undo')}
        onRedo={() => stepInkHistory('redo')}
        onClear={clearPageInk}
        onClose={() => setPenPalette(null)}
      />
    </div>
  )
}

/* ------------------------------ Small pieces ------------------------------ */

function SaveStatusChip({
  status,
  autosave,
}: {
  status: SaveStatus
  autosave: boolean
}): React.ReactNode {
  let icon: React.ReactNode = <Check size={12} className="text-ballpoint" />
  let label = 'Saved'
  let cls = 'text-faint'

  if (status === 'saving' || (status === 'dirty' && autosave)) {
    icon = <LoaderCircle size={12} className="animate-spin text-accent" />
    label = 'Saving…'
    cls = 'text-accent'
  } else if (status === 'dirty') {
    icon = <Hash size={12} className="text-accent" />
    label = 'Unsaved'
    cls = 'text-accent'
  }

  return (
    <span
      aria-live="polite"
      className={cn('ml-1 inline-flex items-center gap-1.5 text-xs transition-opacity duration-200 sm:ml-2', cls)}
    >
      {icon}
      {/* icon alone on phones: the header has no room for the word */}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </span>
  )
}

const HEADER_ICON_SIZE = 18
const HEADER_ICON_CONTAINER = 'grid place-items-center'
const PAGE_BTN =
  'grid size-8 place-items-center text-muted transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-30 [@media(pointer:coarse)]:size-10'

function HeaderToggle({
  label,
  active,
  onClick,
  children,
  tone = 'accent',
}: {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
  tone?: 'accent' | 'gold'
}): React.ReactNode {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        className={cn(
          'grid size-9 place-items-center rounded-control transition-[background-color,border-color,color,transform] duration-100 active:scale-95 [@media(pointer:coarse)]:size-11',
          active
            ? tone === 'gold'
              ? 'bg-gold-soft text-gold-ink'
              : 'bg-selected text-selected-ink'
            : 'text-muted hover:bg-raise hover:text-ink',
        )}
      >
        <span className={HEADER_ICON_CONTAINER} aria-hidden="true">
          {children}
        </span>
      </button>
    </Tooltip>
  )
}
