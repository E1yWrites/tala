import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { Extension, InputRule } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import ImageExtension from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Folder as FolderIcon,
  Hash,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PenTool,
  Mic,
  Pin,
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
import type { InkDoc, InkPointerMode } from '@/types/ink'
import { INK_PRESETS } from '@/types/ink'
import { cn } from '@/utils/cn'
import { formatFull, formatRelative } from '@/utils/dates'
import { processImageFile } from '@/utils/image'
import { FavoriteStar } from '../UI/FavoriteStar'
import { TagChip } from '../UI/TagChip'
import { Tooltip } from '../UI/Tooltip'
import { DropdownMenu, type MenuItem } from '../UI/DropdownMenu'
import { Button } from '../UI/Button'
import { EditorToolbar } from './EditorToolbar'
import { ReadingView } from './ReadingView'
import { InkLayer } from './ink/InkLayer'
import type { InkLayerHandle } from './ink/InkLayer'
import { PenBar } from './ink/PenBar'
import { PageBackground } from './PageBackground'
import { ZoomColumn } from '@/canvas/ZoomColumn'
import { PageStrip } from '@/canvas/PageStrip'
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

/* ------------------------- Markdown-style shortcuts ------------------------ */

/** `[ ] ` / `[x] ` at the start of a line creates a checklist item. */
const TaskSyntaxInput = Extension.create({
  name: 'taskSyntaxInput',
  addInputRules() {
    return [
      new InputRule({
        find: /^\[([ xX])\]\s$/,
        handler: ({ chain, range, match }) => {
          const checked = match[1]?.toLowerCase() === 'x'
          chain()
            .deleteRange(range)
            .toggleTaskList()
            .updateAttributes('taskItem', { checked })
            .run()
        },
      }),
    ]
  },
})

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
  /** Typed text of the page that was being edited. */
  page?: { id: string; doc: JSONContent }
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
  const [activePageIndex, setActivePageIndex] = useState(0)
  const activePage = pages[activePageIndex] ?? pages[0]
  const activePageId = activePage?.id ?? noteId
  /** PDF-imported page: its sheet is the page, no typed content. */
  const isBgPage = !!(activePage?.pdfPage || activePage?.backgroundBlobId)

  // Open on page 1, or on the page Tasks pointed at
  useEffect(() => {
    const ui = useUIStore.getState()
    const target = ui.pendingPageId ? pages.findIndex((p) => p.id === ui.pendingPageId) : -1
    setActivePageIndex(Math.max(0, target))
    if (ui.pendingPageId) ui.clearPendingPage()
  }, [noteId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDuplicatePage = useCallback(() => {
    if (!activePage || !note) return
    const copy = duplicatePage(note.id, activePage.id)
    if (copy) setActivePageIndex(copy.index)
  }, [activePage, note])

  /* --------------------------------- Pen mode ------------------------------ */

  const inkPrefs = usePrefsStore((s) => s.inkPrefs)
  const setInkPrefs = usePrefsStore((s) => s.setInkPrefs)
  const [penMode, setPenMode] = useState(false)
  // Bituin's corner chip only when no list pane sits beside the editor
  const isPhone = useMediaQuery(BREAKPOINTS.mobile)
  // Writing comes first: while pen mode is on, the stylesheet freezes every Bituin animation
  useEffect(() => {
    document.documentElement.toggleAttribute('data-pen', penMode)
    return () => document.documentElement.removeAttribute('data-pen')
  }, [penMode])
  const [penTool, setPenTool] = useState<InkPointerMode>(inkPrefs.tool)
  const [inkHistory, setInkHistory] = useState({ canUndo: false, canRedo: false })
  /** Radial palette state — null = closed; cursor mode when opened by right-click. */
  const [penPalette, setPenPalette] = useState<PenPaletteState | null>(null)
  /** Count of selected ink strokes — drives the contextual delete button in PenBar. */
  const [selectionCount, setSelectionCount] = useState(0)
  const inkLayerRef = useRef<InkLayerHandle>(null)
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

  /** Ink commits hit the store instantly; IndexedDB write is debounced in
   *  the store and force-flushed when this editor unmounts or the note swaps. */
  const handleInkChange = useCallback(
    (doc: InkDoc) => {
      if (!note) return
      saveInk(note.id, activePageId, doc)
      noteWriting()
    },
    [activePageId, note],
  )

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

  const inkDocs = useNoteStore((s) => s.inkDocs)

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

  /** Only fires when the undo/redo availability actually flips. */
  const handleInkHistory = useCallback((canUndo: boolean, canRedo: boolean) => {
    setInkHistory((prev) =>
      prev.canUndo === canUndo && prev.canRedo === canRedo ? prev : { canUndo, canRedo },
    )
  }, [])

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

  // Escape exits pen mode — but never steals Esc from modals or the drawer
  useEffect(() => {
    if (!penMode) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return
      const ui = useUIStore.getState()
      if (ui.modalStack.length > 0 || ui.sidebarDrawerOpen) return
      setPenMode(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [penMode])

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
        inkLayerRef.current?.undo()
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
  }, [updatePenPrefs])

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
    if (patch.page) saves.push(savePageContent(id, patch.page.id, patch.page.doc))
    const results = await Promise.all(saves)
    // Brief pause so the "Saving…" state is perceivable on fast devices
    await new Promise((r) => setTimeout(r, 150))
    if (results.includes('failed')) {
      // The library rolled back and told the user; keep the edit so the next save retries it
      pendingRef.current = { ...patch, ...pendingRef.current }
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

  // Leaving a page: land its edits before the editor is recreated for the next one
  useEffect(() => {
    return () => {
      void flushRef.current({ silent: true })
    }
  }, [activePageId])

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

  /* -------------------------------- Editor -------------------------------- */

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: { openOnClick: false, autolink: true },
        }),
        Underline,
        TaskList,
        TaskItem.configure({ nested: true }),
        ImageExtension,
        TaskSyntaxInput,
        Placeholder.configure({
          placeholder:
            'Start writing…   "# " heading · "- " list · "[ ] " task · "> " quote · "```" code',
        }),
      ],
      content: activePage?.content ?? '',
      editable: !note?.isDeleted,
      autofocus: false,
      onUpdate: ({ editor: ed }) => {
        pendingRef.current.page = { id: activePageId, doc: ed.getJSON() }
        markDirty()
        noteWriting()
      },
    },
    // One editor per page: switching pages recreates it with that page's text
    [noteId, activePageId, syncKey],
  )

  /* `editable` only applies at editor creation — keep it in sync afterwards
     (restore from trash must re-enable typing; trashing while open must lock). */
  useEffect(() => {
    // emitUpdate=false: setEditable fires `update` by default, which made merely
    // opening a note autosave it (bumping updatedAt and wiping a PDF page's text layer)
    editor?.setEditable(!note?.isDeleted, false)
  }, [editor, note?.isDeleted])

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

  const insertImages = async (files: File[]): Promise<void> => {
    if (!editor) return
    for (const file of files.slice(0, 4)) {
      try {
        const src = await processImageFile(file)
        editor.chain().focus().setImage({ src }).run()
      } catch (err) {
        console.warn('[tala] image skipped', file.name, err)
        toast.error(`Could not add ${file.name}`)
      }
    }
  }

  const onPasteOrDrop = (e: React.ClipboardEvent | React.DragEvent): void => {
    const dt =
      'clipboardData' in e
        ? (e as React.ClipboardEvent).clipboardData
        : (e as React.DragEvent).dataTransfer
    const files = Array.from(dt?.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0) return
    e.preventDefault()
    void insertImages(files)
  }

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

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas animate-editor-in">
      {(isPhone || focusMode) && !note.isDeleted && <BituinNudge placement="corner" />}
      {/* Toolbar row */}
      <header className="flex items-center gap-1 border-b border-lineSoft px-3 py-2">
        <Tooltip label="Back" side="bottom">
          <button
            type="button"
            onClick={() => selectNote(null)}
            aria-label="Back to list"
            className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-raise hover:text-ink [@media(pointer:coarse)]:size-11"
          >
            <ArrowLeft size={18} strokeWidth={2.5} />
          </button>
        </Tooltip>

        <SaveStatusChip status={status} autosave={autosaveEnabled} />

        {isBgPage && (
          <span className="ml-1 max-w-[220px] truncate font-display text-lg leading-tight text-ink">
            {note.title.trim() || note.title || 'Untitled'}
          </span>
        )}

        <div className="ml-auto flex items-center gap-0.5">
          {!note.isDeleted && (
            <HeaderToggle
              label={note.isPinned ? 'Unpin' : 'Pin'}
              active={note.isPinned}
              onClick={() => patchNote(note.id, { isPinned: !note.isPinned })}
            >
              <Pin size={HEADER_ICON_SIZE} className={cn(note.isPinned && 'rotate-45')} />
            </HeaderToggle>
          )}
          {!note.isDeleted && (
            <HeaderToggle
              label={note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              active={note.isFavorite}
              tone="gold"
              onClick={() =>
                patchNote(note.id, { isFavorite: !note.isFavorite })
              }
            >
              {note.isFavorite ? (
                <FavoriteStar size={HEADER_ICON_SIZE} />
              ) : (
                <Star size={HEADER_ICON_SIZE} />
              )}
            </HeaderToggle>
          )}
          <HeaderToggle
            label="Share & export"
            active={false}
            onClick={() => openModal({ kind: 'share', noteId: note.id })}
          >
            <Share2 size={HEADER_ICON_SIZE} />
          </HeaderToggle>
          {!note.isDeleted && (
            <HeaderToggle
              label={recordingHere ? 'Lecture audio (recording)' : 'Lecture audio'}
              active={recordingsOpen || recordingHere}
              onClick={() => setRecordingsOpen((o) => !o)}
            >
              <span className="relative grid place-items-center">
                <Mic size={HEADER_ICON_SIZE} />
                {recordingHere && (
                  <span aria-hidden="true" className="absolute -right-1 -top-1 size-2 animate-pulse rounded-full bg-danger" />
                )}
              </span>
            </HeaderToggle>
          )}
          {!note.isDeleted && !readingLayout && (
            <HeaderToggle
              label={penMode ? 'Exit pen mode' : 'Pen mode'}
              active={penMode}
              onClick={() => setPenMode((m) => !m)}
            >
              <PenTool size={HEADER_ICON_SIZE} />
            </HeaderToggle>
          )}
          {!note.isDeleted && (
            <HeaderToggle
              label={readingLayout ? 'Back to editing' : 'Reading layout'}
              active={readingLayout}
              onClick={() => {
                // Flush pending edits so the reading view shows current content
                void flushRef.current({ silent: true })
                toggleReadingLayout()
              }}
            >
              <BookOpen size={HEADER_ICON_SIZE} />
            </HeaderToggle>
          )}
          {!focusMode ? (
            <span className="hidden md:block">
              <HeaderToggle label="Distraction-free mode" active={focusMode} onClick={toggleFocusMode}>
                <Maximize2 size={HEADER_ICON_SIZE} />
              </HeaderToggle>
            </span>
          ) : (
            <span>
              <HeaderToggle label="Exit distraction-free mode" active onClick={toggleFocusMode}>
                <Minimize2 size={HEADER_ICON_SIZE} />
              </HeaderToggle>
            </span>
          )}
          <DropdownMenu
            items={
              note.isDeleted
                ? buildNoteMenu(note, { surface }).filter(
                    (item) => item.id !== 'restore' && item.id !== 'delete-forever',
                  )
                : buildNoteMenu(note, { surface })
            }
            trigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label="More options"
                className="grid size-8 place-items-center rounded-control text-muted transition-colors hover:bg-raise hover:text-ink"
              >
                <ChevronDown size={18} strokeWidth={2.5} />
              </button>
            )}
          />
        </div>
      </header>

      {/* Banners */}
      {note.isDeleted && (
        <div className="mx-6 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border border-accent/50 bg-accent/[0.06] px-3.5 py-2.5">
          <Trash2 size={14} className="text-accent" aria-hidden="true" />
          <p className="text-xs text-accent">
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
              className="text-accent"
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
        <div className="mx-6 mt-3 flex items-center gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            aria-label="Previous page"
            disabled={activePageIndex <= 0}
            onClick={() => setActivePageIndex((i) => Math.max(0, i - 1))}
          >
            <ChevronLeft size={14} />
          </Button>
          <div className="text-center text-xs tabular-nums whitespace-nowrap text-faint md:w-32">
            Page {activePageIndex + 1} of {pages.length}
          </div>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Next page"
            disabled={activePageIndex >= pages.length - 1}
            onClick={() => setActivePageIndex((i) => Math.min(pages.length - 1, i + 1))}
          >
            <ChevronRight size={14} />
          </Button>
          <div className="ml-auto flex items-center gap-1.5">
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
            <div className="hidden items-center md:flex" role="group" aria-label="Zoom">
              <Button
                size="sm"
                variant="ghost"
                aria-label="Zoom out"
                disabled={zoomLevel <= 1}
                onClick={() => zoomRef.current?.zoomBy(1 / 1.25)}
              >
                −
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Fit page to width"
                className="w-12 tabular-nums"
                disabled={zoomLevel <= 1}
                onClick={() => zoomRef.current?.reset()}
              >
                {Math.round(zoomLevel * 100)}%
              </Button>
              <Button
                size="sm"
                variant="ghost"
                aria-label="Zoom in"
                disabled={zoomLevel >= 4}
                onClick={() => zoomRef.current?.zoomBy(1.25)}
              >
                +
              </Button>
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
                {
                  id: 'add-page',
                  label: 'Add page',
                  onSelect: () => {
                    addPage(note.id)
                    setActivePageIndex(pages.length)
                  },
                },
                {
                  id: 'move-page-earlier',
                  label: 'Move page earlier',
                  disabled: activePageIndex <= 0,
                  onSelect: () => {
                    movePage(note.id, activePage.id, activePageIndex - 1)
                    setActivePageIndex(activePageIndex - 1)
                  },
                },
                {
                  id: 'move-page-later',
                  label: 'Move page later',
                  disabled: activePageIndex >= pages.length - 1,
                  onSelect: () => {
                    movePage(note.id, activePage.id, activePageIndex + 1)
                    setActivePageIndex(activePageIndex + 1)
                  },
                },
                {
                  id: 'duplicate-page',
                  label: 'Duplicate page',
                  onSelect: onDuplicatePage,
                },
                {
                  id: 'delete-page',
                  label: 'Delete page',
                  disabled: pages.length <= 1,
                  onSelect: () => {
                    if (pages.length <= 1) return
                    deletePage(note.id, activePage.id)
                    setActivePageIndex((i) => Math.max(0, i - 1))
                  },
                },
              ]}
              trigger={(triggerProps) => (
                <Button size="sm" variant="ghost" {...triggerProps}>
                  {templateLabel(activePage.template)} <ChevronDown size={12} />
                </Button>
              )}
            />
            <Button
              size="sm"
              variant="ghost"
              aria-pressed={showStrip}
              onClick={() => setShowStrip((v) => !v)}
            >
              Pages
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                addPage(note.id)
                setActivePageIndex(pages.length)
              }}
            >
              <Plus size={14} />
              <span className="hidden sm:inline">Add page</span>
              <span className="sr-only sm:hidden">Add page</span>
            </Button>
          </div>
        </div>
      )}
      <RecordingsPanel ref={recordingsRef} noteId={note.id} open={recordingsOpen} readOnly={note.isDeleted} />
      {!note.isDeleted && showStrip && pages.length > 0 && (
        <PageStrip
          noteId={note.id}
          pages={pages}
          activeIndex={activePageIndex}
          onSelect={setActivePageIndex}
        />
      )}

      {/* Scrollable document */}
      <div
        ref={scrollRef}
        className="editor-scroll min-h-0 flex-1 overflow-y-auto"
        data-template={activePage?.template ?? 'blank'}
        style={{ '--editor-template-rule': `${28 * zoomLevel}px` } as CSSProperties}
        onPaste={onPasteOrDrop}
        onDrop={onPasteOrDrop}
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
          className={cn(
            'relative mx-auto w-full max-w-[720px] px-6 pb-24 md:px-10',
            !isBgPage && 'pt-6',
          )}
          style={
            {
              '--editor-font-size': `${fontSize}px`,
              '--editor-line-height': lineHeight,
            } as CSSProperties
          }
        >
          {isBgPage && activePage ? (
            <>
              {/* PDF page rendered as the page background */}
              <PageBackground
                noteId={note.id}
                page={activePage}
                label={`Page ${activePageIndex + 1} of PDF`}
              />
              {penMode && !note.isDeleted && (
                <div className="mt-3">
                  <PenBar
                    tool={penTool}
                    color={inkPrefs.color}
                    presetLabel={INK_PRESETS[inkPrefs.preset].label}
                    canUndo={inkHistory.canUndo}
                    canRedo={inkHistory.canRedo}
                    onUndo={() => inkLayerRef.current?.undo()}
                    onRedo={() => inkLayerRef.current?.redo()}
                    onClear={() => {
                      inkLayerRef.current?.clearAll()
                      toast.success('Handwriting cleared')
                    }}
                    onOpenPalette={(anchor) => setPenPalette({ open: true, anchor, mode: 'trigger' })}
                    selectionCount={selectionCount}
                    onDeleteSelection={() => inkLayerRef.current?.deleteSelection()}
                    onRecolorSelection={() => inkLayerRef.current?.recolorSelection(inkPrefs.color)}
                    onDuplicateSelection={() => inkLayerRef.current?.duplicateSelection()}
                  />
                </div>
              )}
            </>
          ) : (
            <>
          {/* Meta row */}
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
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
                    className="inline-flex h-6 items-center gap-1 rounded-control border border-transparent px-1.5 text-xs text-faint transition-colors hover:border-ballpoint/40 hover:bg-ballpoint-soft/50 hover:text-ballpoint"
                  >
                    <FolderIcon size={11} aria-hidden="true" />
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
                    className="grid size-[19px] place-items-center rounded-control border border-lineSoft text-faint transition-colors hover:border-accent hover:text-accent"
                  >
                    <Plus size={11} />
                  </button>
                </Tooltip>
              </span>
            )}
          </div>

          {/* Title — the marker-written heading */}
          <input
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor?.commands.focus('start')
              }
            }}
            placeholder="Enter note title…"
            aria-label="Note title"
            disabled={note.isDeleted}
            className="w-full bg-transparent font-display text-[30px] leading-tight placeholder:text-faint/70 disabled:cursor-default"
          />

          {/* Toolbar row — swaps to the writing (pen) control while pen mode is on */}
          {editor && !note.isDeleted && !readingLayout && (
            <div className="sticky top-0 z-40 -mx-1 mt-4 mb-4 bg-gradient-to-b from-canvas via-canvas to-transparent pb-2 pt-1">
              {penMode ? (
                <PenBar
                  tool={penTool}
                  color={inkPrefs.color}
                  presetLabel={INK_PRESETS[inkPrefs.preset].label}
                  canUndo={inkHistory.canUndo}
                  canRedo={inkHistory.canRedo}
                  onUndo={() => inkLayerRef.current?.undo()}
                  onRedo={() => inkLayerRef.current?.redo()}
                  onClear={() => {
                    inkLayerRef.current?.clearAll()
                    toast.success('Handwriting cleared')
                  }}
                  onOpenPalette={(anchor) =>
                    setPenPalette({ open: true, anchor, mode: 'trigger' })
                  }
                  selectionCount={selectionCount}
                  onDeleteSelection={() => inkLayerRef.current?.deleteSelection()}
                  onRecolorSelection={() => inkLayerRef.current?.recolorSelection(inkPrefs.color)}
                  onDuplicateSelection={() => inkLayerRef.current?.duplicateSelection()}
                />
              ) : (
                <EditorToolbar editor={editor} />
              )}
            </div>
          )}

          {/* Content — editor stays mounted (hidden) so state/undo survive the toggle */}
          {readingLayout ? (
            <ReadingView noteId={note.id} doc={activePage?.content ?? null} />
          ) : (
            <EditorContent
              editor={editor}
              className={cn('[&_.tiptap]:min-h-[45vh]', note.isDeleted && 'opacity-80')}
            />
          )}
            </>
          )}

          {/* Handwriting overlay — above the typed content, active only in pen mode */}
          {!readingLayout && !note.isDeleted && (
            <InkLayer
              key={activePageId}
              ref={inkLayerRef}
              ink={inkDocs[activePageId] ?? null}
              historyKey={activePageId}
              onChange={handleInkChange}
              active={penMode}
              prefs={inkLayerPrefs}
              onHistoryChange={handleInkHistory}
              onSelectionChange={setSelectionCount}
              onPaletteRequest={handlePaletteRequest}
              onToolShortcut={handleToolShortcut}
              recording={recordingHere}
              onStrokeTap={(ts) => {
                void recordingsRef.current?.seekToTime(ts).then((ok) => ok && setRecordingsOpen(true))
              }}
            />
          )}
        </ZoomColumn>
      </div>

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
        onUndo={() => inkLayerRef.current?.undo()}
        onRedo={() => inkLayerRef.current?.redo()}
        onClear={() => {
          inkLayerRef.current?.clearAll()
          toast.success('Handwriting cleared')
        }}
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

const HEADER_ICON_SIZE = 22
const HEADER_ICON_CONTAINER = 'grid size-10 place-items-center'

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
          'grid size-10 place-items-center rounded-control transition-[background-color,border-color,color,transform] duration-100 active:scale-95 [@media(pointer:coarse)]:size-11',
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
