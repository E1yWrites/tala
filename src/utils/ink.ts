import type { InkPoint, InkStroke } from '@/types/ink'
import { createId } from '@/utils/id'

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

/**
 * Tilt widening for the pencil: a stylus laid flatter drags more graphite,
 * so the mark grows up to ~1.9× at full tilt. Pressure and tilt compose.
 */
function tiltFactor(t?: number): number {
  if (t === undefined || t <= 0) return 1
  return 1 + 0.9 * Math.min(1, t)
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
 *
 * Hot path — runs every frame while drawing. Written allocation-light:
 * flat typed arrays instead of point objects, and the path string is
 * assembled from chunks joined once.
 */
export function strokeOutlineD(stroke: Pick<InkStroke, 'points' | 'size' | 'tool'>): string {
  const pts = stroke.points
  const n = pts.length
  if (n === 0) return ''

  // Dot: single tap → circle
  if (n === 1) {
    const p0 = pts[0]!
    const r =
      halfWidthAt(stroke.size, p0.p) * (stroke.tool === 'pencil' ? tiltFactor(p0.t) : 1)
    return circlePath(p0.x, p0.y, r)
  }

  let hasPressure = false
  for (let i = 0; i < n; i++) {
    const p = pts[i]!.p
    if (stroke.tool !== 'highlighter' && p !== undefined && p > 0) {
      hasPressure = true
      break
    }
  }

  // Per-point half widths + unit normals in flat arrays
  const hw = new Float64Array(n)
  const nx = new Float64Array(n)
  const ny = new Float64Array(n)
  const isHl = stroke.tool === 'highlighter'
  const isPencil = stroke.tool === 'pencil'
  for (let i = 0; i < n; i++) {
    const pt = pts[i]!
    hw[i] = isHl
      ? stroke.size / 2
      : halfWidthAt(stroke.size, pt.p, hasPressure) * (isPencil ? tiltFactor(pt.t) : 1)
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

  // Outline polygon as flat arrays: [start cap] left[] [end cap] right-reversed
  // Caps sample at most 5 points each, so reserve n*2 + 10.
  const m = n * 2 + 10
  const outX = new Float64Array(m)
  const outY = new Float64Array(m)
  let k = 0

  if (stroke.tool === 'pen') {
    // Round start cap: arc from right[0] back to left[0]
    k = arcCap(outX, outY, k, pts[0]!.x, pts[0]!.y, hw[0]!, nx[0]!, ny[0]!, true)
  }
  for (let i = 0; i < n; i++) {
    outX[k] = pts[i]!.x + nx[i]! * hw[i]!
    outY[k] = pts[i]!.y + ny[i]! * hw[i]!
    k++
  }
  if (stroke.tool === 'pen') {
    k = arcCap(outX, outY, k, pts[n - 1]!.x, pts[n - 1]!.y, hw[n - 1]!, nx[n - 1]!, ny[n - 1]!, false)
  }
  for (let i = n - 1; i >= 0; i--) {
    outX[k] = pts[i]!.x - nx[i]! * hw[i]!
    outY[k] = pts[i]!.y - ny[i]! * hw[i]!
    k++
  }

  return smoothClosedPath(outX, outY, k)
}

/** Semicircular end-cap sampled as `steps` points, swept the short way. */
function arcCap(
  outX: Float64Array,
  outY: Float64Array,
  k: number,
  cx: number,
  cy: number,
  r: number,
  nx: number,
  ny: number,
  atStart: boolean,
): number {
  const rr = Math.max(0.4, r)
  // Normal direction on the side we're leaving / entering
  const sx = cx + (atStart ? -nx : nx) * rr
  const sy = cy + (atStart ? -ny : ny) * rr
  const ex = cx + (atStart ? nx : -nx) * rr
  const ey = cy + (atStart ? ny : -ny) * rr
  const a0 = Math.atan2(sy - cy, sx - cx)
  let a1 = Math.atan2(ey - cy, ex - cx)
  while (a1 - a0 > Math.PI) a1 -= Math.PI * 2
  while (a1 - a0 < -Math.PI) a1 += Math.PI * 2
  const steps = 5
  for (let i = 1; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps
    outX[k] = cx + Math.cos(a) * rr
    outY[k] = cy + Math.sin(a) * rr
    k++
  }
  return k
}

function circlePath(cx: number, cy: number, r: number): string {
  const rr = Math.max(0.5, r)
  return (
    `M ${round1(cx - rr)} ${round1(cy)} ` +
    `a ${round1(rr)} ${round1(rr)} 0 1 0 ${round1(rr * 2)} 0 ` +
    `a ${round1(rr)} ${round1(rr)} 0 1 0 ${round1(-rr * 2)} 0 Z`
  )
}

/** Closed-loop quadratic smoothing for outline polygons (flat arrays). */
function smoothClosedPath(outX: Float64Array, outY: Float64Array, n: number): string {
  if (n < 3) return ''
  const chunks: string[] = []
  // Start at midpoint of last→first edge so curvature is even everywhere
  const startX = (outX[n - 1]! + outX[0]!) / 2
  const startY = (outY[n - 1]! + outY[0]!) / 2
  chunks.push(`M ${round1(startX)} ${round1(startY)}`)
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    const mx = (outX[i]! + outX[j]!) / 2
    const my = (outY[i]! + outY[j]!) / 2
    chunks.push(` Q ${round1(outX[i]!)} ${round1(outY[i]!)} ${round1(mx)} ${round1(my)}`)
  }
  return chunks.join('') + ' Z'
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
 * Pixel eraser: split the stroke where the eraser circle actually crosses it.
 * Cuts land ON the circle's edge (segment∩circle intersections are spliced
 * into the surviving runs), so erasing mid-stroke nibbles exactly the covered
 * arc instead of dropping whole simplified segments. Returns null when the
 * circle misses entirely.
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

  if (n === 1) {
    const dx = pts[0]!.x - x
    const dy = pts[0]!.y - y
    return dx * dx + dy * dy <= reach * reach ? [] : null
  }

  /** Sorted t values where the circle meets segment a→b (0..2 of them). */
  function crossings(ax: number, ay: number, bx: number, by: number): number[] {
    const dx = bx - ax
    const dy = by - ay
    const fx = ax - x
    const fy = ay - y
    const A = dx * dx + dy * dy
    const B = 2 * (fx * dx + fy * dy)
    const C = fx * fx + fy * fy - reach * reach
    if (A < 1e-9) return []
    const disc = B * B - 4 * A * C
    if (disc < 0) return []
    const sq = Math.sqrt(disc)
    const t1 = (-B - sq) / (2 * A)
    const t2 = (-B + sq) / (2 * A)
    const out: number[] = []
    if (t1 >= 0 && t1 <= 1) out.push(t1)
    if (t2 > 0 && t2 < 1 && out[out.length - 1] !== t2) out.push(t2)
    return out
  }

  const runs: InkStroke[] = []
  let cur: InkPoint[] = [pts[0]!]
  let changed = false
  // Lone-point runs are only meaningful once a real cut happened — otherwise
  // swallowing the first segments would leave a phantom dot at the stroke head.
  let cutSeen = false

  const flush = () => {
    if (cur.length >= 2 || (cur.length === 1 && cutSeen)) {
      runs.push({ ...stroke, id: createId(), points: cur })
    }
    cur = []
  }

  for (let i = 1; i < n; i++) {
    const a = pts[i - 1]!
    const b = pts[i]!
    const aIn =
      (a.x - x) * (a.x - x) + (a.y - y) * (a.y - y) <= reach * reach
    const bIn =
      (b.x - x) * (b.x - x) + (b.y - y) * (b.y - y) <= reach * reach

    if (aIn && bIn) {
      // Fully swallowed
      flush()
      changed = true
      cutSeen = true
      continue
    }

    const ts = crossings(a.x, a.y, b.x, b.y)

    if (ts.length === 0) {
      if (!aIn && !bIn) {
        cur.push(b)
      } else {
        // Numerical corner (endpoint marginally inside): drop the segment
        flush()
        changed = true
        cutSeen = true
        cur = bIn ? [] : [b]
      }
      continue
    }

    const lerp = (t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

    if (aIn && !bIn) {
      // Exiting: keep up to the exit point, restart after
      cur.push(lerp(ts[ts.length - 1]!))
      flush()
      changed = true
      cutSeen = true
    } else if (!aIn && bIn) {
      // Entering: keep up to the entry point, discard the rest
      cur.push(lerp(ts[0]!))
      flush()
      changed = true
      cutSeen = true
    } else {
      // Chord: outside → through → outside
      if (ts.length < 2) continue // tangential graze — leave intact
      cur.push(lerp(ts[0]!))
      flush()
      cur = [lerp(ts[1]!)]
      changed = true
      cutSeen = true
    }
  }
  flush()

  return changed ? runs : null
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

/** Rotate every point around (cx, cy) by `rad` radians (clockwise on screen). */
export function rotateStroke(stroke: InkStroke, cx: number, cy: number, rad: number): InkStroke {
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)
  return {
    ...stroke,
    points: stroke.points.map((p) => {
      const dx = p.x - cx
      const dy = p.y - cy
      return { ...p, x: round1(cx + dx * cos - dy * sin), y: round1(cy + dx * sin + dy * cos) }
    }),
  }
}

/* --------------------------------- Lasso ---------------------------------- */

/** Even-odd ray cast — polygon given as a flat list of points. */
export function pointInPolygon(x: number, y: number, poly: readonly InkPoint[]): boolean {
  let inside = false
  const n = poly.length
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y || 1e-9) + a.x) {
      inside = !inside
    }
  }
  return inside
}

