import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { Extension, InputRule } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import ImageExtension from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  Folder as FolderIcon,
  Hash,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PenTool,
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
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import type { Note } from '@/types/models'
import type { InkDoc, InkPointerMode } from '@/types/ink'
import { cn } from '@/utils/cn'
import { formatFull, formatRelative } from '@/utils/dates'
import { processImageFile } from '@/utils/image'
import { TagChip } from '../UI/TagChip'
import { Tooltip } from '../UI/Tooltip'
import { DropdownMenu, type MenuItem } from '../UI/DropdownMenu'
import { Button } from '../UI/Button'
import { EditorToolbar } from './EditorToolbar'
import { ReadingView } from './ReadingView'
import { InkLayer } from './ink/InkLayer'
import type { InkLayerHandle } from './ink/InkLayer'
import { PenToolbar } from './ink/PenToolbar'
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
  const [penMode, setPenMode] = useState(false)
  const [penTool, setPenTool] = useState<InkPointerMode>(inkPrefs.tool)
  const [inkHistory, setInkHistory] = useState({ canUndo: false, canRedo: false })
  const inkLayerRef = useRef<InkLayerHandle>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  /** Ink commits save immediately (strokes are discrete, cheap IDB puts). */
  const handleInkChange = useCallback(
    (doc: InkDoc) => {
      if (!note) return
      saveContent(note.id, { ink: doc })
      markDirty()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [note?.id, saveContent],
  )

  const updatePenPrefs = useCallback(
    (
      patch: Partial<{
        tool: InkPointerMode
        color: string
        sizeIdx: number
        eraserMode: 'stroke' | 'pixel'
      }>,
    ) => {
      if (patch.tool !== undefined) setPenTool(patch.tool)
      const persistPatch: Parameters<typeof setInkPrefs>[0] = {}
      if (patch.color !== undefined) persistPatch.color = patch.color
      if (patch.sizeIdx !== undefined) persistPatch.sizeIdx = patch.sizeIdx
      if (patch.eraserMode !== undefined) persistPatch.eraserMode = patch.eraserMode
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

  const [title, setTitle] = useState(note?.title ?? '')
  const [status, setStatus] = useState<SaveStatus>('idle')

  const pendingRef = useRef<PendingPatch>({})
  const timerRef = useRef<number | null>(null)

  /* ------------------------------ Autosave core --------------------------- */

  const flush = useCallback(
    async (opts?: { silent?: boolean }): Promise<void> => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      const patch = pendingRef.current
      if (!note || Object.keys(patch).length === 0 || note.isDeleted) {
        // Refused (e.g. note is in the trash) — drop the edits, they can never save
        pendingRef.current = {}
        setStatus('idle')
        return
      }
      pendingRef.current = {}
      setStatus('saving')
      try {
        saveContent(note.id, patch)
        // Brief pause so the "Saving…" state is perceivable on fast devices
        await new Promise((r) => setTimeout(r, 150))
        if (opts?.silent) {
          setStatus('idle')
        } else if (Object.keys(pendingRef.current).length > 0) {
          // Edits arrived while "saving" — keep the unsaved guard active
          setStatus('dirty')
        } else {
          setStatus('saved')
        }
      } finally {
        if (opts?.silent && Object.keys(pendingRef.current).length === 0) setStatus('idle')
      }
    },
    [note, saveContent],
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
      void flush().then(() => toast.success('Saved'))
    }
    window.addEventListener('notely:force-save', onSave)
    return () => window.removeEventListener('notely:force-save', onSave)
  }, [flush])

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
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: { openOnClick: false, autolink: true },
        }),
        TaskList,
        TaskItem.configure({ nested: true }),
        ImageExtension,
        TaskSyntaxInput,
        Placeholder.configure({
          placeholder:
            'Start writing…   "# " heading · "- " list · "[ ] " task · "> " quote · "```" code',
        }),
      ],
      content: note?.content ?? '',
      editable: !note?.isDeleted,
      autofocus: false,
      onUpdate: ({ editor: ed }) => {
        pendingRef.current.content = ed.getJSON()
        markDirty()
      },
    },
    [noteId],
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
        console.warn('[notely] image skipped', file.name, err)
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas animate-editor-in">
      {/* Toolbar row */}
      <header className="flex items-center gap-1 border-b-2 border-line px-3 py-2">
        <Tooltip label="Back" side="bottom">
          <button
            type="button"
            onClick={() => selectNote(null)}
            aria-label="Back to list"
            className="grid size-8 place-items-center rounded-wobbly-sm text-muted transition-colors hover:bg-raise hover:text-ink"
          >
            <ArrowLeft size={16} strokeWidth={2.5} />
          </button>
        </Tooltip>

        <SaveStatusChip status={status} autosave={autosaveEnabled} />

        <div className="ml-auto flex items-center gap-0.5">
          {!note.isDeleted && (
            <HeaderToggle
              label={note.isPinned ? 'Unpin' : 'Pin'}
              active={note.isPinned}
              onClick={() => useNoteStore.getState().patchNote(note.id, { isPinned: !note.isPinned })}
            >
              <Pin size={15} className={cn(note.isPinned && 'rotate-45')} />
            </HeaderToggle>
          )}
          {!note.isDeleted && (
            <HeaderToggle
              label={note.isFavorite ? 'Remove from favorites' : 'Add to favorites'}
              active={note.isFavorite}
              onClick={() =>
                useNoteStore.getState().patchNote(note.id, { isFavorite: !note.isFavorite })
              }
            >
              <Star size={15} className={cn(note.isFavorite && 'fill-current')} />
            </HeaderToggle>
          )}
          <HeaderToggle
            label="Share & export"
            active={false}
            onClick={() => openModal({ kind: 'share', noteId: note.id })}
          >
            <Share2 size={15} />
          </HeaderToggle>
          {!note.isDeleted && !readingLayout && (
            <HeaderToggle
              label={penMode ? 'Exit pen mode' : 'Pen mode'}
              active={penMode}
              onClick={() => setPenMode((m) => !m)}
            >
              <PenTool size={15} />
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
              <BookOpen size={15} />
            </HeaderToggle>
          )}
          {!focusMode ? (
            <span className="hidden md:block">
              <HeaderToggle label="Distraction-free mode" active={focusMode} onClick={toggleFocusMode}>
                <Maximize2 size={15} />
              </HeaderToggle>
            </span>
          ) : (
            <span>
              <HeaderToggle label="Exit distraction-free mode" active onClick={toggleFocusMode}>
                <Minimize2 size={15} />
              </HeaderToggle>
            </span>
          )}
          <DropdownMenu
            items={buildNoteMenu(note, { surface })}
            trigger={(props) => (
              <button
                {...props}
                type="button"
                aria-label="More options"
                className="grid size-8 place-items-center rounded-wobbly-sm text-muted transition-colors hover:bg-raise hover:text-ink"
              >
                <ChevronDown size={16} strokeWidth={2.5} />
              </button>
            )}
          />
        </div>
      </header>

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
                    void deleteForeverAndPrune([note.id]).then(() => {
                      toast.success('Note deleted forever')
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
      >
        <div
          className="relative mx-auto w-full max-w-[720px] px-6 pb-24 pt-6 md:px-10"
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

          {/* Formatting toolbar — hidden while reading */}
          {editor && !note.isDeleted && !readingLayout && (
            <div className="sticky top-0 z-40 -mx-1 mt-4 mb-4 bg-gradient-to-b from-canvas via-canvas to-transparent pb-2 pt-1">
              <EditorToolbar editor={editor} />
              {penMode && (
                <PenToolbar
                  prefs={{
                    tool: penTool,
                    color: inkPrefs.color,
                    sizeIdx: inkPrefs.sizeIdx,
                    eraserMode: inkPrefs.eraserMode,
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
                />
              )}
            </div>
          )}

          {/* Content — editor stays mounted (hidden) so state/undo survive the toggle */}
          {readingLayout ? (
            <ReadingView noteId={note.id} doc={note.content} />
          ) : (
            <EditorContent
              editor={editor}
              className={cn('[&_.tiptap]:min-h-[45vh]', note.isDeleted && 'opacity-80')}
            />
          )}

          {/* Handwriting overlay — above the typed content, active only in pen mode */}
          {!readingLayout && !note.isDeleted && (
            <InkLayer
              key={note.id}
              ref={inkLayerRef}
              ink={note.ink ?? null}
              onChange={handleInkChange}
              scrollRef={scrollRef}
              active={penMode}
              prefs={{
                tool: penTool,
                color: inkPrefs.color,
                sizeIdx: inkPrefs.sizeIdx,
                eraserMode: inkPrefs.eraserMode,
              }}
              onHistoryChange={(canUndo, canRedo) =>
                setInkHistory((prev) =>
                  prev.canUndo === canUndo && prev.canRedo === canRedo
                    ? prev
                    : { canUndo, canRedo },
                )
              }
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

function HeaderToggle({
  label,
  active,
  onClick,
  children,
}: {
  label: string
  active: boolean
  onClick: () => void
  children: React.ReactNode
}): React.ReactNode {
  return (
    <Tooltip label={label} side="bottom">
      <button
        type="button"
        onClick={onClick}
        aria-pressed={active}
        aria-label={label}
        className={cn(
          'grid size-8 place-items-center rounded-wobbly-sm transition-colors duration-100',
          active
            ? 'bg-postit text-postit-ink'
            : 'text-muted hover:bg-raise hover:text-ink',
        )}
      >
        {children}
      </button>
    </Tooltip>
  )
}
