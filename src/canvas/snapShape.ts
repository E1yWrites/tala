import type { Pt } from './geometry'

/* ---------------------------------------------------------------------------
   Snap-to-shape: hold the pen still at the end of a stroke and a rough line,
   circle/ellipse, rectangle or triangle becomes the clean one. Pure geometry
   so it is testable with synthetic wobbly strokes. Anything it is not sure
   about returns null: a wrong snap is worse than no snap.

   Limits (deliberate, ponytail): ellipses are axis-aligned; open arcs and
   zigzags never snap; no pentagons or stars.
--------------------------------------------------------------------------- */

export type Shape =
  | { kind: 'line'; a: Pt; b: Pt }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { kind: 'polygon'; corners: Pt[] } // triangle or rectangle

/** Strokes shorter than this (in the same units as the points) are taps and scribbles. */
const MIN_LENGTH = 40
const LINE_STRAIGHTNESS = 0.05 // max deviation from the chord, as a fraction of its length
const CLOSE_RATIO = 0.22 // gap between first and last point, as a fraction of the path length
const RDP_EPS = 0.045 // polygon simplification tolerance, as a fraction of the bbox diagonal
const POLY_FIT = 0.07 // every point within this fraction of the diagonal from the polygon
const ELLIPSE_MEAN = 0.12
const ELLIPSE_MAX = 0.3
const RIGHT_ANGLE_TOL = (28 * Math.PI) / 180
const AXIS_SNAP = (10 * Math.PI) / 180
const MIN_SIDE = 0.15 // shortest polygon side, as a fraction of the diagonal

const dist = (a: Pt, b: Pt): number => Math.hypot(a.x - b.x, a.y - b.y)

function pathLength(pts: readonly Pt[]): number {
  let l = 0
  for (let i = 1; i < pts.length; i++) l += dist(pts[i - 1]!, pts[i]!)
  return l
}

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2))
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy))
}

/** Ramer-Douglas-Peucker; returns the kept points including both ends. */
function rdp(pts: readonly Pt[], eps: number): Pt[] {
  if (pts.length < 3) return [...pts]
  const a = pts[0]!
  const b = pts[pts.length - 1]!
  let worst = 0
  let at = 0
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i]!, a, b)
    if (d > worst) {
      worst = d
      at = i
    }
  }
  if (worst <= eps) return [a, b]
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)]
}

function bbox(pts: readonly Pt[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  return { x0, y0, x1, y1 }
}

const polygonFits = (pts: readonly Pt[], poly: readonly Pt[], tol: number): boolean =>
  pts.every((p) => {
    let best = Infinity
    for (let i = 0; i < poly.length; i++) best = Math.min(best, distToSegment(p, poly[i]!, poly[(i + 1) % poly.length]!))
    return best <= tol
  })

/** Turn a four-cornered loop into an exact rectangle (axis-aligned when nearly so). */
function regularRect(c: readonly Pt[]): Pt[] | null {
  // opposite sides must agree, and every corner must be close to a right angle
  for (let i = 0; i < 4; i++) {
    const p = c[(i + 3) % 4]!
    const q = c[i]!
    const r = c[(i + 1) % 4]!
    const ux = p.x - q.x
    const uy = p.y - q.y
    const vx = r.x - q.x
    const vy = r.y - q.y
    const angle = Math.acos(Math.max(-1, Math.min(1, (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy) || 1))))
    if (Math.abs(angle - Math.PI / 2) > RIGHT_ANGLE_TOL) return null
  }
  const cx = (c[0]!.x + c[1]!.x + c[2]!.x + c[3]!.x) / 4
  const cy = (c[0]!.y + c[1]!.y + c[2]!.y + c[3]!.y) / 4
  let wx = (c[1]!.x - c[0]!.x + (c[2]!.x - c[3]!.x)) / 2
  let wy = (c[1]!.y - c[0]!.y + (c[2]!.y - c[3]!.y)) / 2
  const hx0 = (c[3]!.x - c[0]!.x + (c[2]!.x - c[1]!.x)) / 2
  const hy0 = (c[3]!.y - c[0]!.y + (c[2]!.y - c[1]!.y)) / 2
  const wl = Math.hypot(wx, wy)
  if (wl < 1e-6) return null
  // height = the part of the other side vector that is perpendicular to the width
  let nx = -wy / wl
  let ny = wx / wl
  const hl = hx0 * nx + hy0 * ny
  if (Math.abs(hl) < 1e-6) return null
  // a nearly level rectangle becomes exactly level
  if (Math.abs(Math.atan2(wy, wx)) < AXIS_SNAP || Math.abs(Math.abs(Math.atan2(wy, wx)) - Math.PI) < AXIS_SNAP) {
    wx = Math.sign(wx || 1) * wl
    wy = 0
    nx = 0
    ny = 1
  }
  const hx = nx * hl
  const hy = ny * hl
  return [
    { x: cx - wx / 2 - hx / 2, y: cy - wy / 2 - hy / 2 },
    { x: cx + wx / 2 - hx / 2, y: cy + wy / 2 - hy / 2 },
    { x: cx + wx / 2 + hx / 2, y: cy + wy / 2 + hy / 2 },
    { x: cx - wx / 2 + hx / 2, y: cy - wy / 2 + hy / 2 },
  ]
}

