import { memo, useCallback, useEffect } from 'react'
import type { ReactNode } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { JSONContent } from '@tiptap/core'
import { Extension, InputRule } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import ImageExtension from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { toast } from 'sonner'

import type { PageRecord } from '@/types/models'
import type { InkDoc, InkStroke } from '@/types/ink'
import { cn } from '@/utils/cn'
import { processImageFile } from '@/utils/image'
import { dayKey } from '@/coach/study'
import { formatLongDay } from '@/entries/parse'
import { EntryLines } from './entryLines'
import { EditorToolbar } from './EditorToolbar'
import { ReadingView } from './ReadingView'
import { InkLayer } from './ink/InkLayer'
import type { InkLayerHandle, InkPrefsSnapshot } from './ink/InkLayer'
import { PageBackground, PageFrame } from './PageBackground'

/* ---------------------------------------------------------------------------
   One page of the continuous scroll. Ink is captured from the page's top-left
   corner, side padding included, so a typed page's text must start at the
   same offset on every page (the title block on page 1, a label of the same
   height after it). Pages away from the screen render as a box of their last
   measured size: no editor, no PDF canvas, no ink layer.
--------------------------------------------------------------------------- */

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

/** Last measured height of each page (layout px), for the box it leaves when scrolled away. */
export const pageHeights = new Map<string, number>()

export interface PageSheetProps {
  noteId: string
  page: PageRecord
  index: number
  /** Mount the page's content (it is on or near the screen). */
  near: boolean
  /** The page in view: its formatting toolbar shows even before you type in it. */
  current: boolean
  readOnly: boolean
  penMode: boolean
  readingLayout: boolean
  /** Bumped by an import/restore: recreate the editor from the store. */
  syncKey: number
  ink: InkDoc | null
  wet: boolean
  inkPrefs: InkPrefsSnapshot
  recording: boolean
  /** Page 1's title block; gets a way to move the caret into the page. */
  head?: (focusText: () => void) => ReactNode
  slotRef: (pageId: string, el: HTMLElement | null) => void
  onText: (pageId: string, doc: JSONContent) => void
  /** The page's editor is going away: land its unsaved text. */
  onLeave: (pageId: string) => void
  onInk: (pageId: string, doc: InkDoc, before: InkStroke[]) => void
  onInkHandle: (pageId: string, handle: InkLayerHandle | null) => void
  onEngage: (pageId: string) => void
  onSelection: (pageId: string, count: number) => void
  onPalette: (x: number, y: number) => void
  onStrokeTap: (ts: number) => void
}

export const PageSheet = memo(function PageSheet(props: PageSheetProps): ReactNode {
  const { page, index, near, ink, penMode, readOnly, readingLayout, slotRef, onInk, onInkHandle, onEngage, onSelection } = props
  const bg = !!(page.pdfPage || page.backgroundBlobId)
  const id = page.id
  const setSlot = useCallback((el: HTMLDivElement | null) => slotRef(id, el), [id, slotRef])
  const setHandle = useCallback((h: InkLayerHandle | null) => onInkHandle(id, h), [id, onInkHandle])
  const commit = useCallback((doc: InkDoc, before: InkStroke[]) => onInk(id, doc, before), [id, onInk])
  const engage = useCallback(() => onEngage(id), [id, onEngage])
  const select = useCallback((count: number) => onSelection(id, count), [id, onSelection])
  const height = pageHeights.get(id)

  return (
    <div
      ref={setSlot}
      data-page-id={id}
      aria-label={`Page ${index + 1}`}
      role="group"
      data-current={props.current || undefined}
      className={cn(
        'relative grid grid-cols-1',
        !bg && `editor-sheet tpl-${page.template} min-h-[70vh] bg-panel md:rounded-[4px] md:shadow-sheet`,
      )}
      style={!near && !bg && height ? { minHeight: height } : undefined}
    >
      {bg ? (
        <div className="px-6 [grid-area:1/1] md:px-10">
          {near ? <PageBackground noteId={props.noteId} page={page} label={`Page ${index + 1}`} /> : <PageFrame page={page} />}
        </div>
      ) : (
        near && <TypedPage {...props} />
      )}
      {/* Keeps the sheet as tall as its handwriting, so ink never runs into the next page */}
      {ink && <div aria-hidden="true" className="pointer-events-none [grid-area:1/1]" style={{ aspectRatio: `${ink.width} / ${ink.height}` }} />}
      {near && !readingLayout && !readOnly && (
        <InkLayer
          ref={setHandle}
          ink={ink}
          onCommit={commit}
          active={penMode}
          wet={props.wet}
          onEngage={engage}
          prefs={props.inkPrefs}
          onSelectionChange={select}
          onPaletteRequest={props.onPalette}
          recording={props.recording}
          onStrokeTap={props.onStrokeTap}
          label={`Handwriting on page ${index + 1}`}
        />
      )}
    </div>
  )
})

