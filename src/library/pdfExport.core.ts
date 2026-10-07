import { PDFDocument, StandardFonts, rgb } from '@cantoo/pdf-lib'
import type { PDFFont, PDFPage } from '@cantoo/pdf-lib'
import type { InkDoc, InkStroke } from '@/types/ink'
import { strokeOutlineD } from '@/utils/ink'

/* ---------------------------------------------------------------------------
   PDF export, pure (no DOM, no IndexedDB) so it runs in a worker and in
   Vitest. Page units are PDF points. Handwriting is drawn as vector paths over
   the original PDF page (or a blank / ruled sheet); typed text is plain
   Helvetica. Coordinates: ink x,y are in the doc's capture space, scaled to the
   page width, and y is flipped because PDF's origin is bottom-left.
--------------------------------------------------------------------------- */

export interface ExportPage {
  w: number
  h: number
  /** 1-based page in `ExportInput.original`. */
  pdfPage?: number
  /** Pre-v4 raster background. */
  image?: { bytes: ArrayBuffer; type: 'png' | 'jpg' }
  template: 'blank' | 'ruled' | 'grid'
  ink: InkDoc | null
  /** Typed text, drawn on pages that are not an imported PDF page. */
  text: string
}

export interface ExportInput {
  original?: ArrayBuffer
  pages: ExportPage[]
}

const MARGIN = 48
const FONT_SIZE = 11
const LINE_HEIGHT = 15
const RULE_GAP = 28
const GRID_GAP = 20
const ALPHA: Record<InkStroke['tool'], number> = { pen: 1, pencil: 0.82, highlighter: 0.4 }

/** `#rgb` / `#rrggbb` to pdf-lib rgb; anything else is black rather than an exception. */
function colour(hex: string): ReturnType<typeof rgb> {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) return rgb(0, 0, 0)
  let h = m[1]!
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  const n = parseInt(h, 16)
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255)
}

function drawPaper(page: PDFPage, p: ExportPage): void {
  const line = rgb(0.82, 0.84, 0.87)
  if (p.template === 'blank') return
  for (let y = RULE_GAP; y < p.h; y += p.template === 'grid' ? GRID_GAP : RULE_GAP) {
    page.drawLine({ start: { x: 0, y: p.h - y }, end: { x: p.w, y: p.h - y }, thickness: 0.5, color: line })
  }
  if (p.template === 'grid') {
    for (let x = GRID_GAP; x < p.w; x += GRID_GAP) {
      page.drawLine({ start: { x, y: 0 }, end: { x, y: p.h }, thickness: 0.5, color: line })
    }
  }
}

function drawInk(page: PDFPage, p: ExportPage): void {
  if (!p.ink) return
  const k = p.w / p.ink.width
  // highlighters first so pen strokes stay readable on top of them
  const ordered = [...p.ink.strokes].sort((a, b) => +(b.tool === 'highlighter') - +(a.tool === 'highlighter'))
  for (const s of ordered) {
    const d = strokeOutlineD(s)
    if (!d) continue
    page.drawSvgPath(d, { x: 0, y: p.h, scale: k, color: colour(s.color), opacity: ALPHA[s.tool], borderWidth: 0 })
  }
}

/** Wrap `text` to `width` points; characters Helvetica cannot encode become `?`. */
function wrap(text: string, font: PDFFont, width: number): string[] {
  const known = new Set(font.getCharacterSet())
  const clean = [...text].map((c) => (c === '\n' || known.has(c.codePointAt(0)!) ? c : '?')).join('')
  const lines: string[] = []
  for (const para of clean.split('\n')) {
    let line = ''
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word
      if (line && font.widthOfTextAtSize(next, FONT_SIZE) > width) {
        lines.push(line)
        line = word
      } else line = next
    }
    lines.push(line)
  }
  return lines
}

export async function buildPdf({ original, pages }: ExportInput): Promise<Uint8Array> {
  const out = await PDFDocument.create()
  const src = original ? await PDFDocument.load(original, { ignoreEncryption: true }) : null
  const font = await out.embedFont(StandardFonts.Helvetica)

  for (const p of pages) {
    let page: PDFPage
    if (p.pdfPage && src) {
      const [copied] = await out.copyPages(src, [p.pdfPage - 1])
      page = out.addPage(copied)
    } else {
      page = out.addPage([p.w, p.h])
      drawPaper(page, p)
      if (p.image) {
        const img = p.image.type === 'png' ? await out.embedPng(p.image.bytes) : await out.embedJpg(p.image.bytes)
        page.drawImage(img, { x: 0, y: 0, width: p.w, height: p.h })
      }
    }
    drawInk(page, p)

    // Typed text: only on pages that are not a PDF page. Long text continues on extra pages.
    if (!p.pdfPage && !p.image && p.text.trim()) {
      const lines = wrap(p.text, font, p.w - MARGIN * 2)
      const perPage = Math.max(1, Math.floor((p.h - MARGIN * 2) / LINE_HEIGHT))
      for (let i = 0; i < lines.length; i += perPage) {
        const target = i === 0 ? page : out.addPage([p.w, p.h])
        lines.slice(i, i + perPage).forEach((line, row) => {
          target.drawText(line, { x: MARGIN, y: p.h - MARGIN - row * LINE_HEIGHT, size: FONT_SIZE, font, color: rgb(0.1, 0.1, 0.12) })
        })
      }
    }
  }
  return out.save()
}
