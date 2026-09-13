import type { JSONContent } from '@tiptap/core'
import { generateJSON } from '@tiptap/core'
import { buildEditorExtensions } from '@/lib/editorExtensions'
import { MalformedFileError } from './formats'

/* ---------------------------------------------------------------------------
   Word / PowerPoint conversion. Nothing here parses OOXML by hand:

     DOCX → editable   mammoth (semantic HTML) → sanitised → Tiptap JSON
     DOCX → preserve   docx-preview (layout-faithful HTML) → self-contained
                       HTML document shown read-only in a sandboxed frame
     PPTX → editable   pptxtojson (slide element model) → outline HTML →
                       Tiptap JSON (one section per slide)
     PPTX → preserve   the same element model laid out at slide coordinates

   Every converter reports what it could not carry across so the AUTO
   strategy can choose, and the user can be told in plain words.
--------------------------------------------------------------------------- */

export interface EditableConversion {
  content: JSONContent
  /** Human-readable list of things that did not convert cleanly. */
  warnings: string[]
  /** True when the layout would be materially different from the original. */
  lossy: boolean
  /** Extracted plain text (search / previews). */
  text: string
}

export interface RenderedConversion {
  /** Complete, self-contained HTML document (inline styles + data: images). */
  html: string
  warnings: string[]
}

const extensions = buildEditorExtensions({ placeholder: null })

/* ------------------------------ HTML hygiene ------------------------------ */

const BLOCKED_TAGS = new Set(['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'svg', 'math'])

/**
 * Strips anything executable or externally-loading from converter output
 * before it reaches the editor: scripts, event handlers, javascript: URLs,
 * and images that are not inline data.
 */
export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const walk = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      if (BLOCKED_TAGS.has(child.tagName.toLowerCase())) {
        child.remove()
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase()
        const value = attr.value.trim()
        if (name.startsWith('on')) child.removeAttribute(attr.name)
        else if ((name === 'href' || name === 'src' || name === 'xlink:href') && /^\s*(javascript|vbscript|data:text\/html)/i.test(value)) {
          child.removeAttribute(attr.name)
        }
      }
      if (child.tagName.toLowerCase() === 'img') {
        const src = child.getAttribute('src') ?? ''
        if (!/^data:image\//i.test(src)) child.remove()
        else continue
      }
      walk(child)
    }
  }
  walk(doc.body)
  return doc.body.innerHTML
}

/** HTML → Tiptap JSON through the app's own schema. */
export function htmlToTiptap(html: string): JSONContent {
  const json = generateJSON(sanitizeHtml(html), extensions) as JSONContent
  return json.type === 'doc' ? json : { type: 'doc', content: [] }
}

function textOf(node: JSONContent): string {
  if (typeof node.text === 'string') return node.text
  return (node.content ?? []).map(textOf).join(node.type === 'paragraph' || node.type === 'heading' ? '' : ' ')
}

