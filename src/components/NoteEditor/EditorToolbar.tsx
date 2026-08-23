import { useState } from 'react'
import {
  Bold,
  Braces,
  Code,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  ListChecks,
  Quote,
  Minus,
  Link2,
  ImagePlus,
  Undo2,
  Redo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { processImageFile } from '@/utils/image'
import { useEditorState } from '@tiptap/react'
import { toast } from 'sonner'
import { cn } from '@/utils/cn'
import { Tooltip } from '../UI/Tooltip'
import { Modal } from '../UI/Modal'
import { Button } from '../UI/Button'

interface ToolbarButtonSpec {
  icon: LucideIcon
  label: string
  active: boolean
  disabled?: boolean
  onRun: () => void
}

export function EditorToolbar({ editor }: { editor: Editor }): React.ReactNode {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)

  const state = useEditorState({
    editor,
    selector: (ctx): Record<string, boolean> => ({
      bold: ctx.editor.isActive('bold'),
      italic: ctx.editor.isActive('italic'),
      underline: ctx.editor.isActive('underline'),
      strike: ctx.editor.isActive('strike'),
      code: ctx.editor.isActive('code'),
      h1: ctx.editor.isActive('heading', { level: 1 }),
      h2: ctx.editor.isActive('heading', { level: 2 }),
      h3: ctx.editor.isActive('heading', { level: 3 }),
      bulletList: ctx.editor.isActive('bulletList'),
      orderedList: ctx.editor.isActive('orderedList'),
      taskList: ctx.editor.isActive('taskList'),
      blockquote: ctx.editor.isActive('blockquote'),
      codeBlock: ctx.editor.isActive('codeBlock'),
      link: ctx.editor.isActive('link'),
      canUndo: ctx.editor.can().undo(),
      canRedo: ctx.editor.can().redo(),
    }),
  })

  const chain = (): ReturnType<Editor['chain']> => editor.chain().focus()

  const buttons: Array<ToolbarButtonSpec | 'sep'> = [
    {
      icon: Undo2, label: 'Undo', active: false,
      disabled: !state.canUndo,
      onRun: () => chain().undo().run(),
    },
    {
      icon: Redo2, label: 'Redo', active: false,
      disabled: !state.canRedo,
      onRun: () => chain().redo().run(),
    },
    'sep',
    { icon: Heading1, label: 'Heading 1', active: state.h1, onRun: () => chain().toggleHeading({ level: 1 }).run() },
    { icon: Heading2, label: 'Heading 2', active: state.h2, onRun: () => chain().toggleHeading({ level: 2 }).run() },
    { icon: Heading3, label: 'Heading 3', active: state.h3, onRun: () => chain().toggleHeading({ level: 3 }).run() },
    'sep',
    { icon: Bold, label: 'Bold — Ctrl+B', active: state.bold, onRun: () => chain().toggleBold().run() },
    { icon: Italic, label: 'Italic — Ctrl+I', active: state.italic, onRun: () => chain().toggleItalic().run() },
    { icon: UnderlineIcon, label: 'Underline', active: state.underline, onRun: () => chain().toggleUnderline().run() },
    { icon: Strikethrough, label: 'Strikethrough', active: state.strike, onRun: () => chain().toggleStrike().run() },
    { icon: Code, label: 'Inline code', active: state.code, onRun: () => chain().toggleCode().run() },
    'sep',
    { icon: List, label: 'Bullet list', active: state.bulletList, onRun: () => chain().toggleBulletList().run() },
    { icon: ListOrdered, label: 'Numbered list', active: state.orderedList, onRun: () => chain().toggleOrderedList().run() },
    { icon: ListChecks, label: 'Checklist — type [ ] and space', active: state.taskList, onRun: () => chain().toggleTaskList().run() },
    { icon: Quote, label: 'Quote — type > and space', active: state.blockquote, onRun: () => chain().toggleBlockquote().run() },
    'sep',
    { icon: Link2, label: state.link ? 'Edit link' : 'Add link', active: state.link, onRun: () => setLinkDialogOpen(true) },
    { icon: ImagePlus, label: 'Insert image', active: false, onRun: () => pickAndInsertImage(editor) },
    { icon: Minus, label: 'Divider', active: false, onRun: () => chain().setHorizontalRule().run() },
    {
      icon: Braces, label: 'Code block — type ```', active: state.codeBlock,
      onRun: () => chain().toggleCodeBlock().run(),
    },
  ]

  return (
    <div
      role="toolbar"
      aria-label="Formatting"
      className="no-scrollbar flex items-center gap-0.5 overflow-x-auto rounded-wobbly-md border-2 border-line bg-panel px-1.5 py-1 shadow-sketch-sm"
    >
      {buttons.map((btn, i) =>
        btn === 'sep' ? (
          <span key={`sep-${i}`} aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-lineSoft" />
        ) : (
          <Tooltip key={btn.label} label={btn.label}>
            <button
              type="button"
              onClick={btn.onRun}
              disabled={btn.disabled}
              aria-pressed={btn.active}
              aria-label={btn.label}
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-wobbly-sm transition-colors duration-100',
                btn.active ? 'bg-postit text-postit-ink' : 'text-muted hover:bg-raise hover:text-ink',
                btn.disabled && 'pointer-events-none opacity-35',
              )}
            >
              <btn.icon size={14} strokeWidth={btn.active ? 2.75 : 2} />
            </button>
          </Tooltip>
        ),
      )}

      {/* Link dialog */}
      {linkDialogOpen && (
        <LinkDialog
          editor={editor}
          onClose={() => setLinkDialogOpen(false)}
        />
      )}
    </div>
  )
}

/* ------------------------------- Link dialog ------------------------------ */

function LinkDialog({
  editor,
  onClose,
}: {
  editor: Editor
  onClose: () => void
}): React.ReactNode {
  const existing = editor.getAttributes('link').href as string | undefined

  const apply = (href: string): void => {
    if (!href.trim()) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else if (/^(https?:\/\/|mailto:)/i.test(href)) {
      editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
    } else {
      editor.chain().focus().extendMarkRange('link').setLink({ href: `https://${href}` }).run()
    }
    onClose()
  }

  return (
    <Modal onClose={onClose} ariaLabel="Edit link" className="max-w-sm" standalone>
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault()
          apply(new FormData(e.currentTarget).get('url')?.toString() ?? '')
        }}
      >
        <h2 className="font-display text-xl leading-snug">{existing ? 'Edit link' : 'Add link'}</h2>
        <input
          name="url"
          type="text"
          defaultValue={existing ?? ''}
          placeholder="https://…"
          autoFocus
          aria-label="Link URL"
          className="mt-3 h-10 w-full rounded-wobbly-md border-2 border-line bg-canvas px-3 font-body text-sm focus:border-ballpoint focus:ring-2 focus:ring-ballpoint/20"
        />
        <p className="mt-1.5 text-xs text-faint">Tip: select text first, then add a link to it.</p>
        <div className="mt-4 flex justify-between">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              editor.chain().focus().extendMarkRange('link').unsetLink().run()
              onClose()
            }}
          >
            Remove
          </Button>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" variant="primary" type="submit">
              Apply
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  )
}

/* ------------------------------ Image insertion --------------------------- */

async function pickAndInsertImage(editor: Editor): Promise<void> {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = 'image/*'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      const src = await processImageFile(file)
      editor.chain().focus().setImage({ src }).run()
    } catch {
      toast.error(`Couldn't insert “${file.name}”`, {
        description: 'The file could not be read as an image.',
      })
    }
  }
  input.click()
}
