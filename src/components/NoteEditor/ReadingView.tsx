import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { JSONContent } from '@tiptap/core'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/utils/cn'

/* ---------------------------------------------------------------------------
   ReadingView — a structured, read-only presentation of a note's Tiptap JSON.

   H2 headings become collapsible sections (state persisted per note);
   inside each section, an H3 heading plus the blocks that follow it are
   grouped into compact cards laid out in a responsive grid. Loose blocks
   (paragraphs, quotes, code, images, lists) flow full-width between cards.

   The DOM mirrors ProseMirror's output and is rendered inside a `.tiptap`
   element so every editor style (Kalam headings, ballpoint quotes, sketchy
   code blocks, hand-drawn checkboxes) applies unchanged.
--------------------------------------------------------------------------- */

const COLLAPSE_KEY_PREFIX = 'tala:reading-collapsed:'

interface Section {
  id: string
  heading: JSONContent
  body: JSONContent[]
}

type BodyPiece =
  | { kind: 'flow'; blocks: JSONContent[] }
  | { kind: 'card'; heading: JSONContent; blocks: JSONContent[] }

function headingText(node: JSONContent): string {
  return (node.content ?? [])
    .map((c) => c.text ?? '')
    .join('')
    .trim()
}

function slug(text: string): string {
  const s = text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  return s.slice(0, 24) || 'section'
}

/** Split top-level children into preamble + H2-delimited sections. */
function splitSections(children: JSONContent[]): {
  preamble: JSONContent[]
  sections: Section[]
} {
  const preamble: JSONContent[] = []
  const sections: Section[] = []
  let current: Section | null = null
  for (const child of children) {
    if (child.type === 'heading' && child.attrs?.level === 2) {
      const id = `s${sections.length}-${slug(headingText(child))}`
      current = { id, heading: child, body: [] }
      sections.push(current)
    } else if (current) {
      current.body.push(child)
    } else {
      preamble.push(child)
    }
  }
  return { preamble, sections }
}

/** Group a section body into full-width flow blocks and H3-headed cards. */
function splitCards(body: JSONContent[]): BodyPiece[] {
  const pieces: BodyPiece[] = []
  let card: Extract<BodyPiece, { kind: 'card' }> | null = null
  for (const node of body) {
    if (node.type === 'heading' && node.attrs?.level === 3) {
      card = { kind: 'card', heading: node, blocks: [] }
      pieces.push(card)
    } else if (card) {
      card.blocks.push(node)
    } else {
      const last = pieces[pieces.length - 1]
      if (last && last.kind === 'flow') last.blocks.push(node)
      else pieces.push({ kind: 'flow', blocks: [node] })
    }
  }
  return pieces
}

function readCollapsed(noteId: string): Set<string> {
  try {
    const raw = localStorage.getItem(COLLAPSE_KEY_PREFIX + noteId)
    return raw ? new Set(JSON.parse(raw) as string[]) : new Set()
  } catch {
    return new Set()
  }
}

/* ------------------------------ Inline content ----------------------------- */

function renderMarksText(node: JSONContent, keyPrefix: string): ReactNode {
  const text = node.text ?? ''
  const marks = node.marks ?? []
  let out: ReactNode = text
  // Wrap from the innermost mark outward; order barely matters visually here.
  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i]
    const key = `${keyPrefix}-m${i}`
    switch (mark.type) {
      case 'bold':
        out = <strong key={key}>{out}</strong>
        break
      case 'italic':
        out = <em key={key}>{out}</em>
        break
      case 'underline':
        out = <u key={key}>{out}</u>
        break
      case 'strike':
        out = <del key={key}>{out}</del>
        break
      case 'code':
        out = <code key={key}>{out}</code>
        break
      case 'link': {
        const href = String(mark.attrs?.href ?? '#')
        out = (
          <a key={key} href={href} onClick={(e) => e.preventDefault()}>
            {out}
          </a>
        )
        break
      }
      default:
        break
    }
  }
  return out
}