function TypedPage({
  noteId,
  page,
  index,
  readOnly,
  penMode,
  readingLayout,
  syncKey,
  head,
  onText,
  onLeave,
}: PageSheetProps): ReactNode {
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
        EntryLines.configure({ day: page.day ?? null, fallback: page.day ?? dayKey(page.createdAt) }),
        Placeholder.configure({
          placeholder: page.day
            ? 'Write your day…   "P150 lunch gcash" · "@ 2pm dentist" · "[ ] essay due fri"'
            : 'Start writing…   "# " heading · "- " list · "[ ] " task · "> " quote · "```" code',
        }),
      ],
      content: page.content ?? '',
      editable: !readOnly,
      autofocus: false,
      onUpdate: ({ editor: ed }) => onText(page.id, ed.getJSON()),
    },
    [page.id, syncKey],
  )

  /* `editable` only applies at editor creation: keep it in sync afterwards
     (restore from trash must re-enable typing; trashing while open must lock). */
  useEffect(() => {
    // emitUpdate=false: setEditable fires `update` by default, which made merely
    // opening a note autosave it (bumping updatedAt and wiping a PDF page's text layer)
    editor?.setEditable(!readOnly, false)
  }, [editor, readOnly])

  // Scrolled away (or the note closed): land this page's edits before the editor goes
  useEffect(() => () => onLeave(page.id), [onLeave, page.id])

  const onPasteOrDrop = (e: React.ClipboardEvent | React.DragEvent): void => {
    const dt = 'clipboardData' in e ? e.clipboardData : e.dataTransfer
    const files = Array.from(dt?.files ?? []).filter((f) => f.type.startsWith('image/'))
    if (files.length === 0 || !editor) return
    e.preventDefault()
    void (async () => {
      for (const file of files.slice(0, 4)) {
        try {
          const src = await processImageFile(file)
          editor.chain().focus().setImage({ src }).run()
        } catch (err) {
          console.warn('[tala] image skipped', file.name, err)
          toast.error(`Could not add ${file.name}`)
        }
      }
    })()
  }

  return (
    <div className="min-w-0 px-6 pb-24 pt-6 [grid-area:1/1] md:px-10" onPaste={onPasteOrDrop} onDrop={onPasteOrDrop}>
      {/* Same height on every page: text starts where the ink expects it */}
      <div className="flex min-h-[82px] flex-col">
        {head ? (
          head(() => editor?.commands.focus('start'))
        ) : (
          <p aria-hidden="true" className="pt-2 text-xs font-medium tabular-nums text-faint">
            {page.day ? formatLongDay(page.day) : `Page ${index + 1}`}
          </p>
        )}
      </div>

      {/* Formatting toolbar for typing; writing tools live in the pen dock.
          The row keeps its fixed height in Write mode too, so the text starts
          at the same offset in both modes: 176px from the page top, where
          pre-redesign notes drew their ink (scripts/pages-e2e.mjs checks it).
          index.css shows one toolbar at a time (`.page-stack [data-toolbar]`). */}
      {editor && !readOnly && !readingLayout && (
        <div
          data-toolbar
          className={cn(
            '-mx-1 mb-[13.5px] flex h-14 items-center',
            !penMode && 'sticky top-0 z-40 bg-panel/95 backdrop-blur-[2px]',
          )}
        >
          {!penMode && <EditorToolbar editor={editor} />}
        </div>
      )}

      {readingLayout ? (
        <ReadingView noteId={noteId} doc={page.content ?? null} />
      ) : (
        <EditorContent editor={editor} className={cn('[&_.tiptap]:min-h-[45vh]', readOnly && 'opacity-80')} />
      )}
    </div>
  )
}
