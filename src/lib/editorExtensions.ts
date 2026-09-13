import { Extension, InputRule } from '@tiptap/core'
import type { Extensions } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import ImageExtension from '@tiptap/extension-image'
import { Placeholder } from '@tiptap/extensions'
import { FontFamily, FontSize, TextStyle } from '@tiptap/extension-text-style'
import { TextAlign } from '@tiptap/extension-text-align'

/* ---------------------------------------------------------------------------
   The one Tiptap schema Tala uses. NoteEditor mounts it, document importers
   (DOCX/PPTX → Tiptap JSON via generateJSON) and tests build content against
   it, so every producer and consumer agrees on which nodes/marks exist.

   StarterKit 3 already bundles Underline, Link, ListItem, BulletList,
   OrderedList and ListKeymap — registering Underline a second time used to
   log "Duplicate extension names found: ['underline']" on every mount.
--------------------------------------------------------------------------- */

/** `[ ] ` / `[x] ` at the start of a line creates a checklist item. */
export const TaskSyntaxInput = Extension.create({
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

export const EDITOR_PLACEHOLDER =
  'Start writing…   "# " heading · "- " list · "[ ] " task · "> " quote · "```" code'

export interface EditorExtensionOptions {
  /** Placeholder text; omit (or pass null) for headless use such as importers. */
  placeholder?: string | null
}

/** Extensions shared by the live editor and headless conversions. */
export function buildEditorExtensions(opts: EditorExtensionOptions = {}): Extensions {
  const exts: Extensions = [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      link: { openOnClick: false, autolink: true },
    }),
    TaskList,
    TaskItem.configure({ nested: true }),
    ImageExtension,
    TextStyle,
    FontFamily,
    FontSize,
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskSyntaxInput,
  ]
  if (opts.placeholder !== null) {
    exts.push(Placeholder.configure({ placeholder: opts.placeholder ?? EDITOR_PLACEHOLDER }))
  }
  return exts
}
