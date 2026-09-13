import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import {
  Bold,
  Braces,
  Code,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  Underline as UnderlineIcon,
  Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import { toast } from 'sonner'
import { processImageFile } from '@/utils/image'
import { cn } from '@/utils/cn'
import { Popover } from '../../UI/Popover'
import { Modal } from '../../UI/Modal'
import { Button } from '../../UI/Button'
import { ToolButton, ToolSeparator, type ToolButtonSize } from './ToolButton'

/* ---------------------------------------------------------------------------
   Text-mode tools. Apple Notes shape: an "Aa" style popover carries block
   styles, font, size and alignment; the bar itself keeps only the strokes
   people reach for constantly (bold/italic/underline/strike), lists and
   insert. `density` trims the inline set when the bar is narrow.
--------------------------------------------------------------------------- */

export type TextDensity = 'full' | 'compact'

interface TextToolsProps {
  editor: Editor
  size?: ToolButtonSize
  density?: TextDensity
}

type Align = 'left' | 'center' | 'right' | 'justify'

const FONTS: { id: string; label: string; family: string | null; sample: string }[] = [
  { id: 'default', label: 'Default', family: null, sample: 'font-body' },
  { id: 'hand', label: 'Handwritten', family: '"Patrick Hand", cursive', sample: 'font-sans' },
  { id: 'display', label: 'Marker', family: 'Kalam, cursive', sample: 'font-display' },
  { id: 'mono', label: 'Mono', family: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', sample: 'font-mono' },
]

const SIZES = [11, 13, 15, 17, 19, 22, 26, 32]

const ALIGNS: { id: Align; icon: LucideIcon; label: string }[] = [
  { id: 'left', icon: TextAlignStart, label: 'Align left' },
  { id: 'center', icon: TextAlignCenter, label: 'Center' },
  { id: 'right', icon: TextAlignEnd, label: 'Align right' },
  { id: 'justify', icon: TextAlignJustify, label: 'Justify' },
]

export function TextTools({ editor, size = 'sm', density = 'full' }: TextToolsProps): ReactNode {
  const [menu, setMenu] = useState<'style' | 'align' | 'list' | 'insert' | null>(null)
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)
  const styleRef = useRef<HTMLButtonElement>(null)
  const alignRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLButtonElement>(null)
  const insertRef = useRef<HTMLButtonElement>(null)

  const s = useEditorState({
    editor,
    selector: (ctx) => {
      const ed = ctx.editor
      const attrs = ed.getAttributes('textStyle') as { fontFamily?: string; fontSize?: string }
      const align: Align =
        (['center', 'right', 'justify'] as Align[]).find((a) => ed.isActive({ textAlign: a })) ?? 'left'
      return {
        bold: ed.isActive('bold'),
        italic: ed.isActive('italic'),
        underline: ed.isActive('underline'),
        strike: ed.isActive('strike'),
        code: ed.isActive('code'),
        h1: ed.isActive('heading', { level: 1 }),
        h2: ed.isActive('heading', { level: 2 }),
        h3: ed.isActive('heading', { level: 3 }),
        bulletList: ed.isActive('bulletList'),
        orderedList: ed.isActive('orderedList'),
        taskList: ed.isActive('taskList'),
        blockquote: ed.isActive('blockquote'),
        codeBlock: ed.isActive('codeBlock'),
        link: ed.isActive('link'),
        canUndo: ed.can().undo(),
        canRedo: ed.can().redo(),
        fontFamily: attrs.fontFamily ?? null,
        fontSize: attrs.fontSize ? parseInt(attrs.fontSize, 10) : null,
        align,
      }
    },
  })

  const chain = (): ReturnType<Editor['chain']> => editor.chain().focus()
  const toggle = (id: typeof menu): void => setMenu((m) => (m === id ? null : id))
  const close = (): void => setMenu(null)

  const blockLabel = s.h1 ? 'Title' : s.h2 ? 'Heading' : s.h3 ? 'Subheading' : 'Body'
  const listActive = s.bulletList || s.orderedList || s.taskList
  const ListIcon = s.orderedList ? ListOrdered : s.taskList ? ListChecks : List
  const AlignIcon = ALIGNS.find((a) => a.id === s.align)?.icon ?? TextAlignStart
  const fontId = FONTS.find((f) => f.family === s.fontFamily)?.id ?? 'default'
  const currentSize = s.fontSize ?? 15

  const setFont = (family: string | null): void => {
    if (family) chain().setFontFamily(family).run()
    else chain().unsetFontFamily().run()
  }
  const stepSize = (dir: 1 | -1): void => {
    const idx = SIZES.findIndex((v) => v >= currentSize)
    const cur = idx === -1 ? SIZES.length - 1 : idx
    const next = SIZES[Math.min(SIZES.length - 1, Math.max(0, cur + dir))]!
    if (next === 15) chain().unsetFontSize().run()
    else chain().setFontSize(`${next}px`).run()
  }

  const full = density === 'full'

  return (
    <>
      <ToolButton icon={Undo2} label="Undo" size={size} disabled={!s.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton icon={Redo2} label="Redo" size={size} disabled={!s.canRedo} onClick={() => chain().redo().run()} />
      <ToolSeparator size={size} />

      {/* Aa — block style, font, size (and alignment when compact) */}
      <ToolButton
        ref={styleRef}
        label={`Text style — ${blockLabel}`}
        size={size}
        menu
        active={menu === 'style'}
        aria-haspopup="dialog"
        aria-expanded={menu === 'style'}
        onClick={() => toggle('style')}
      >
        <span className={cn('font-display leading-none', size === 'lg' ? 'text-[19px]' : 'text-[16px]')}>Aa</span>
      </ToolButton>

      <ToolButton icon={Bold} label="Bold — Ctrl+B" size={size} active={s.bold} onClick={() => chain().toggleBold().run()} />
      <ToolButton icon={Italic} label="Italic — Ctrl+I" size={size} active={s.italic} onClick={() => chain().toggleItalic().run()} />
      <ToolButton icon={UnderlineIcon} label="Underline — Ctrl+U" size={size} active={s.underline} onClick={() => chain().toggleUnderline().run()} />
      {full && (
        <>
          <ToolButton icon={Strikethrough} label="Strikethrough" size={size} active={s.strike} onClick={() => chain().toggleStrike().run()} />
          <ToolButton icon={Code} label="Inline code" size={size} active={s.code} onClick={() => chain().toggleCode().run()} />
        </>
      )}
      <ToolSeparator size={size} />

      {full && (
        <ToolButton
          ref={alignRef}
          icon={AlignIcon}
          label="Alignment"
          size={size}
          menu
          active={menu === 'align' || s.align !== 'left'}
          aria-haspopup="dialog"
          aria-expanded={menu === 'align'}
          onClick={() => toggle('align')}
        />
      )}
      <ToolButton
        ref={listRef}
        icon={ListIcon}
        label="Lists"
        size={size}
        menu
        active={menu === 'list' || listActive}
        aria-haspopup="dialog"
        aria-expanded={menu === 'list'}
        onClick={() => toggle('list')}
      />
      <ToolButton
        ref={insertRef}
        label="Insert"
        size={size}
        menu
        active={menu === 'insert' || s.blockquote || s.codeBlock}
        aria-haspopup="dialog"
        aria-expanded={menu === 'insert'}
        onClick={() => toggle('insert')}
      >
        <svg width={size === 'lg' ? 22 : 18} height={size === 'lg' ? 22 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </ToolButton>

      {/* ---------------------------- Style popover --------------------------- */}
      <Popover open={menu === 'style'} anchor={styleRef.current} onClose={close} ariaLabel="Text style" align="start" className="w-[268px] p-2">
        <div role="radiogroup" aria-label="Paragraph style" className="space-y-0.5">
          {(
            [
              { id: 'p', label: 'Body', active: !s.h1 && !s.h2 && !s.h3, cls: 'font-body text-[15px]', run: () => chain().setParagraph().run() },
              { id: 'h1', label: 'Title', active: s.h1, cls: 'font-display text-[22px] font-bold', run: () => chain().toggleHeading({ level: 1 }).run() },
              { id: 'h2', label: 'Heading', active: s.h2, cls: 'font-display text-[18px] font-bold', run: () => chain().toggleHeading({ level: 2 }).run() },
              { id: 'h3', label: 'Subheading', active: s.h3, cls: 'font-display text-[15px] font-bold', run: () => chain().toggleHeading({ level: 3 }).run() },
            ] as const
          ).map((b) => (
            <button
              key={b.id}
              type="button"
              role="radio"
              aria-checked={b.active}
              data-autofocus={b.active || undefined}
              onClick={() => {
                b.run()
                close()
              }}
              className={cn(
                'flex h-9 w-full items-center rounded-wobbly-sm px-2.5 text-left transition-colors',
                b.active ? 'bg-postit text-postit-ink' : 'hover:bg-raise',
                b.cls,
              )}
            >
              {b.label}
            </button>
          ))}
        </div>

        <div className="mt-2 border-t border-lineSoft pt-2">
          <div role="radiogroup" aria-label="Font" className="grid grid-cols-2 gap-1">
            {FONTS.map((f) => (
              <button
                key={f.id}
                type="button"
                role="radio"
                aria-checked={fontId === f.id}
                onClick={() => setFont(f.family)}
                className={cn(
                  'h-8 rounded-wobbly-sm px-2 text-left text-[13px] transition-colors',
                  f.sample,
                  fontId === f.id ? 'bg-postit text-postit-ink' : 'text-muted hover:bg-raise hover:text-ink',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-muted">Size</span>
            <div className="inline-flex items-center rounded-wobbly-sm border border-lineSoft">
              <button type="button" aria-label="Smaller text" onClick={() => stepSize(-1)} className="grid size-8 place-items-center text-muted hover:text-ink">
                <Minus size={14} />
              </button>
              <span className="w-12 text-center text-xs tabular-nums">{currentSize}px</span>
              <button type="button" aria-label="Larger text" onClick={() => stepSize(1)} className="grid size-8 place-items-center text-muted hover:text-ink">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          </div>
          {!full && (
            <div className="mt-2 flex items-center gap-1 border-t border-lineSoft pt-2">
              <ToolButton icon={Strikethrough} label="Strikethrough" active={s.strike} onClick={() => chain().toggleStrike().run()} />
              <ToolButton icon={Code} label="Inline code" active={s.code} onClick={() => chain().toggleCode().run()} />
              <span className="mx-1 h-5 w-px bg-lineSoft" aria-hidden="true" />
              {ALIGNS.map((a) => (
                <ToolButton
                  key={a.id}
                  icon={a.icon}
                  label={a.label}
                  active={s.align === a.id}
                  onClick={() => chain().setTextAlign(a.id).run()}
                />
              ))}
            </div>
          )}
        </div>
      </Popover>

      {/* ---------------------------- Align popover --------------------------- */}
      <Popover open={menu === 'align'} anchor={alignRef.current} onClose={close} ariaLabel="Alignment" className="p-1.5">
        <div role="radiogroup" aria-label="Alignment" className="flex items-center gap-0.5">
          {ALIGNS.map((a) => (
            <ToolButton
              key={a.id}
              icon={a.icon}
              label={a.label}
              active={s.align === a.id}
              tooltipSide="top"
              data-autofocus={s.align === a.id || undefined}
              onClick={() => {
                chain().setTextAlign(a.id).run()
                close()
              }}
            />
          ))}
        </div>
      </Popover>

      {/* ----------------------------- List popover --------------------------- */}
      <Popover open={menu === 'list'} anchor={listRef.current} onClose={close} ariaLabel="Lists" className="p-1.5">
        <div className="flex items-center gap-0.5">
          <ToolButton icon={List} label="Bullet list" active={s.bulletList} tooltipSide="top" data-autofocus onClick={() => { chain().toggleBulletList().run(); close() }} />
          <ToolButton icon={ListOrdered} label="Numbered list" active={s.orderedList} tooltipSide="top" onClick={() => { chain().toggleOrderedList().run(); close() }} />
          <ToolButton icon={ListChecks} label="Checklist — type [ ] and space" active={s.taskList} tooltipSide="top" onClick={() => { chain().toggleTaskList().run(); close() }} />
        </div>
      </Popover>

      {/* ---------------------------- Insert popover -------------------------- */}
      <Popover open={menu === 'insert'} anchor={insertRef.current} onClose={close} ariaLabel="Insert" align="end" className="w-[196px] p-1.5">
        <div className="space-y-0.5">
          {(
            [
              { icon: Link2, label: s.link ? 'Edit link…' : 'Link…', active: s.link, run: () => setLinkDialogOpen(true) },
              { icon: ImagePlus, label: 'Image…', active: false, run: () => void pickAndInsertImage(editor) },
              { icon: Quote, label: 'Quote', active: s.blockquote, run: () => chain().toggleBlockquote().run() },
              { icon: Braces, label: 'Code block', active: s.codeBlock, run: () => chain().toggleCodeBlock().run() },
              { icon: Minus, label: 'Divider', active: false, run: () => chain().setHorizontalRule().run() },
            ] as { icon: LucideIcon; label: string; active: boolean; run: () => void }[]
          ).map((item, i) => (
            <button
              key={item.label}
              type="button"
              data-autofocus={i === 0 || undefined}
              onClick={() => {
                close()
                item.run()
              }}
              className={cn(
                'flex h-8 w-full items-center gap-2.5 rounded-wobbly-sm px-2 text-left text-[13px] transition-colors',
                item.active ? 'bg-postit text-postit-ink' : 'text-ink hover:bg-raise',
              )}
            >
              <item.icon size={15} className="text-muted" aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
      </Popover>

      {linkDialogOpen && <LinkDialog editor={editor} onClose={() => setLinkDialogOpen(false)} />}
    </>
  )
}

/* ------------------------------- Link dialog ------------------------------ */

function LinkDialog({ editor, onClose }: { editor: Editor; onClose: () => void }): ReactNode {
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
