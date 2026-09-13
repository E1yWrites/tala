import { describe, expect, it } from 'vitest'
import { Editor, generateHTML, generateJSON } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import type { Transaction } from '@tiptap/pm/state'
import { buildEditorExtensions } from './editorExtensions'

/* ---------------------------------------------------------------------------
   Bullet / numbered list regression coverage. The original bug was CSS-only
   (Tailwind preflight's `list-style: none` was never overridden), but these
   tests pin down the half of the contract that lives in the schema: real
   bulletList / orderedList / listItem nodes, keyboard behaviour, nesting and
   JSON round-tripping through persistence.

   StarterKit 3 appends a trailing empty paragraph (TrailingNode); `html()`
   strips it so assertions read like the user-visible document.
--------------------------------------------------------------------------- */

const extensions = buildEditorExtensions({ placeholder: null })

function makeEditor(content: JSONContent | string = ''): Editor {
  const el = document.createElement('div')
  document.body.appendChild(el)
  return new Editor({ element: el, extensions, content })
}

const html = (editor: Editor): string => editor.getHTML().replace(/<p><\/p>$/, '')

function pressKey(editor: Editor, key: string, init: KeyboardEventInit = {}): void {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
  // jsdom has no editing behaviour of its own; route straight into
  // ProseMirror's keymap the way the view would on a real keydown.
  editor.view.someProp('handleKeyDown', (f) => f(editor.view, ev))
}

/** Emulate typing `text` at the cursor so input rules run. */
function typeText(editor: Editor, text: string): void {
  for (const ch of text) {
    const { from, to } = editor.state.selection
    const deflt = (): Transaction => editor.state.tr.insertText(ch, from, to)
    const handled = editor.view.someProp('handleTextInput', (f) => f(editor.view, from, to, ch, deflt))
    if (!handled) editor.view.dispatch(editor.state.tr.insertText(ch, from, to))
  }
}

/** Cursor right after the last character of the first list's last item. */
function cursorToEndOfListText(editor: Editor): void {
  let pos = 0
  editor.state.doc.descendants((node, p) => {
    if (node.isText) pos = p + node.nodeSize
    return true
  })
  editor.commands.setTextSelection(pos)
}

