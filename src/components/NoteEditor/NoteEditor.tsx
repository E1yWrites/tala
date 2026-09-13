import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { buildEditorExtensions } from '@/lib/editorExtensions'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Folder as FolderIcon,
  Hash,
  LoaderCircle,
  Plus,
  RotateCcw,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'

import { isEmptyNote, useNoteStore } from '@/store/noteStore'
import { useFolderStore } from '@/store/folderStore'
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import type { Note } from '@/types/models'
import type { InkDoc, InkPointerMode, InkStroke } from '@/types/ink'
import { INK_PRESETS, sizesForTool } from '@/types/ink'
import { cn } from '@/utils/cn'
import { formatFull, formatRelative } from '@/utils/dates'
import { processImageFile } from '@/utils/image'
import { useMediaQuery, BREAKPOINTS } from '@/hooks/useMediaQuery'
import { useElementWidth } from '@/hooks/useElementWidth'
import { TOGGLE_DRAW_EVENT } from '@/hooks/useHotkeys'
import { onPencilGesture, type PencilAction } from '@/lib/pencil'
import { TagChip } from '../UI/TagChip'
import { Tooltip } from '../UI/Tooltip'
import { DropdownMenu, type MenuItem } from '../UI/DropdownMenu'
import { Button } from '../UI/Button'
import type { PopoverAnchor } from '../UI/Popover'
import { ReadingView } from './ReadingView'
import { InkLayer } from './ink/InkLayer'
import type { InkLayerHandle } from './ink/InkLayer'
import { PenPopover, patchForTool, type PenPrefs, type PenPrefsPatch } from './ink/PenPopover'
import { FloatingInkToolbar } from './ink/FloatingInkToolbar'
import { AdaptiveToolbar, type EditorMode, type InkToolbarBundle } from './toolbar/AdaptiveToolbar'
import { DrawControl } from './toolbar/DrawControl'
import { PdfDocumentView } from './document/PdfDocumentView'
import { RenderedDocumentView } from './document/RenderedDocumentView'
import { DocumentBar } from './document/DocumentBar'
import { buildNoteMenu, confirmAction, deleteForeverAndPrune } from '../NoteList/noteActions'

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved'

interface PendingPatch {
  title?: string
  content?: JSONContent | null
}

