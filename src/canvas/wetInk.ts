import type { InkPoint } from '@/types/ink'
import { halfWidthAt } from '@/utils/ink'

/* ---------------------------------------------------------------------------
   "Wet" ink: the stroke still under the pen is painted incrementally onto a
   2D canvas (which can be `desynchronized`, unlike SVG) and swapped for the
   committed SVG path on pointerup. Each call paints only the segments added
   since `from`, so cost per frame does not grow with stroke length. Opaque pen
   only: translucent tools would double-darken where segments overlap.
--------------------------------------------------------------------------- */

/** Canvas pixels we are willing to allocate; iOS Safari refuses far less than desktops. */
export const MAX_WET_PIXELS = 12_000_000

/** Paint points `from..end` of a stroke (needs `from - 1` for the first segment's start). */
export function paintWetSegments(
  ctx: CanvasRenderingContext2D,
  pts: readonly InkPoint[],
  from: number,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color
  const hw = (p: InkPoint): number =>
    halfWidthAt(size, p.p, p.p !== undefined && p.p > 0, p.t, p.t !== undefined && p.t > 0)

  for (let i = Math.max(0, from); i < pts.length; i++) {
    const cur = pts[i]!
    const r1 = hw(cur)
    const prev = i > 0 ? pts[i - 1]! : null
    if (prev) {
      const r0 = hw(prev)
      const dx = cur.x - prev.x
      const dy = cur.y - prev.y
      const len = Math.hypot(dx, dy)
      if (len > 1e-6) {
        const nx = -dy / len
        const ny = dx / len
        ctx.beginPath()
        ctx.moveTo(prev.x + nx * r0, prev.y + ny * r0)
        ctx.lineTo(cur.x + nx * r1, cur.y + ny * r1)
        ctx.lineTo(cur.x - nx * r1, cur.y - ny * r1)
        ctx.lineTo(prev.x - nx * r0, prev.y - ny * r0)
        ctx.closePath()
        ctx.fill()
      }
    }
    // round join / cap: also covers the seam between abutting quads
    ctx.beginPath()
    ctx.arc(cur.x, cur.y, r1, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Backing-store size for a CSS box: crisp at zoom, capped so it always allocates. */
export function wetCanvasSize(
  cssW: number,
  cssH: number,
  dpr: number,
  zoom: number,
): { w: number; h: number } {
  const want = Math.min(dpr, 3) * Math.min(zoom, 4)
  const cap = Math.sqrt(MAX_WET_PIXELS / Math.max(1, cssW * cssH))
  const f = Math.max(0.5, Math.min(want, cap))
  return { w: Math.max(1, Math.ceil(cssW * f)), h: Math.max(1, Math.ceil(cssH * f)) }
}