describe('editor schema: lists', () => {
  it('registers every list node once (no duplicate extension names)', () => {
    const editor = makeEditor()
    const names = editor.extensionManager.extensions.map((e) => e.name)
    for (const n of ['bulletList', 'orderedList', 'listItem', 'taskList', 'taskItem', 'underline']) {
      expect(names.filter((x) => x === n)).toHaveLength(1)
    }
    editor.destroy()
  })

  it('toggleBulletList produces bulletList > listItem > paragraph', () => {
    const editor = makeEditor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'apples' }] }] })
    editor.commands.setTextSelection(2)
    editor.commands.toggleBulletList()
    const json = editor.getJSON() as JSONContent
    const list = json.content?.[0] as JSONContent
    expect(list.type).toBe('bulletList')
    const item = list.content?.[0] as JSONContent
    expect(item.type).toBe('listItem')
    expect(item.content?.[0]?.type).toBe('paragraph')
    expect(html(editor)).toBe('<ul><li><p>apples</p></li></ul>')
    editor.destroy()
  })

  it('toggleOrderedList produces orderedList with a start attribute', () => {
    const editor = makeEditor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] })
    editor.commands.setTextSelection(2)
    editor.commands.toggleOrderedList()
    const json = editor.getJSON()
    expect(json.content?.[0]?.type).toBe('orderedList')
    expect(json.content?.[0]?.attrs?.start).toBe(1)
    expect(html(editor)).toBe('<ol><li><p>one</p></li></ol>')
    editor.destroy()
  })

  it('"- " and "1. " input rules create lists while typing', () => {
    const bullets = makeEditor()
    bullets.commands.setTextSelection(1)
    typeText(bullets, '- milk')
    expect(html(bullets)).toBe('<ul><li><p>milk</p></li></ul>')

    const numbered = makeEditor()
    numbered.commands.setTextSelection(1)
    typeText(numbered, '1. first')
    expect(html(numbered)).toBe('<ol><li><p>first</p></li></ol>')
    bullets.destroy()
    numbered.destroy()
  })

  it('Enter splits into a new list item; Enter on an empty item leaves the list', () => {
    const editor = makeEditor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] })
    editor.commands.setTextSelection(2)
    editor.commands.toggleBulletList()
    cursorToEndOfListText(editor)
    pressKey(editor, 'Enter')
    expect((editor.getJSON().content?.[0] as JSONContent).content).toHaveLength(2)
    typeText(editor, 'second')
    expect(html(editor)).toBe('<ul><li><p>first</p></li><li><p>second</p></li></ul>')

    pressKey(editor, 'Enter') // third, empty item
    expect(editor.getJSON().content?.[0]?.content).toHaveLength(3)
    pressKey(editor, 'Enter') // empty item → lift out of the list
    const json = editor.getJSON()
    expect(json.content?.[0]?.content).toHaveLength(2)
    expect(json.content?.[1]?.type).toBe('paragraph')
    editor.destroy()
  })

  it('Tab nests, Shift+Tab lifts (sink / lift list item)', () => {
    const editor = makeEditor({
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'parent' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'child' }] }] },
          ],
        },
      ],
    })
    cursorToEndOfListText(editor)
    pressKey(editor, 'Tab')
    expect(html(editor)).toBe('<ul><li><p>parent</p><ul><li><p>child</p></li></ul></li></ul>')
    pressKey(editor, 'Tab', { shiftKey: true })
    expect(html(editor)).toBe('<ul><li><p>parent</p></li><li><p>child</p></li></ul>')
    editor.destroy()
  })

  it('Backspace at the start of the only item exits the list', () => {
    const editor = makeEditor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'solo' }] }] })
    editor.commands.setTextSelection(2)
    editor.commands.toggleBulletList()
    editor.commands.setTextSelection(3) // start of "solo" inside ul > li > p
    pressKey(editor, 'Backspace')
    const json = editor.getJSON()
    expect(json.content?.[0]?.type).toBe('paragraph')
    expect((json.content?.[0] as JSONContent).content?.[0]?.text).toBe('solo')
    editor.destroy()
  })

  it('undo / redo restore list structure', () => {
    const editor = makeEditor({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] })
    editor.commands.setTextSelection(2)
    editor.commands.toggleOrderedList()
    expect(editor.getJSON().content?.[0]?.type).toBe('orderedList')
    editor.commands.undo()
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph')
    editor.commands.redo()
    expect(editor.getJSON().content?.[0]?.type).toBe('orderedList')
    editor.destroy()
  })

  it('nested mixed lists survive a JSON → HTML → JSON round trip (persistence + reload)', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'orderedList',
          attrs: { start: 3, type: null },
          content: [
            {
              type: 'listItem',
              content: [
                { type: 'paragraph', content: [{ type: 'text', text: 'step' }] },
                {
                  type: 'bulletList',
                  content: [
                    { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'detail' }] }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const expectedHtml = '<ol start="3"><li><p>step</p><ul><li><p>detail</p></li></ul></li></ol>'
    // Same path the app takes: stored JSON → editor → getJSON (autosave) → reload
    const editor = makeEditor(doc)
    const persisted = editor.getJSON()
    expect(html(editor)).toBe(expectedHtml)
    const reloaded = makeEditor(persisted)
    expect(html(reloaded)).toBe(expectedHtml)
    expect(reloaded.getJSON()).toEqual(persisted)
    // Headless conversions (importers) agree with the live editor
    expect(generateHTML(persisted, extensions).replace(/<p><\/p>$/, '')).toBe(expectedHtml)
    expect(generateHTML(generateJSON(expectedHtml, extensions), extensions)).toBe(expectedHtml)
    editor.destroy()
    reloaded.destroy()
  })
})