export function NoteEditor({ noteId }: { noteId: string }): React.ReactNode {
  const note: Note | undefined = useNoteStore((s) => s.notes.find((n) => n.id === noteId))
  const saveContent = useNoteStore((s) => s.saveContent)
  const restoreNote = useNoteStore((s) => s.restoreNote)
  const folders = useFolderStore((s) => s.folders)
  const tags = useTagStore((s) => s.tags)
  const selectNote = useUIStore((s) => s.selectNote)
  const focusMode = useUIStore((s) => s.focusMode)
  const toggleFocusMode = useUIStore((s) => s.toggleFocusMode)
  const readingLayout = useUIStore((s) => s.readingLayout)
  const toggleReadingLayout = useUIStore((s) => s.toggleReadingLayout)
  const openModal = useUIStore((s) => s.openModal)
  const autosaveEnabled = useSettingsStore((s) => s.settings.autosaveEnabled)
  const fontSize = useSettingsStore((s) => s.settings.editorFontSize)
  const lineHeight = useSettingsStore((s) => s.settings.editorLineHeight)

  /* --------------------------------- Pen mode ------------------------------ */

  const inkPrefs = useUIStore((s) => s.inkPrefs)
  const setInkPrefs = useUIStore((s) => s.setInkPrefs)
  const pushInkRecent = useUIStore((s) => s.pushInkRecent)
  const [penMode, setPenMode] = useState(false)
  const [penTool, setPenTool] = useState<InkPointerMode>(inkPrefs.tool)
  const [inkHistory, setInkHistory] = useState({ canUndo: false, canRedo: false })
  const [selectionCount, setSelectionCount] = useState(0)
  const [selectionShapes, setSelectionShapes] = useState(0)
  const handleSelectionChange = useCallback((count: number, shapes = 0) => {
    setSelectionCount(count)
    setSelectionShapes(shapes)
  }, [])
  /** Draw popover — null = closed. Cursor anchors come from right-click on the canvas. */
  const [palette, setPalette] = useState<{ anchor: PopoverAnchor; mode: 'cursor' | 'trigger' } | null>(
    null,
  )
  /** Tool before the last switch — "previous tool" for eraser toggle / stylus gestures. */
  const prevToolRef = useRef<InkPointerMode>('pen')
  const inkLayerRef = useRef<InkLayerHandle>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const drawRef = useRef<HTMLButtonElement | null>(null)
  /** Stable id for cleanup effects that must not re-run per render. */
  const noteIdRef = useRef(noteId)
  noteIdRef.current = noteId

  // Layout: wide panes keep every tool in the header; narrow ones get a slim
  // row beneath it. Touch devices swap the header tools for the floating pill
  // while drawing so nothing sits between the hand and the page.
  const rootWidth = useElementWidth(rootRef)
  const isCoarse = useMediaQuery('(pointer: coarse)')
  const isDesktop = useMediaQuery(BREAKPOINTS.desktop)
  const inlineTools = rootWidth >= 720
  const textDensity = rootWidth >= 900 ? 'full' : 'compact'

  /** Ink commits hit the store instantly; IndexedDB write is debounced in
   *  the store and force-flushed when this editor unmounts or the note swaps. */
  const saveInk = useNoteStore((s) => s.saveInk)
  const flushInk = useNoteStore((s) => s.flushInk)
  const handleInkChange = useCallback(
    (doc: InkDoc) => {
      if (!note) return
      saveInk(note.id, doc)
      markDirty()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note?.id, saveInk],
  )

  // Flush pending ink before the editor lets go of a note (unmount/switch)
  useEffect(() => {
    return () => {
      void flushInk(noteIdRef.current)
    }
  }, [flushInk])

  const inkDocs = useNoteStore((s) => s.inkDocs)
  /** Imported document backing this note, if any (PDF pages / rendered layout / attachment). */
  const docRecord = useNoteStore((s) => (note?.documentId ? s.documents[note.documentId] : undefined))
  const isPdf = docRecord?.kind === 'pdf'
  const isRendered = docRecord?.kind === 'rendered-html'

  /** Stable prefs object — InkLayer's effects depend on its identity. */
  const inkLayerPrefs = useMemo(
    () => ({
      tool: penTool,
      color: inkPrefs.color,
      sizeIdx: inkPrefs.sizeIdx,
      eraserMode: inkPrefs.eraserMode,
      opacity:
        penTool === 'highlighter'
          ? inkPrefs.hlOpacity
          : penTool === 'pencil'
            ? inkPrefs.pencilOpacity
            : undefined,
      pressure: inkPrefs.pencil.pressure,
      tilt: inkPrefs.pencil.tilt,
      hoverPreview: inkPrefs.pencil.hoverPreview,
      touchDraws: inkPrefs.pencil.touchDraws,
      gestures: inkPrefs.gestures,
    }),
    [
      penTool,
      inkPrefs.color,
      inkPrefs.sizeIdx,
      inkPrefs.eraserMode,
      inkPrefs.hlOpacity,
      inkPrefs.pencilOpacity,
      inkPrefs.pencil,
      inkPrefs.gestures,
    ],
  )

  /** Only fires when the undo/redo availability actually flips. */
  const handleInkHistory = useCallback((canUndo: boolean, canRedo: boolean) => {
    setInkHistory((prev) =>
      prev.canUndo === canUndo && prev.canRedo === canRedo ? prev : { canUndo, canRedo },
    )
  }, [])

  const handlePaletteRequest = useCallback((x: number, y: number) => {
    setPalette({ anchor: { x, y }, mode: 'cursor' })
  }, [])

  const togglePalette = useCallback((anchor: HTMLElement) => {
    setPalette((cur) => (cur ? null : { anchor, mode: 'trigger' }))
  }, [])

  const selectTool = useCallback((tool: InkPointerMode) => {
    setPenTool((cur) => {
      if (cur !== tool) prevToolRef.current = cur
      return tool
    })
    if (tool !== 'select') setInkPrefs({ tool })
  }, [setInkPrefs])

  const updatePenPrefs = useCallback(
    (patch: PenPrefsPatch) => {
      if (patch.tool !== undefined) selectTool(patch.tool)
      const { tool: _tool, ...rest } = patch
      if (Object.keys(rest).length > 0) setInkPrefs(rest)
    },
    [selectTool, setInkPrefs],
  )

  /** Remember what was actually written with — feeds the "Recent" row. */
  const handleStrokeCommitted = useCallback(
    (stroke: InkStroke) => {
      const { preset } = useUIStore.getState().inkPrefs
      const spec = INK_PRESETS[preset]
      const sizeIdx = sizesForTool(stroke.tool).indexOf(stroke.size)
      pushInkRecent({
        tool: stroke.tool,
        preset: spec.tool === stroke.tool ? preset : stroke.tool === 'pen' ? 'marker' : stroke.tool,
        color: stroke.color,
        sizeIdx: sizeIdx >= 0 ? sizeIdx : spec.defaultSizeIdx,
        ...(stroke.opacity !== undefined ? { opacity: stroke.opacity } : {}),
      })
    },
    [pushInkRecent],
  )

  const penPrefs: PenPrefs = useMemo(
    () => ({
      tool: penTool,
      color: inkPrefs.color,
      sizeIdx: inkPrefs.sizeIdx,
      eraserMode: inkPrefs.eraserMode,
      preset: inkPrefs.preset,
      hlOpacity: inkPrefs.hlOpacity,
      pencilOpacity: inkPrefs.pencilOpacity,
      recents: inkPrefs.recents,
      pencil: inkPrefs.pencil,
      gestures: inkPrefs.gestures,
    }),
    [penTool, inkPrefs],
  )

  /** Entering draw mode drops text focus so tool hotkeys (1/2/3, E, L…) work at once. */
  const enterDraw = useCallback(() => {
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    setPenMode(true)
  }, [])
  const exitDraw = useCallback(() => {
    setPenMode(false)
    setPalette(null)
  }, [])

  /** Stylus gesture / hotkey actions share one dispatcher. */
  const runPencilAction = useCallback(
    (action: PencilAction) => {
      switch (action) {
        case 'eraser-toggle':
          selectTool(penTool === 'eraser' ? prevToolRef.current : 'eraser')
          break
        case 'previous-tool':
          selectTool(prevToolRef.current)
          break
        case 'palette':
          if (drawRef.current) togglePalette(drawRef.current)
          break
        case 'undo':
          inkLayerRef.current?.undo()
          break
        case 'none':
          break
      }
    },
    [penTool, selectTool, togglePalette],
  )

  // Native stylus gestures (double-tap / squeeze) — only ever fired by a bridge.
  useEffect(() => {
    if (!penMode || note?.isDeleted) return
    return onPencilGesture((kind) => {
      const { pencil } = useUIStore.getState().inkPrefs
      runPencilAction(kind === 'double-tap' ? pencil.doubleTap : pencil.squeeze)
    })
  }, [note?.isDeleted, penMode, runPencilAction])

  // Ctrl/⌘ . toggles drawing from anywhere in the editor
  useEffect(() => {
    if (note?.isDeleted || readingLayout) return
    const onToggle = (): void => {
      if (penMode) exitDraw()
      else enterDraw()
    }
    window.addEventListener(TOGGLE_DRAW_EVENT, onToggle)
    return () => window.removeEventListener(TOGGLE_DRAW_EVENT, onToggle)
  }, [enterDraw, exitDraw, note?.isDeleted, penMode, readingLayout])

  // Drawing hotkeys (outside text fields): 1–3 tools, E eraser, L lasso,
  // [ ] size, Esc leaves pen mode — unless a selection or popover owns Esc.
  useEffect(() => {
    if (!penMode) return
    const onKey = (e: KeyboardEvent): void => {
      const ui = useUIStore.getState()
      if (ui.modalStack.length > 0 || ui.localOverlays > 0 || ui.sidebarDrawerOpen) return
      const t = e.target as HTMLElement | null
      const typing =
        t instanceof HTMLElement &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      if (e.key === 'Escape') {
        if (typing || selectionCount > 0) return
        exitDraw()
        return
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey) return
      const prefs = ui.inkPrefs
      switch (e.key) {
        case '1':
          updatePenPrefs(patchForTool(penPrefs, 'pen'))
          break
        case '2':
          updatePenPrefs(patchForTool(penPrefs, 'pencil'))
          break
        case '3':
          updatePenPrefs(patchForTool(penPrefs, 'highlighter'))
          break
        case 'e':
        case 'E':
          runPencilAction('eraser-toggle')
          break
        case 'l':
        case 'L':
          selectTool(penTool === 'select' ? prevToolRef.current : 'select')
          break
        case '[':
          setInkPrefs({ sizeIdx: Math.max(0, prefs.sizeIdx - 1) })
          break
        case ']':
          setInkPrefs({ sizeIdx: Math.min(sizesForTool(penTool).length - 1, prefs.sizeIdx + 1) })
          break
        default:
          return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [exitDraw, penMode, penPrefs, penTool, runPencilAction, selectTool, selectionCount, setInkPrefs, updatePenPrefs])

  // Leaving pen mode dismisses the popover and any selection with it
  useEffect(() => {
    if (!penMode) {
      setPalette(null)
      inkLayerRef.current?.clearSelection()
    }
  }, [penMode])

  const editorMode: EditorMode = !penMode
    ? 'text'
    : penTool === 'select' && selectionCount > 0
      ? 'select'
      : 'write'

  const inkToolbar: InkToolbarBundle = useMemo(
    () => ({
      state: {
        tool: penTool,
        color: inkPrefs.color,
        paletteOpen: palette !== null,
        canUndo: inkHistory.canUndo,
        canRedo: inkHistory.canRedo,
      },
      actions: {
        onTogglePalette: togglePalette,
        onTool: (tool) => updatePenPrefs(patchForTool(penPrefs, tool)),
        onUndo: () => inkLayerRef.current?.undo(),
        onRedo: () => inkLayerRef.current?.redo(),
      },
      selection: {
        duplicate: () => inkLayerRef.current?.duplicateSelection(),
        copy: () => {
          inkLayerRef.current?.copySelection()
          toast.success('Copied')
        },
        cut: () => inkLayerRef.current?.cutSelection(),
        paste: () => inkLayerRef.current?.paste(),
        rotate: (deg) => inkLayerRef.current?.rotateSelection(deg),
        recolor: (color) => inkLayerRef.current?.recolorSelection(color),
        remove: () => inkLayerRef.current?.deleteSelection(),
        clear: () => inkLayerRef.current?.clearSelection(),
        setStyle: (patch) => inkLayerRef.current?.setShapeStyle(patch),
        resize: (factor) => inkLayerRef.current?.resizeSelection(factor),
        shapes: selectionShapes,
      },
      selectionCount,
    }),
    [inkHistory, inkPrefs.color, palette, penPrefs, penTool, selectionCount, selectionShapes, togglePalette, updatePenPrefs],
  )

  const [title, setTitle] = useState(note?.title ?? '')
  const [syncKey, setSyncKey] = useState(0)
  const [status, setStatus] = useState<SaveStatus>('idle')

  const pendingRef = useRef<PendingPatch>({})
  const timerRef = useRef<number | null>(null)

  /* ------------------------------ Autosave core --------------------------- */

  type FlushResult = 'saved' | 'nothing' | 'dropped'

  const flush = useCallback(
    async (opts?: { silent?: boolean }): Promise<FlushResult> => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const patch = pendingRef.current
      const hadPending = Object.keys(patch).length > 0
      // Read note from the store directly to avoid stale closure — `note` is
      // derived via .find() and would force this callback to be recreated on
      // every store update.
      const currentNote = useNoteStore.getState().notes.find((n) => n.id === noteIdRef.current)
      // A permanently deleted note can never save — discard honestly.
      // A *trashed* note still exists, though: keep edits made before the
      // trash so restoring it brings the user's words back.
      if (!currentNote) {
        pendingRef.current = {}
        setStatus('idle')
        return hadPending ? 'dropped' : 'nothing'
      }
      if (!hadPending) {
        setStatus('idle')
        return 'nothing'
      }
      pendingRef.current = {}
      const hadRealContent = (() => {
        // Peek at what the store will hold after this patch — an untitled,
        // content-less note is memory-only by design, so don't claim "saved".
        const before = useNoteStore.getState().notes.find((n) => n.id === currentNote.id)
        const after = { ...(before ?? currentNote), ...patch }
        return !isEmptyNote(after, useNoteStore.getState().inkDocs)
      })()
      setStatus('saving')
      try {
        saveContent(currentNote.id, patch)
        // Brief pause so the "Saving…" state is perceivable on fast devices
        await new Promise((r) => setTimeout(r, 150))
        if (Object.keys(pendingRef.current).length > 0) {
          // Edits arrived while "saving" — keep the unsaved guard active
          setStatus('dirty')
        } else if (!hadRealContent) {
          setStatus('idle')
        } else if (opts?.silent) {
          setStatus('idle')
        } else {
          setStatus('saved')
        }
        return 'saved'
      } finally {
        if (opts?.silent && Object.keys(pendingRef.current).length === 0) setStatus('idle')
      }
    },
    [saveContent],
  )

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

  // Ctrl+S force save (event dispatched by global hotkeys)
  useEffect(() => {
    const onSave = (): void => {
      void flush().then((result) => {
        if (result === 'dropped') {
          toast.error('That note was deleted — unsaved changes could not be kept')
        } else {
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

  /* -------------------------------- Editor -------------------------------- */

  const editor = useEditor(
    {
      extensions: buildEditorExtensions(),
      content: note?.content ?? '',
      editable: !note?.isDeleted,
      autofocus: false,
      onUpdate: ({ editor: ed }) => {
        pendingRef.current.content = ed.getJSON()
        markDirty()
      },
    },
    [noteId, syncKey],
  )

  /* `editable` only applies at editor creation — keep it in sync afterwards
     (restore from trash must re-enable typing; trashing while open must lock). */
  useEffect(() => {
    editor?.setEditable(!note?.isDeleted)
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
      onSelect: () => useNoteStore.getState().patchNote(note.id, { folderId: null }),
    },
    ...folders.map<MenuItem>((f) => ({
      id: f.id,
      label: f.name,
      checked: note.folderId === f.id,
      onSelect: () => useNoteStore.getState().patchNote(note.id, { folderId: f.id }),
    })),
  ]

  const currentFolder = folders.find((f) => f.id === note.folderId)

  const moreItems: MenuItem[] = note.isDeleted
    ? buildNoteMenu(note, { surface }).filter(
        (item) => item.id !== 'restore' && item.id !== 'delete-forever',
      )
    : [
        {
          id: 'reading',
          label: 'Reading layout',
          checked: readingLayout,
          onSelect: () => {
            // Flush pending edits so the reading view shows current content
            void flushRef.current({ silent: true })
            if (!readingLayout) exitDraw()
            toggleReadingLayout()
          },
        },
        ...(isDesktop
          ? [
              {
                id: 'focus',
                label: 'Distraction-free',
                checked: focusMode,
                onSelect: toggleFocusMode,
              } satisfies MenuItem,
            ]
          : []),
        ...buildNoteMenu(note, { surface }),
      ]

  // Rendered-layout documents are read-only surfaces: no handwriting there.
  const canDraw = !note.isDeleted && !readingLayout && !isRendered
  const touchInk = canDraw && penMode && isCoarse
  const headerTools = canDraw && !touchInk && (editorMode !== 'text' || inlineTools)
  const rowTools = canDraw && editorMode === 'text' && !inlineTools

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 flex-col bg-canvas animate-editor-in">
      {/* Toolbar row — adapts to typing / drawing / selecting */}
      <header className="flex h-12 shrink-0 items-center gap-1 border-b border-lineSoft px-2">
        <Tooltip label="Back" side="bottom">
          <button
            type="button"
            onClick={() => selectNote(null)}
            aria-label="Back to list"
            className="grid size-8 shrink-0 place-items-center rounded-wobbly-sm text-muted transition-colors hover:bg-raise hover:text-ink"
          >
            <ArrowLeft size={18} strokeWidth={2.5} />
          </button>
        </Tooltip>

        <SaveStatusChip status={status} autosave={autosaveEnabled} />

        <div className="ml-auto flex min-w-0 items-center gap-0.5">
          {headerTools && (
            <AdaptiveToolbar
              mode={editorMode}
              variant="inline"
              editor={isPdf ? null : editor}
              density={textDensity}
              ink={inkToolbar}
              onEnterDraw={enterDraw}
              onDone={exitDraw}
              drawRef={drawRef}
            />
          )}
          {canDraw && rowTools && (
            <DrawControl
              ref={drawRef}
              active={false}
              tool={penTool}
              color={inkPrefs.color}
              open={false}
              onClick={enterDraw}
            />
          )}
          {touchInk && (
            <Tooltip label="Done drawing" side="bottom">
              <button
                type="button"
                onClick={exitDraw}
                className="h-8 shrink-0 rounded-wobbly-sm px-2.5 text-[13px] font-medium text-ballpoint transition-colors hover:bg-raise"
              >
                Done
              </button>
            </Tooltip>
          )}
          <DropdownMenu
            items={moreItems}
            trigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label="More options"
                className="grid size-8 shrink-0 place-items-center rounded-wobbly-sm text-muted transition-colors hover:bg-raise hover:text-ink"
              >
                <ChevronDown size={18} strokeWidth={2.5} />
              </button>
            )}
          />
        </div>
      </header>

      {rowTools && (
        <AdaptiveToolbar
          mode="text"
          variant="row"
          editor={editor}
          density="full"
          ink={inkToolbar}
          onEnterDraw={enterDraw}
          onDone={exitDraw}
          drawRef={drawRef}
          showDraw={false}
        />
      )}

      {touchInk && (
        <FloatingInkToolbar
          boundsRef={rootRef}
          mode={editorMode === 'select' ? 'select' : 'write'}
          state={inkToolbar.state}
          actions={inkToolbar.actions}
          selection={inkToolbar.selection}
          selectionCount={selectionCount}
          drawRef={drawRef}
        />
      )}

      {canDraw && (
        <PenPopover
          open={palette !== null}
          anchor={palette?.anchor ?? null}
          anchorMode={palette?.mode ?? 'trigger'}
          side={palette?.mode === 'trigger' && touchInk ? 'top' : undefined}
          align={touchInk ? 'center' : 'end'}
          prefs={penPrefs}
          onPrefs={updatePenPrefs}
          onClear={() => {
            inkLayerRef.current?.clearAll()
            setPalette(null)
            toast.success('Handwriting cleared')
          }}
          onClose={() => setPalette(null)}
        />
      )}

      {/* Banners */}
      {note.isDeleted && (
        <div className="mx-6 mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-wobbly-md border-2 border-dashed border-accent/50 bg-accent/[0.06] px-3.5 py-2.5">
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

      {/* Scrollable document */}
      <div
        ref={scrollRef}
        className="editor-scroll min-h-0 flex-1 overflow-y-auto"
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
        <div
          className={cn(
            'relative mx-auto w-full px-6 pb-24 pt-5 md:px-10 md:pt-7',
            isPdf ? 'max-w-[1100px]' : 'max-w-[720px]',
          )}
          style={
            {
              '--editor-font-size': `${fontSize}px`,
              '--editor-line-height': lineHeight,
            } as CSSProperties
          }
        >
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
              <span className="rounded-wobbly-sm border border-lineSoft bg-raise px-1.5 py-px text-[11px] text-muted">
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
                    className="inline-flex h-6 items-center gap-1 rounded-wobbly-sm border border-transparent px-1.5 text-xs text-faint transition-colors hover:border-ballpoint/40 hover:bg-ballpoint-soft/50 hover:text-ballpoint"
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
                      useNoteStore
                        .getState()
                        .patchNote(note.id, { tagIds: note.tagIds.filter((t) => t !== tag.id) })
                    }
                  />
                ))}
                <Tooltip label="Edit tags">
                  <button
                    type="button"
                    onClick={() => openModal({ kind: 'tag-editor', noteId: note.id })}
                    aria-label="Edit tags"
                    className="grid size-[19px] place-items-center rounded-[5px_3px_6px_3px] border border-dashed border-lineSoft text-faint transition-colors hover:border-accent hover:text-accent"
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

          {docRecord && <DocumentBar document={docRecord} readOnly={note.isDeleted} />}

          {/* Content — editor stays mounted (hidden) so state/undo survive the toggle */}
          {docRecord && isPdf ? (
            <PdfDocumentView
              key={docRecord.id}
              ref={inkLayerRef}
              note={note}
              document={docRecord}
              drawing={penMode}
              prefs={inkLayerPrefs}
              readOnly={note.isDeleted}
              scrollRef={scrollRef}
              onHistoryChange={handleInkHistory}
              onPaletteRequest={handlePaletteRequest}
              onSelectionChange={handleSelectionChange}
              onStrokeCommitted={handleStrokeCommitted}
              onRequestTool={selectTool}
            />
          ) : docRecord && isRendered ? (
            <RenderedDocumentView document={docRecord} />
          ) : readingLayout ? (
            <ReadingView noteId={note.id} doc={note.content} />
          ) : (
            <EditorContent
              editor={isPdf ? null : editor}
              className={cn('mt-3 [&_.tiptap]:min-h-[45vh]', note.isDeleted && 'opacity-80')}
            />
          )}

          {/* Handwriting overlay — above the typed content, active only in pen mode */}
          {!readingLayout && !note.isDeleted && !isPdf && !isRendered && (
            <InkLayer
              key={note.id}
              ref={inkLayerRef}
              ink={inkDocs[note.id] ?? note.ink ?? null}
              onChange={handleInkChange}
              scrollRef={scrollRef}
              active={penMode}
              prefs={inkLayerPrefs}
              onHistoryChange={handleInkHistory}
              onPaletteRequest={handlePaletteRequest}
              onSelectionChange={handleSelectionChange}
              onStrokeCommitted={handleStrokeCommitted}
              onRequestTool={selectTool}
            />
          )}
        </div>
      </div>
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
      className={cn('ml-2 inline-flex items-center gap-1.5 text-xs transition-opacity duration-200', cls)}
    >
      {icon}
      {label}
    </span>
  )
}
