import type { InkPoint, InkStroke } from '@/types/ink'

/* ---------------------------------------------------------------------------
   Geometry helpers for the handwriting layer: variable-width stroke outlines
   (pressure-aware), polyline simplification, hit-testing, eraser splitting
   and selection transforms. Pure functions — no DOM access.
--------------------------------------------------------------------------- */

const round1 = (n: number): number => Math.round(n * 10) / 10

/** Squared distance from point P to segment AB. */
function distToSegmentSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx - px
  const cy = ay + t * dy - py
  return cx * cx + cy * cy
}

/** Effective half-width at a point (pressure modulates between 45%..115%). */
function halfWidthAt(size: number, p?: number, hasPressure?: boolean): number {
  const base = size / 2
  if (!hasPressure || p === undefined) return base
  return base * (0.45 + 0.7 * Math.max(0, Math.min(1, p)))
}

/** Smooth a polyline into an SVG path using quadratic midpoint curves. */
export function polylineToPath(pts: InkPoint[]): string {
  const n = pts.length
  if (n < 2) return ''
  let d = `M ${round1(pts[0]!.x)} ${round1(pts[0]!.y)}`
  for (let i = 1; i < n - 1; i++) {
    const cur = pts[i]!
    const next = pts[i + 1]!
    const mx = (cur.x + next.x) / 2
    const my = (cur.y + next.y) / 2
    d += ` Q ${round1(cur.x)} ${round1(cur.y)} ${round1(mx)} ${round1(my)}`
  }
  const last = pts[n - 1]!
  d += ` L ${round1(last.x)} ${round1(last.y)}`
  return d
}

/**
 * Build a closed, filled outline around a polyline whose width follows the
 * recorded pressure. Produces ONE path per stroke (cheap DOM, scalable).
 */
export function strokeOutlineD(stroke: Pick<InkStroke, 'points' | 'size' | 'tool'>): string {
  const pts = stroke.points
  const n = pts.length
  if (n === 0) return ''

  // Dot: single tap → circle
  if (n === 1) {
    const p0 = pts[0]!
    const r = halfWidthAt(stroke.size, p0.p)
    return circlePath(p0.x, p0.y, r)
  }

  const hasPressure =
    stroke.tool !== 'highlighter' && pts.some((pt) => pt.p !== undefined && pt.p > 0)

  // Per-point half widths
  const hw = pts.map((pt) =>
    stroke.tool === 'highlighter'
      ? stroke.size / 2
      : halfWidthAt(stroke.size, pt.p, hasPressure),
  )

  // Unit tangents and normals per point
  const nx: number[] = new Array(n)
  const ny: number[] = new Array(n)
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)]!
    const next = pts[Math.min(n - 1, i + 1)]!
    let tx = next.x - prev.x
    let ty = next.y - prev.y
    const len = Math.hypot(tx, ty)
    if (len < 1e-6) {
      tx = 1
      ty = 0
    } else {
      tx /= len
      ty /= len
    }
    nx[i] = -ty
    ny[i] = tx
  }

  const left: InkPoint[] = []
  const right: InkPoint[] = []
  for (let i = 0; i < n; i++) {
    left.push({ x: pts[i]!.x + nx[i]! * hw[i]!, y: pts[i]!.y + ny[i]! * hw[i]! })
    right.push({ x: pts[i]!.x - nx[i]! * hw[i]!, y: pts[i]!.y - ny[i]! * hw[i]! })
  }

  const outline: InkPoint[] = []

  if (stroke.tool === 'pen') {
    // Round start cap: arc around pts[0] from right[0] back to left[0]
    pushArc(outline, pts[0]!, hw[0]!, right[0]!, left[0]!)
  }
  // Highlighter: butt cap — outline simply starts at left[0]

  outline.push(...left)

  if (stroke.tool === 'pen') {
    pushArc(outline, pts[n - 1]!, hw[n - 1]!, left[n - 1]!, right[n - 1]!)
  }

  for (let i = n - 1; i >= 0; i--) outline.push(right[i]!)

  return smoothClosedPath(outline)
}

function circlePath(cx: number, cy: number, r: number): string {
  const rr = Math.max(0.5, r)
  return (
    `M ${round1(cx - rr)} ${round1(cy)} ` +
    `a ${round1(rr)} ${round1(rr)} 0 1 0 ${round1(rr * 2)} 0 ` +
    `a ${round1(rr)} ${round1(rr)} 0 1 0 ${round1(-rr * 2)} 0 Z`
  )
}

/** Append a semicircular arc (as sampled points) from `from` to `to` around center. */
function pushArc(out: InkPoint[], c: InkPoint, r: number, from: InkPoint, to: InkPoint): void {
  const steps = 5
  const a0 = Math.atan2(from.y - c.y, from.x - c.x)
  let a1 = Math.atan2(to.y - c.y, to.x - c.x)
  // Choose the sweep that goes the "short way" around the cap
  while (a1 - a0 > Math.PI) a1 -= Math.PI * 2
  while (a1 - a0 < -Math.PI) a1 += Math.PI * 2
  const rr = Math.max(0.4, r)
  for (let i = 1; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    out.push({ x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr })
  }
}

/** Closed-loop quadratic smoothing for outline polygons. */
function smoothClosedPath(pts: InkPoint[]): string {
  const n = pts.length
  if (n < 3) return ''
  let d = ''
  // Start at midpoint of last→first edge so curvature is even everywhere
  const startX = (pts[n - 1]!.x + pts[0]!.x) / 2
  const startY = (pts[n - 1]!.y + pts[0]!.y) / 2
  d += `M ${round1(startX)} ${round1(startY)}`
  for (let i = 0; i < n; i++) {
    const cur = pts[i]!
    const next = pts[(i + 1) % n]!
    const mx = (cur.x + next.x) / 2
    const my = (cur.y + next.y) / 2
    d += ` Q ${round1(cur.x)} ${round1(cur.y)} ${round1(mx)} ${round1(my)}`
  }
  return d + ' Z'
}

