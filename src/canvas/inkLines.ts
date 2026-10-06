import type { InkStroke } from '@/types/ink'

/*
  Splits a page's handwriting into text lines for recognition: strokes whose
  vertical extents overlap belong to the same line. Pure, so it is testable.
*/

interface Band {
  y0: number
  y1: number
  strokes: InkStroke[]
}

function extent(s: InkStroke): { y0: number; y1: number; x0: number } {
  let y0 = Infinity
  let y1 = -Infinity
  let x0 = Infinity
  for (const p of s.points) {
    y0 = Math.min(y0, p.y)
    y1 = Math.max(y1, p.y)
    x0 = Math.min(x0, p.x)
  }
  return { y0, y1, x0 }
}

/** Lines top to bottom, strokes inside each line left to right. Highlighter marks are not writing. */
export function groupIntoLines(strokes: readonly InkStroke[]): InkStroke[][] {
  const items = strokes
    .filter((s) => s.tool !== 'highlighter' && s.points.length > 0)
    .map((s) => ({ s, ...extent(s) }))
    .sort((a, b) => (a.y0 + a.y1) / 2 - (b.y0 + b.y1) / 2)

  const bands: Band[] = []
  for (const it of items) {
    const h = Math.max(1, it.y1 - it.y0)
    const band = bands.find((b) => {
      const overlap = Math.min(b.y1, it.y1) - Math.max(b.y0, it.y0)
      // enough shared height, relative to the smaller of the two, to be the same line
      return overlap >= 0.4 * Math.min(h, b.y1 - b.y0 || h)
    })
    if (band) {
      band.y0 = Math.min(band.y0, it.y0)
      band.y1 = Math.max(band.y1, it.y1)
      band.strokes.push(it.s)
    } else bands.push({ y0: it.y0, y1: it.y1, strokes: [it.s] })
  }
  return bands
    .sort((a, b) => a.y0 - b.y0)
    .map((b) => b.strokes.sort((p, q) => extent(p).x0 - extent(q).x0))
}