export function tiptapText(doc: JSONContent): string {
  const out: string[] = []
  const walk = (n: JSONContent): void => {
    if (n.type === 'paragraph' || n.type === 'heading') {
      out.push(textOf(n))
      return
    }
    ;(n.content ?? []).forEach(walk)
  }
  walk(doc)
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/* --------------------------------- DOCX ---------------------------------- */

interface MammothMessage {
  type: string
  message: string
}

export async function docxToEditable(bytes: ArrayBuffer): Promise<EditableConversion> {
  const mammoth = await import('mammoth')
  let result: { value: string; messages: MammothMessage[] }
  try {
    // Browser build reads `arrayBuffer`; the Node build (tests) wants `buffer`.
    const nodeBuffer = (globalThis as { Buffer?: { from(b: ArrayBuffer): unknown } }).Buffer
    const input = (nodeBuffer
      ? { arrayBuffer: bytes, buffer: nodeBuffer.from(bytes) }
      : { arrayBuffer: bytes }) as { arrayBuffer: ArrayBuffer }
    result = await mammoth.convertToHtml(
      input,
      {
        styleMap: [
          "p[style-name='Title'] => h1:fresh",
          "p[style-name='Subtitle'] => h2:fresh",
          "p[style-name='Heading 1'] => h1:fresh",
          "p[style-name='Heading 2'] => h2:fresh",
          "p[style-name='Heading 3'] => h3:fresh",
          "p[style-name='Heading 4'] => h3:fresh",
          "p[style-name='Quote'] => blockquote:fresh",
          "p[style-name='Intense Quote'] => blockquote:fresh",
          'u => u',
        ],
      },
    )
  } catch (err) {
    throw new MalformedFileError(
      `This Word document could not be read (${(err as Error).message || 'unknown error'}).`,
    )
  }
  const html = result.value
  const content = htmlToTiptap(html)
  const warnings: string[] = []
  const tables = (html.match(/<table\b/gi) ?? []).length
  if (tables > 0) warnings.push(`${tables} table${tables === 1 ? '' : 's'} flattened to text`)
  const unrecognised = result.messages.filter((m) => m.type === 'warning').length
  if (unrecognised > 0) warnings.push(`${unrecognised} element${unrecognised === 1 ? '' : 's'} could not be converted`)
  const text = tiptapText(content)
  if (!text && !/<img\b/i.test(html)) {
    warnings.push('No readable text was found')
  }
  return { content, warnings, lossy: tables > 0 || unrecognised >= 3, text }
}

/**
 * Layout-faithful rendering via docx-preview into a detached container,
 * captured as one self-contained HTML string. Needs a DOM (browser/jsdom).
 */
export async function docxToRendered(bytes: ArrayBuffer): Promise<RenderedConversion> {
  const { renderAsync } = await import('docx-preview')
  const body = document.createElement('div')
  const styles = document.createElement('div')
  try {
    await renderAsync(new Blob([bytes]), body, styles, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
      renderEndnotes: true,
      renderChanges: false,
      renderComments: false,
      experimental: true,
      className: 'docx',
    })
  } catch (err) {
    throw new MalformedFileError(
      `This Word document could not be rendered (${(err as Error).message || 'unknown error'}).`,
    )
  }
  const html = wrapStandaloneHtml(styles.innerHTML, body.innerHTML, 'docx')
  return { html, warnings: [] }
}

