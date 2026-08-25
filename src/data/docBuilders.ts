import type { JSONContent } from '@tiptap/core'

/* ---------------------------------------------------------------------------
   Tiny builders for constructing Tiptap documents declaratively.
   Used by the template gallery and anywhere structured docs are needed.
--------------------------------------------------------------------------- */

export const txt = (text: string): JSONContent => ({ type: 'text', text })

export const p = (
  ...content: Array<string | JSONContent>
): JSONContent => ({
  type: 'paragraph',
  content: content.map((c) => (typeof c === 'string' ? txt(c) : c)),
})

export const emptyP = (): JSONContent => ({ type: 'paragraph' })

export const h = (level: 1 | 2 | 3, text: string): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content: [txt(text)],
})

const listItem = (child: JSONContent): JSONContent => ({
  type: 'listItem',
  content: [child],
})

export const bulletList = (
  ...items: Array<string | JSONContent>
): JSONContent => ({
  type: 'bulletList',
  content: items.map((i) =>
    typeof i === 'string' ? listItem(p(i)) : listItem(i),
  ),
})

export const orderedList = (
  ...items: Array<string | JSONContent>
): JSONContent => ({
  type: 'orderedList',
  content: items.map((i) =>
    typeof i === 'string' ? listItem(p(i)) : listItem(i),
  ),
})

export const taskItem = (
  checked: boolean,
  text: string,
): JSONContent => ({
  type: 'taskItem',
  attrs: { checked },
  content: [p(text)],
})

export const taskList = (
  ...items: Array<[checked: boolean, text: string] | JSONContent>
): JSONContent => ({
  type: 'taskList',
  content: items.map((i) =>
    Array.isArray(i)
      ? taskItem(i[0], i[1])
      : i,
  ),
})

export const quote = (text: string): JSONContent => ({
  type: 'blockquote',
  content: [p(text)],
})

export const codeBlock = (language: string | null, code: string): JSONContent => ({
  type: 'codeBlock',
  attrs: { language },
  content: [{ type: 'text', text: code }],
})

export const hr: JSONContent = { type: 'horizontalRule' }

export const doc = (...children: JSONContent[]): JSONContent => ({
  type: 'doc',
  content: children,
})
