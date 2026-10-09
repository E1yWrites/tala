import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { EditorView } from '@tiptap/pm/view'
import { dayKey } from '@/coach/study'
import { entryContext, entryLabel, parseLine, suggestMarker } from '@/entries/parse'

/*
  Pagtatala in the editor. The text stays the record; this only
  - pins a line to the day it became an entry (`at` on its paragraph), so
    "quiz fri" keeps meaning that Friday, and
  - shows what a line became as a chip after it ("−₱150 · GCash", "Fri 9 Oct"),
    and on journal pages offers to mark look-alike lines ("150 lunch" → "P150 lunch").
*/

export interface EntryLinesOptions {
  /** The journal day of this page; null on ordinary pages. */
  day: string | null
  /** Pin for lines written before pinning existed: the journal day, else the day the page was made. */
  fallback: string
}

const chipsKey = new PluginKey<DecorationSet>('entryChips')

/** Ranges of the final doc that `trs` touched. */
function touched(trs: readonly Transaction[]): Array<[number, number]> {
  let ranges: Array<[number, number]> = []
  for (const tr of trs) {
    ranges = ranges.map(([a, b]) => [tr.mapping.map(a, -1), tr.mapping.map(b, 1)])
    tr.mapping.maps.forEach((map, i) => {
      const after = tr.mapping.slice(i + 1)
      map.forEach((_a, _b, from, to) => ranges.push([after.map(from, -1), after.map(to, 1)]))
    })
  }
  return ranges
}

const inTask = (parent: PMNode | null): boolean => parent?.type.name === 'taskItem'

function chip(label: string, kind: string): () => HTMLElement {
  return () => {
    const el = document.createElement('span')
    el.className = `entry-chip entry-chip-${kind}`
    el.contentEditable = 'false'
    el.textContent = label
    return el
  }
}

function suggestion(marker: string, label: string): (view: EditorView, getPos: () => number | undefined) => HTMLElement {
  return (view, getPos) => {
    const el = document.createElement('button')
    el.type = 'button'
    el.className = 'entry-chip entry-chip-suggest'
    el.contentEditable = 'false'
    el.textContent = `${label}?`
    el.setAttribute('aria-label', `Make this line an entry: ${label}`)
    el.addEventListener('mousedown', (e) => e.preventDefault()) // keep the caret where it is
    el.addEventListener('click', () => {
      const pos = getPos()
      if (pos === undefined || !view.editable) return
      view.dispatch(view.state.tr.insertText(marker, view.state.doc.resolve(pos).start()))
    })
    return el
  }
}

export const EntryLines = Extension.create<EntryLinesOptions>({
  name: 'entryLines',

  addOptions() {
    return { day: null, fallback: dayKey(Date.now()) }
  },

  addGlobalAttributes() {
    return [
      {
        types: ['paragraph'],
        attributes: {
          at: {
            default: null,
            // Enter starts a new line, written now: it must not inherit the old line's day
            keepOnSplit: false,
            parseHTML: (el) => el.getAttribute('data-at'),
            renderHTML: (attrs) => (attrs.at ? { 'data-at': attrs.at } : {}),
          },
        },
      },
    ]
  },

  addProseMirrorPlugins() {
    const { day, fallback } = this.options

    const build = (doc: PMNode): DecorationSet => {
      const ctx = entryContext()
      const decos: Decoration[] = []
      doc.descendants((node, pos, parent) => {
        if (node.type.name !== 'paragraph') return true
        const text = node.textContent
        if (!text.trim()) return false
        const pinned = (node.attrs.at as string | null) ?? fallback
        const end = pos + node.nodeSize - 1
        const entry = parseLine(text, pinned, ctx, inTask(parent))
        const label = entry ? entryLabel(entry) : ''
        if (entry && label) {
          decos.push(Decoration.widget(end, chip(label, entry.kind), { side: 1, key: `c|${entry.kind}|${label}`, stopEvent: () => true }))
        } else if (!entry && day && !inTask(parent)) {
          const marker = suggestMarker(text, pinned, ctx)
          const would = marker && parseLine(marker + text.trim(), pinned, ctx)
          if (marker && would) {
            const l = entryLabel(would)
            decos.push(Decoration.widget(end, suggestion(marker, l), { side: 1, key: `s|${marker}|${l}`, stopEvent: () => true }))
          }
        }
        return false
      })
      return DecorationSet.create(doc, decos)
    }

    return [
      new Plugin({
        // Pin new entry lines to the day they were written. Only user edits:
        // reloading a page (setContent with preventUpdate) must not re-date old lines.
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((t) => t.docChanged) || trs.some((t) => t.getMeta('preventUpdate'))) return null
          const today = day ?? dayKey(Date.now())
          let tr: Transaction | null = null
          for (const [from, to] of touched(trs)) {
            const a = Math.max(0, from - 1)
            const b = Math.min(state.doc.content.size, to + 1)
            state.doc.nodesBetween(a, b, (node, pos, parent) => {
              if (node.type.name !== 'paragraph') return true
              if (node.attrs.at) return false
              const entry = parseLine(node.textContent, today, entryContext(), inTask(parent))
              const datedTask = entry?.kind !== 'task' || !!(entry.when || entry.due)
              if (entry && datedTask) {
                tr ??= state.tr
                tr.setNodeMarkup(pos, undefined, { ...node.attrs, at: today })
              }
              return false
            })
          }
          return tr
        },
      }),
      new Plugin({
        key: chipsKey,
        state: {
          init: (_config, state) => build(state.doc),
          apply: (tr, old, _oldState, state) => (tr.docChanged ? build(state.doc) : old),
        },
        props: { decorations: (state) => chipsKey.getState(state) },
      }),
    ]
  },
})