/**
 * A stroke belongs to a lasso when most of its points fall inside the loop —
 * tolerant of a sloppy drag that clips the tail of a word, strict enough that
 * a neighbouring line the loop barely grazes stays put.
 */
export function strokeInLasso(stroke: InkStroke, poly: readonly InkPoint[]): boolean {
  const pts = stroke.points
  if (pts.length === 0 || poly.length < 3) return false
  let inside = 0
  for (const p of pts) if (pointInPolygon(p.x, p.y, poly)) inside++
  return inside * 2 >= pts.length
}

/* --------------------------------- Shapes --------------------------------- */

/**
 * Path for a recognised shape: straight segments for polygons/lines, a
 * smooth closed curve for ellipses (whose points are dense perimeter
 * samples). Rendered with `stroke` = colour and `stroke-width` = size, so a
 * shape keeps crisp uniform edges however it is scaled or rotated.
 */
export function shapePathD(stroke: Pick<InkStroke, 'points' | 'shape'>): string {
  const pts = stroke.points
  const n = pts.length
  if (n === 0) return ''
  if (n === 1) return `M ${round1(pts[0]!.x)} ${round1(pts[0]!.y)}`
  if (stroke.shape?.kind === 'ellipse') {
    // Closed quadratic smoothing through the sampled perimeter — the last
    // sample duplicates the first, drop it so the loop has no cusp.
    const m = pts[n - 1]!.x === pts[0]!.x && pts[n - 1]!.y === pts[0]!.y ? n - 1 : n
    if (m < 3) return polylineToPath(pts)
    const xs = new Float64Array(m)
    const ys = new Float64Array(m)
    for (let i = 0; i < m; i++) {
      xs[i] = pts[i]!.x
      ys[i] = pts[i]!.y
    }
    return smoothClosedPath(xs, ys, m)
  }
  let d = `M ${round1(pts[0]!.x)} ${round1(pts[0]!.y)}`
  for (let i = 1; i < n; i++) d += ` L ${round1(pts[i]!.x)} ${round1(pts[i]!.y)}`
  if (stroke.shape?.closed) d += ' Z'
  return d
}