/** What clean shape did the owner mean? null when unsure. */
export function classifyShape(points: readonly Pt[]): Shape | null {
  if (points.length < 6) return null
  const len = pathLength(points)
  if (len < MIN_LENGTH) return null
  const first = points[0]!
  const last = points[points.length - 1]!
  const box = bbox(points)
  const diag = Math.hypot(box.x1 - box.x0, box.y1 - box.y0)
  if (diag < 1e-6) return null

  const gap = dist(first, last)

  // Open stroke: a line if it hugs the chord, otherwise nothing (arcs and zigzags stay as drawn)
  if (gap / len > CLOSE_RATIO) {
    return points.every((p) => distToSegment(p, first, last) <= LINE_STRAIGHTNESS * gap)
      ? { kind: 'line', a: first, b: last }
      : null
  }

  // Closed loop: triangle, rectangle or ellipse
  const closed = [...points, first]
  const poly = rdp(closed, RDP_EPS * diag).slice(0, -1)
  if (poly.length === 3 || poly.length === 4) {
    const sides = poly.map((p, i) => dist(p, poly[(i + 1) % poly.length]!))
    if (Math.min(...sides) >= MIN_SIDE * diag && polygonFits(points, poly, POLY_FIT * diag)) {
      if (poly.length === 3) return { kind: 'polygon', corners: poly }
      const rect = regularRect(poly)
      if (rect && polygonFits(points, rect, POLY_FIT * diag)) return { kind: 'polygon', corners: rect }
    }
  }

  const rx = (box.x1 - box.x0) / 2
  const ry = (box.y1 - box.y0) / 2
  if (rx < 1 || ry < 1) return null
  const cx = (box.x0 + box.x1) / 2
  const cy = (box.y0 + box.y1) / 2
  let sum = 0
  let worst = 0
  for (const p of points) {
    const off = Math.abs(Math.hypot((p.x - cx) / rx, (p.y - cy) / ry) - 1)
    sum += off
    worst = Math.max(worst, off)
  }
  if (sum / points.length <= ELLIPSE_MEAN && worst <= ELLIPSE_MAX) {
    // close to round: make it a true circle
    if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.12) {
      const r = (rx + ry) / 2
      return { kind: 'ellipse', cx, cy, rx: r, ry: r }
    }
    return { kind: 'ellipse', cx, cy, rx, ry }
  }
  return null
}

/** The shape as a polyline a stroke can carry (closed shapes end where they began). */
export function shapeToPoints(shape: Shape, segments = 48): Pt[] {
  if (shape.kind === 'line') return [shape.a, shape.b]
  if (shape.kind === 'polygon') return [...shape.corners, shape.corners[0]!]
  return Array.from({ length: segments + 1 }, (_, i) => {
    const t = (i / segments) * Math.PI * 2
    return { x: shape.cx + shape.rx * Math.cos(t), y: shape.cy + shape.ry * Math.sin(t) }
  })
}
