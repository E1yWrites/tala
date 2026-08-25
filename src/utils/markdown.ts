import type { JSONContent } from '@tiptap/core'
import type { Note } from '@/types/models'
import { docToPlainText } from './doc'

/* ---------------------------------------------------------------------------
   Markdown / JSON / plain-text conversion for import & export.
   Export: Tiptap doc → Markdown. Import: Markdown → Tiptap doc.
--------------------------------------------------------------------------- */

/* --------------------------------- Export --------------------------------- */

function inlineToMarkdown(nodes: JSONContent[] | undefined): string {
  if (!nodes) return ''
  return nodes
    .map((node) => {
      if (node.type !== 'text') return inlineToMarkdown(node.content)
      let text = node.text ?? ''
      const marks = node.marks ?? []
      const types = marks.map((m) => m.type)
      if (types.includes('code')) return `\`${text}\``
      if (types.includes('bold')) text = `**${text}**`
      if (types.includes('italic')) text = `*${text}*`
      if (types.includes('strike')) text = `~~${text}~~`
      if (types.includes('underline')) text = `<u>${text}</u>`
      const link = marks.find((m) => m.type === 'link')
      if (link?.attrs?.href) text = `[${text}](${link.attrs.href as string})`
      return text
    })
    .join('')
}

export function docToMarkdown(docNode: JSONContent | null | undefined): string {
  if (!docNode?.content) return ''
  const lines: string[] = []

  const walkList = (items: JSONContent[], ordered: boolean, depth = 0): void => {
    const pad = '  '.repeat(depth)
    items.forEach((item, i) => {
      const marker = ordered ? `${i + 1}.` : '-'
      let first = true
      for (const child of item.content ?? []) {
        if (child.type === 'bulletList') {
          walkList(child.content ?? [], false, depth + 1)
          continue
        }
        if (child.type === 'orderedList') {
          walkList(child.content ?? [], true, depth + 1)
          continue
        }
        if (child.type === 'taskList') {
          child.content?.forEach((taskItem) => {
            const checked = taskItem.attrs?.checked === true
            taskItem.content?.forEach((tp) =>
              lines.push(`${pad}  - [${checked ? 'x' : ' '}] ${inlineToMarkdown(tp.content)}`),
            )
          })
          continue
        }
        const prefix = first ? `${pad}${marker} ` : `${pad}  `
        lines.push(`${prefix}${blockInline(child)}`)
        first = false
      }
    })
    if (depth === 0) lines.push('')
  }

  const blockInline = (n: JSONContent): string => inlineToMarkdown(n.content)

  const walk = (nodes: JSONContent[]): void => {
    for (const node of nodes) {
      switch (node.type) {
        case 'paragraph':
          lines.push(blockInline(node), '')
          break
        case 'heading': {
          const level = Number(node.attrs?.level ?? 1)
          lines.push(`${'#'.repeat(level)} ${blockInline(node)}`, '')
          break
        }
        case 'bulletList':
          walkList(node.content ?? [], false)
          break
        case 'orderedList':
          walkList(node.content ?? [], true)
          break
        case 'taskList':
          node.content?.forEach((item) => {
            const checked = item.attrs?.checked === true
            item.content?.forEach((tp) =>
              lines.push(`- [${checked ? 'x' : ' '}] ${blockInline(tp)}`),
            )
          })
          lines.push('')
          break
        case 'blockquote':
          node.content?.forEach((q) => lines.push(`> ${blockInline(q)}`))
          lines.push('')
          break
        case 'codeBlock': {
          const lang = (node.attrs?.language as string) || ''
          const code = (node.content ?? [])
            .map((c) => c.text ?? '')
            .join('\n')
          lines.push('```' + lang, code, '```', '')
          break
        }
        case 'horizontalRule':
          lines.push('---', '')
          break
        default:
          if (node.content) walk(node.content)
      }
    }
  }

  walk(docNode.content)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

export function noteToMarkdown(note: Note): string {
  const title = note.title.trim()
  const body = docToMarkdown(note.content)
  return title ? `# ${title}\n\n${body}` : body
}

export function noteToPlainText(note: Note): string {
  const title = note.title.trim()
  const body = docToPlainText(note.content)
  return title ? `${title}\n\n${body}` : body
}

/* ------------------------------- File helpers ----------------------------- */

export function sanitizeFilename(title: string): string {
  const base = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return base || 'untitled-note'
}

export function downloadTextFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