function renderInline(nodes: JSONContent[] | undefined, keyPrefix: string): ReactNode {
  if (!nodes) return null
  return nodes.map((node, i) => {
    const key = `${keyPrefix}-${i}`
    if (node.type === 'hardBreak') return <br key={key} />
    if (node.type === 'image') {
      return <img key={key} src={String(node.attrs?.src ?? '')} alt={String(node.attrs?.alt ?? '')} />
    }
    if (node.type === 'text') return <span key={key}>{renderMarksText(node, key)}</span>
    return null
  })
}

/* ------------------------------ Block content ------------------------------ */

function renderBlock(node: JSONContent, key: string): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return <p key={key}>{renderInline(node.content, key)}</p>

    case 'heading': {
      const level = Math.min(3, Math.max(1, Number(node.attrs?.level ?? 3)))
      const inner = renderInline(node.content, key)
      if (level === 1) return <h1 key={key}>{inner}</h1>
      if (level === 2) return <h2 key={key}>{inner}</h2>
      return <h3 key={key}>{inner}</h3>
    }

    case 'bulletList':
      return (
        <ul key={key}>
          {(node.content ?? []).map((li, i) => (
            <li key={`${key}-${i}`}>{renderListChildren(li.content, `${key}-${i}`)}</li>
          ))}
        </ul>
      )

    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1)
      return (
        <ol key={key} start={start > 1 ? start : undefined}>
          {(node.content ?? []).map((li, i) => (
            <li key={`${key}-${i}`}>{renderListChildren(li.content, `${key}-${i}`)}</li>
          ))}
        </ol>
      )
    }

    case 'taskList':
      return (
        <ul data-type="taskList" key={key}>
          {(node.content ?? []).map((li, i) => {
            const checked = li.attrs?.checked === true
            return (
              <li key={`${key}-${i}`} data-checked={checked}>
                <label>
                  <input type="checkbox" checked={checked} disabled readOnly />
                </label>
                <div>{renderListChildren(li.content, `${key}-${i}`)}</div>
              </li>
            )
          })}
        </ul>
      )

    case 'blockquote':
      return (
        <blockquote key={key}>
          {(node.content ?? []).map((child, i) => renderBlock(child, `${key}-${i}`))}
        </blockquote>
      )

    case 'codeBlock': {
      const lang = String(node.attrs?.language ?? '')
      const codeText = (node.content ?? [])
        .map((c) => c.text ?? '')
        .join('\n')
      return (
        <pre key={key} data-language={lang || undefined}>
          <code className={lang ? `language-${lang}` : undefined}>{codeText}</code>
        </pre>
      )
    }

    case 'image':
      return (
        <img
          key={key}
          src={String(node.attrs?.src ?? '')}
          alt={String(node.attrs?.alt ?? '')}
        />
      )

    case 'horizontalRule':
      return <hr key={key} />

    default:
      return null
  }
}

/** List items contain paragraphs / nested lists / taskLists directly. */
function renderListChildren(children: JSONContent[] | undefined, keyPrefix: string): ReactNode {
  if (!children) return null
  return children.map((child, i) => {
    const key = `${keyPrefix}-${i}`
    if (child.type === 'paragraph') return <p key={key}>{renderInline(child.content, key)}</p>
    if (child.type === 'bulletList' || child.type === 'orderedList' || child.type === 'taskList' || child.type === 'blockquote') {
      return renderBlock(child, key)
    }
    if (child.type === 'heading') return renderBlock(child, key)
    return null
  })
}

/* ------------------------------- Components -------------------------------- */

function FlowBlocks({ blocks, idPrefix }: { blocks: JSONContent[]; idPrefix: string }): ReactNode {
  return (
    <>
      {blocks.map((block, i) => renderBlock(block, `${idPrefix}-f${i}`))}
    </>
  )
}

