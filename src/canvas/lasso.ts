import type { InkStroke } from '@/types/ink'
import { pointInPolygon } from './geometry'
import type { Pt } from './geometry'

/** A lasso needs some area to mean anything; a tap or a flat scribble selects nothing. */
const MIN_POINTS = 3

/**
 * Ids of the strokes mostly inside the lasso: at least `minFraction` of a
 * stroke's points must lie within the polygon, so a stray corner clipping the
 * loop does not drag a whole sentence along.
 */
export function strokesInLasso(strokes: readonly InkStroke[], lasso: readonly Pt[], minFraction = 0.5): string[] {
  if (lasso.length < MIN_POINTS) return []
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of lasso) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  const ids: string[] = []
  for (const s of strokes) {
    if (s.points.length === 0) continue
    let inside = 0
    for (const p of s.points) {
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && pointInPolygon(p, lasso)) inside++
    }
    if (inside / s.points.length >= minFraction) ids.push(s.id)
  }
  return ids
}

/** SVG path for the lasso being drawn (closed, so the fill shows what will be caught). */
export const lassoPath = (pts: readonly Pt[]): string =>
  pts.length === 0 ? '' : `M${pts.map((p) => `${p.x} ${p.y}`).join('L')}Z`
