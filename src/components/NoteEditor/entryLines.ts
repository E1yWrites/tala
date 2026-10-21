import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import type { Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { dayKey } from '@/coach/study'
import { entryContext, entryLabel, parseLine } from '@/entries/parse'

/*
  Tasks in the editor. Notes are for notes: the only lines read here are
  checklist items. The text stays the record; this only
  - pins a dated task to the day it was written (`at` on its paragraph), so
    "quiz fri" keeps meaning that Friday, and
  - shows its date as a chip after it ("Fri 9 Oct").
*/

export interface EntryLinesOptions {
  /** Pin for tasks written before pinning existed: the day the page was made. */
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

export const EntryLines = Extension.create<EntryLinesOptions>({
  name: 'entryLines',

  addOptions() {
    return { fallback: dayKey(Date.now()) }
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
    const { fallback } = this.options

    const build = (doc: PMNode): DecorationSet => {
      const ctx = entryContext()
      const decos: Decoration[] = []
      doc.descendants((node, pos, parent) => {
        if (node.type.name !== 'paragraph') return true
        const text = node.textContent
        if (!text.trim() || !inTask(parent)) return false
        const entry = parseLine(text, (node.attrs.at as string | null) ?? fallback, ctx, true)
        const label = entry ? entryLabel(entry) : ''
        if (entry && label) {
          decos.push(Decoration.widget(pos + node.nodeSize - 1, chip(label, entry.kind), { side: 1, key: `c|${entry.kind}|${label}`, stopEvent: () => true }))
        }
        return false
      })
      return DecorationSet.create(doc, decos)
    }

    return [
      new Plugin({
        // Pin new dated tasks to the day they were written. Only user edits:
        // reloading a page (setContent with preventUpdate) must not re-date old lines.
        appendTransaction: (trs, _old, state) => {
          if (!trs.some((t) => t.docChanged) || trs.some((t) => t.getMeta('preventUpdate'))) return null
          const today = dayKey(Date.now())
          let tr: Transaction | null = null
          for (const [from, to] of touched(trs)) {
            const a = Math.max(0, from - 1)
            const b = Math.min(state.doc.content.size, to + 1)
            state.doc.nodesBetween(a, b, (node, pos, parent) => {
              if (node.type.name !== 'paragraph') return true
              if (node.attrs.at || !inTask(parent)) return false
              const entry = parseLine(node.textContent, today, entryContext(), true)
              if (entry?.kind === 'task' && (entry.when || entry.due)) {
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