/** Consecutive H3 cards render side-by-side; flow pieces stay full-width. */
function BodyPieces({ pieces, idPrefix }: { pieces: BodyPiece[]; idPrefix: string }): ReactNode {
  const runs: Array<
    | { kind: 'flow'; blocks: JSONContent[]; key: string }
    | { kind: 'cards'; cards: Array<Extract<BodyPiece, { kind: 'card' }>>; key: string }
  > = []
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!
    const key = `${idPrefix}-${i}`
    if (piece.kind === 'card') {
      const last = runs[runs.length - 1]
      if (last && last.kind === 'cards') last.cards.push(piece)
      else runs.push({ kind: 'cards', cards: [piece], key })
    } else {
      runs.push({ kind: 'flow', blocks: piece.blocks, key })
    }
  }

  return (
    <>
      {runs.map((run) =>
        run.kind === 'flow' ? (
          <FlowBlocks key={run.key} blocks={run.blocks} idPrefix={`${run.key}-f`} />
        ) : (
          <div
            key={run.key}
            className="mb-3 grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]"
          >
            {run.cards.map((card, i) => (
              <article
                key={`${run.key}-${i}`}
                className="rounded-wobbly-sm border border-lineSoft bg-panel px-4 py-3 transition-colors duration-150 hover:bg-raise/40"
              >
                <h4 className="font-display text-base leading-snug">
                  {headingText(card.heading) || 'Untitled'}
                </h4>
                <FlowBlocks blocks={card.blocks} idPrefix={`${run.key}-${i}`} />
              </article>
            ))}
          </div>
        ),
      )}
    </>
  )
}

function CollapsibleSection({
  section,
  index,
  collapsed,
  onToggle,
}: {
  section: Section
  index: number
  collapsed: boolean
  onToggle: () => void
}): ReactNode {
  const pieces = useMemo(() => splitCards(section.body), [section.body])
  return (
    <section className="mt-6 first:mt-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="-ml-1 flex w-full items-center gap-2 rounded-wobbly-sm px-1 py-1 text-left transition-colors duration-150 hover:bg-raise/60"
      >
        <ChevronRight
          size={18}
          strokeWidth={2.75}
          aria-hidden="true"
          className={cn(
            'shrink-0 text-accent transition-transform duration-200',
            !collapsed && 'rotate-90',
          )}
        />
        <span className="font-display text-[22px] leading-tight underline decoration-wavy decoration-lineSoft underline-offset-[6px]">
          {headingText(section.heading) || `Section ${index + 1}`}
        </span>
      </button>

      <div className="rv-collapse" data-closed={collapsed}>
        <div className="rv-collapse-inner">
          <div className="pb-2 pt-2">
            {pieces.length === 0 && <p className="text-sm text-faint">Empty section.</p>}
            <BodyPieces pieces={pieces} idPrefix={section.id} />
          </div>
        </div>
      </div>
    </section>
  )
}

export function ReadingView({
  noteId,
  doc,
}: {
  noteId: string
  doc: JSONContent | null
}): ReactNode {
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => readCollapsed(noteId))

  const { preamble, sections } = useMemo(
    () => splitSections(doc?.content ?? []),
    [doc],
  )

  const toggle = (id: string): void => {
    setCollapsedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(COLLAPSE_KEY_PREFIX + noteId, JSON.stringify([...next]))
      } catch { /* ignore */ }
      return next
    })
  }

  const empty = (doc?.content ?? []).length === 0

  if (empty) {
    return <p className="text-sm italic text-faint">Nothing to read yet — this note is empty.</p>
  }

  return (
    <div className="tiptap reading-view select-text" aria-label="Reading layout">
      {/* Preamble flows like normal prose (also covers notes with no H2s) */}
      {preamble.length > 0 && <FlowBlocks blocks={preamble} idPrefix="pre" />}

      {sections.map((section, i) => (
        <CollapsibleSection
          key={section.id}
          section={section}
          index={i}
          collapsed={collapsedIds.has(section.id)}
          onToggle={() => toggle(section.id)}
        />
      ))}
    </div>
  )
}