/* ------------------------------ Simplification ---------------------------- */

/**
 * Ramer–Douglas–Peucker simplification (keeps pressure of retained points).
 * Keeps handwriting files small without visible loss at ε≈0.6px.
 */
export function simplifyPoints(pts: InkPoint[], epsilon = 0.6): InkPoint[] {
  if (pts.length <= 3) return pts
  const keep = new Uint8Array(pts.length)
  keep[0] = 1
  keep[pts.length - 1] = 1
  const stack: Array<[number, number]> = [[0, pts.length - 1]]
  while (stack.length > 0) {
    const [start, end] = stack.pop()!
    let maxDist = -1
    let maxIdx = -1
    const a = pts[start]!
    const b = pts[end]!
    for (let i = start + 1; i < end; i++) {
      const p = pts[i]!
      const d = distToSegmentSq(p.x, p.y, a.x, a.y, b.x, b.y)
      if (d > maxDist) {
        maxDist = d
        maxIdx = i
      }
    }
    if (maxIdx > 0 && maxDist > epsilon * epsilon) {
      keep[maxIdx] = 1
      stack.push([start, maxIdx], [maxIdx, end])
    }
  }
  const out: InkPoint[] = []
  for (let i = 0; i < pts.length; i++) if (keep[i]) out.push(pts[i]!)
  return out
}

/* -------------------------------- Hit testing ----------------------------- */

export function strokeBBox(stroke: InkStroke): {
  x0: number
  y0: number
  x1: number
  y1: number
} {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of stroke.points) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  const pad = stroke.size / 2 + 1
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
}

/** True when the eraser cursor (circle at x,y radius r) touches the stroke. */
export function strokeHits(
  stroke: InkStroke,
  x: number,
  y: number,
  radius: number,
): boolean {
  const reach = radius + stroke.size / 2
  const reachSq = reach * reach
  const pts = stroke.points
  // Cheap bbox rejection first
  const bb = strokeBBox(stroke)
  if (x < bb.x0 - radius || x > bb.x1 + radius || y < bb.y0 - radius || y > bb.y1 + radius) {
    return false
  }
  if (pts.length === 1) {
    const dx = pts[0]!.x - x
    const dy = pts[0]!.y - y
    return dx * dx + dy * dy <= reachSq
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (distToSegmentSq(x, y, a.x, a.y, b.x, b.y) <= reachSq) return true
  }
  return false
}

/**
 * Pixel eraser: split the stroke into surviving runs of points whose
 * neighbouring segments stay outside the eraser circle. Returns null when
 * nothing changed.
 */
export function eraseStrokePartially(
  stroke: InkStroke,
  x: number,
  y: number,
  radius: number,
): InkStroke[] | null {
  const pts = stroke.points
  const n = pts.length
  const reach = radius + stroke.size / 2
  const reachSq = reach * reach

  // Mark points belonging to segments that pass through the eraser circle
  const erased = new Uint8Array(n)
  let anyErased = false
  if (n === 1) {
    const dx = pts[0]!.x - x
    const dy = pts[0]!.y - y
    if (dx * dx + dy * dy <= reachSq) {
      erased[0] = 1
      anyErased = true
    }
  }
  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    if (distToSegmentSq(x, y, a.x, a.y, b.x, b.y) <= reachSq) {
      erased[i - 1] = 1
      erased[i] = 1
      anyErased = true
    }
  }
  if (!anyErased) return null

  const runs: InkStroke[] = []
  let runStart = -1
  for (let i = 0; i < n; i++) {
    if (!erased[i]) {
      if (runStart < 0) runStart = i
    } else if (runStart >= 0) {
      pushRun(runs, stroke, pts, runStart, i - 1)
      runStart = -1
    }
  }
  if (runStart >= 0) pushRun(runs, stroke, pts, runStart, n - 1)
  return runs
}

function pushRun(
  out: InkStroke[],
  src: InkStroke,
  pts: InkPoint[],
  start: number,
  end: number,
): void {
  const slice = pts.slice(start, end + 1)
  if (slice.length >= 2) {
    out.push({
      ...src,
      id: `s${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      points: slice,
    })
  }
}

/* ------------------------------- Transforms ------------------------------- */

export function translateStroke(stroke: InkStroke, dx: number, dy: number): InkStroke {
  return {
    ...stroke,
    points: stroke.points.map((p) => ({ ...p, x: round1(p.x + dx), y: round1(p.y + dy) })),
  }
}

/** Map every point linearly from bbox `from` onto bbox `to`. */
export function scaleStrokeInto(
  stroke: InkStroke,
  from: { x0: number; y0: number; x1: number; y1: number },
  to: { x0: number; y0: number; x1: number; y1: number },
): InkStroke {
  const fw = from.x1 - from.x0 || 1
  const fh = from.y1 - from.y0 || 1
  const tw = to.x1 - to.x0
  const th = to.y1 - to.y0
  const sx = tw / fw
  const sy = th / fh
  return {
    ...stroke,
    size: Math.max(0.5, stroke.size * (sx + sy) / 2),
    points: stroke.points.map((p) => ({
      ...p,
      x: round1(to.x0 + (p.x - from.x0) * sx),
      y: round1(to.y0 + (p.y - from.y0) * sy),
    })),
  }
}