/** Builds a complete HTML document for the sandboxed viewer. */
export function wrapStandaloneHtml(styleHtml: string, bodyHtml: string, className: string): string {
  const base = `
    html, body { margin: 0; padding: 0; background: #e9e6df; }
    body { display: flex; flex-direction: column; align-items: flex-start; gap: 16px; padding: 16px; box-sizing: border-box; min-height: 100%; overflow: auto; }
    .docx-wrapper { background: transparent !important; padding: 0 !important; display: flex !important; flex-direction: column !important; gap: 16px; align-items: flex-start !important; justify-content: flex-start !important; }
    /* Pages are laid out at their true size; scale them down in narrow frames
       (zoom keeps text selectable, unlike a transform) */
    @media (max-width: 1000px) { .docx-wrapper, .tala-slide { zoom: 0.8; } }
    @media (max-width: 800px) { .docx-wrapper, .tala-slide { zoom: 0.6; } }
    @media (max-width: 560px) { .docx-wrapper, .tala-slide { zoom: 0.45; } }
    .docx-wrapper > section.docx { box-shadow: 0 2px 12px rgba(0,0,0,.14); background: #fff; margin: 0 !important; }
    .tala-slide { position: relative; overflow: hidden; background: #fff; box-shadow: 0 2px 12px rgba(0,0,0,.14); }
    .tala-slide > * { position: absolute; box-sizing: border-box; }
    .tala-slide p { margin: 0; }
    .tala-slide table { border-collapse: collapse; font-size: 12pt; }
    .tala-slide td { border: 1px solid #999; padding: 2pt 4pt; vertical-align: top; }
    .tala-placeholder { display: grid; place-items: center; border: 1px dashed #aaa; color: #777; font: 12px system-ui, sans-serif; background: rgba(0,0,0,.03); }
    @media (prefers-color-scheme: dark) { html, body { background: #2a2a2c; } }
  `
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>${base}</style>${styleHtml}</head><body class="${className}">${sanitizeRenderedHtml(bodyHtml)}</body></html>`
}

/** Same hygiene as sanitizeHtml but keeps data: fonts/images used by layout. */
function sanitizeRenderedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html')
  const strip = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      const tag = child.tagName.toLowerCase()
      if (tag === 'script' || tag === 'iframe' || tag === 'object' || tag === 'embed' || tag === 'form') {
        child.remove()
        continue
      }
      for (const attr of Array.from(child.attributes)) {
        const name = attr.name.toLowerCase()
        if (name.startsWith('on')) child.removeAttribute(attr.name)
        else if ((name === 'href' || name === 'src') && /^\s*(javascript|vbscript):/i.test(attr.value)) child.removeAttribute(attr.name)
        else if (name === 'src' && !/^data:/i.test(attr.value) && tag === 'img') child.removeAttribute(attr.name)
      }
      strip(child)
    }
  }
  strip(doc.body)
  return doc.body.innerHTML
}

/* --------------------------------- PPTX ---------------------------------- */

type PptxModule = typeof import('pptxtojson')
type PptxSlide = Awaited<ReturnType<PptxModule['parse']>>['slides'][number]
type PptxElement = PptxSlide['elements'][number]

interface PptxParsed {
  slides: PptxSlide[]
  size: { width: number; height: number }
}

async function parsePptx(bytes: ArrayBuffer): Promise<PptxParsed> {
  // ESM build exposes `parse` directly; the UMD build (Node interop) nests it.
  const mod = (await import('pptxtojson')) as unknown as { parse?: PptxModule['parse']; default?: { parse?: PptxModule['parse'] } }
  const parse = mod.parse ?? mod.default?.parse
  if (!parse) throw new MalformedFileError('The presentation converter is unavailable.')
  try {
    const parsed = await parse(bytes, { imageMode: 'base64', videoMode: 'none', audioMode: 'none' })
    if (!parsed || !Array.isArray(parsed.slides)) throw new Error('no slides')
    return { slides: parsed.slides, size: parsed.size }
  } catch (err) {
    throw new MalformedFileError(
      `This presentation could not be read (${(err as Error).message || 'unknown error'}).`,
    )
  }
}

const HEAVY_TYPES = new Set(['chart', 'diagram', 'table', 'math', 'video', 'audio'])

function flatten(elements: PptxElement[]): PptxElement[] {
  const out: PptxElement[] = []
  for (const el of elements) {
    if (el.type === 'group') out.push(...flatten((el as { elements: PptxElement[] }).elements ?? []))
    else out.push(el)
  }
  return out
}

/** Slide → outline HTML (headings, paragraphs, images, table text, notes). */
function slideToOutlineHtml(slide: PptxSlide, index: number): { html: string; heavy: number } {
  const parts: string[] = []
  let heavy = 0
  const els = flatten(slide.elements).slice().sort((a, b) => (a.top ?? 0) - (b.top ?? 0) || (a.left ?? 0) - (b.left ?? 0))
  let titled = false
  for (const el of els) {
    switch (el.type) {
      case 'text':
      case 'shape': {
        // pptxtojson emits every space as &nbsp; (faithful to slide layout);
        // prose in a note must wrap normally.
        const content = ((el as { content?: string }).content ?? '').replace(/&nbsp;/g, ' ')
        const plain = content.replace(/<[^>]+>/g, '').trim()
        if (!plain) break
        if (!titled) {
          titled = true
          parts.push(`<h2>${escapeHtml(plain.split('\n')[0]!.slice(0, 200))}</h2>`)
          const rest = content.replace(/^\s*<p[^>]*>[\s\S]*?<\/p>/i, '')
          if (rest.replace(/<[^>]+>/g, '').trim()) parts.push(rest)
        } else {
          parts.push(content)
        }
        break
      }
      case 'image': {
        const b64 = (el as { base64?: string }).base64
        if (b64 && /^data:image\//i.test(b64)) parts.push(`<p><img src="${b64}" /></p>`)
        break
      }
      case 'table': {
        heavy++
        const rows = (el as { data?: Array<Array<{ text?: string }>> }).data ?? []
        for (const row of rows) {
          const cells = row.map((c) => (c.text ?? '').replace(/<[^>]+>/g, '').trim()).filter(Boolean)
          if (cells.length > 0) parts.push(`<p>${escapeHtml(cells.join(' · '))}</p>`)
        }
        break
      }
      default:
        if (HEAVY_TYPES.has(el.type)) heavy++
    }
  }
  if (!titled) parts.unshift(`<h2>Slide ${index + 1}</h2>`)
  if (slide.note && slide.note.trim()) parts.push(`<blockquote><p>${escapeHtml(slide.note.trim())}</p></blockquote>`)
  return { html: parts.join('\n'), heavy }
}

export async function pptxToEditable(bytes: ArrayBuffer): Promise<EditableConversion> {
  const parsed = await parsePptx(bytes)
  const chunks: string[] = []
  let heavy = 0
  let positioned = 0
  parsed.slides.forEach((slide, i) => {
    const { html, heavy: h } = slideToOutlineHtml(slide, i)
    heavy += h
    positioned = Math.max(positioned, flatten(slide.elements).length)
    chunks.push(html)
  })
  const html = chunks.join('\n<hr />\n')
  const content = htmlToTiptap(html)
  const warnings: string[] = []
  if (heavy > 0) warnings.push(`${heavy} chart/table/diagram element${heavy === 1 ? '' : 's'} reduced to text or dropped`)
  if (positioned > 6) warnings.push('Some slides have complex layouts that became plain sections')
  const text = tiptapText(content)
  return { content, warnings, lossy: heavy > 0 || positioned > 6, text }
}

const pt = (n: number | undefined): string => `${Math.round((n ?? 0) * 100) / 100}pt`

function fillCss(fill: unknown): string {
  const f = fill as { type?: string; value?: unknown } | undefined
  if (!f) return ''
  if (f.type === 'color' && typeof f.value === 'string') return `background:${escapeHtml(f.value)};`
  if (f.type === 'image') {
    const v = f.value as { base64?: string } | undefined
    if (v?.base64 && /^data:image\//i.test(v.base64)) return `background:url(${v.base64}) center/cover no-repeat;`
  }
  if (f.type === 'gradient') {
    const v = f.value as { colors?: Array<{ pos: string; color: string }>; rot?: number } | undefined
    const stops = (v?.colors ?? []).map((c) => `${escapeHtml(c.color)} ${escapeHtml(c.pos)}`).join(', ')
    if (stops) return `background:linear-gradient(${(v?.rot ?? 0) + 90}deg, ${stops});`
  }
  return ''
}

function elementToHtml(el: PptxElement): string {
  const base = `left:${pt(el.left)};top:${pt(el.top)};width:${pt(el.width)};height:${pt(el.height)};`
  const rot = (el as { rotate?: number }).rotate ? `transform:rotate(${(el as { rotate?: number }).rotate}deg);` : ''
  switch (el.type) {
    case 'text':
    case 'shape': {
      const e = el as { content?: string; fill?: unknown; borderColor?: string; borderWidth?: number; borderType?: string; vAlign?: string; shapType?: string }
      const border = e.borderWidth ? `border:${pt(e.borderWidth)} ${e.borderType ?? 'solid'} ${escapeHtml(e.borderColor ?? '#000')};` : ''
      const radius = e.shapType === 'ellipse' ? 'border-radius:50%;' : e.shapType === 'roundRect' ? 'border-radius:8pt;' : ''
      const valign = e.vAlign === 'mid' ? 'justify-content:center;' : e.vAlign === 'down' ? 'justify-content:flex-end;' : ''
      return `<div style="${base}${rot}${fillCss(e.fill)}${border}${radius}display:flex;flex-direction:column;${valign}padding:3pt;overflow:hidden;">${e.content ?? ''}</div>`
    }
    case 'image': {
      const e = el as { base64?: string }
      if (!e.base64 || !/^data:image\//i.test(e.base64)) return ''
      return `<img style="${base}${rot}object-fit:fill;" src="${e.base64}" alt="" />`
    }
    case 'table': {
      const e = el as { data?: Array<Array<{ text?: string; fillColor?: string }>> }
      const rows = (e.data ?? [])
        .map((r) => `<tr>${r.map((c) => `<td style="${c.fillColor ? `background:${escapeHtml(c.fillColor)};` : ''}">${c.text ?? ''}</td>`).join('')}</tr>`)
        .join('')
      return `<table style="${base}">${rows}</table>`
    }
    case 'chart':
    case 'diagram':
    case 'math':
    case 'video':
    case 'audio':
      return `<div class="tala-placeholder" style="${base}">${escapeHtml(el.type)} (not rendered)</div>`
    case 'group':
      return flatten([el]).map(elementToHtml).join('')
    default:
      return ''
  }
}

/** Slides laid out at their original coordinates as a scrollable page stack. */
export async function pptxToRendered(bytes: ArrayBuffer): Promise<RenderedConversion> {
  const parsed = await parsePptx(bytes)
  const warnings: string[] = []
  let heavy = 0
  const slides = parsed.slides.map((slide, i) => {
    const els = flatten(slide.elements).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    heavy += els.filter((e) => HEAVY_TYPES.has(e.type)).length
    const inner = els.map(elementToHtml).join('')
    return `<section class="tala-slide" data-slide="${i + 1}" style="width:${pt(parsed.size.width)};height:${pt(parsed.size.height)};${fillCss(slide.fill)}">${inner}</section>`
  })
  if (heavy > 0) warnings.push(`${heavy} chart/diagram element${heavy === 1 ? '' : 's'} shown as placeholders`)
  return { html: wrapStandaloneHtml('', slides.join('\n'), 'pptx'), warnings }
}
