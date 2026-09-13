import type { InkPoint, InkShapeKind, InkStroke } from '@/types/ink'
import { strokeBBox } from './ink'

/* ---------------------------------------------------------------------------
   Handwriting gesture recognition — pure functions over point lists.

   Two families:
     • shape recognition (line / arrow / ellipse / rect / triangle / polygon)
       for hold-to-snap: a stroke that pauses is measured and, when the
       geometry is unambiguous, replaced by a clean vector shape
     • scribble / scratch-out detection for erase-by-gesture: a dense
       back-and-forth stroke that covers other ink deletes it

   Both are conservative by design. Every score is 0..1 and callers compare
   against a user-tunable threshold (GestureConfig); anything below stays
   ordinary handwriting. The math is deliberately simple — bounding boxes,
   chord deviation, turning angles, radial error — so it is fast enough to
   run on every pause and predictable enough to test.
--------------------------------------------------------------------------- */

export interface GestureConfig {
  /** Hold-to-straighten / hold-to-perfect-shape. */
  shapeSnap: boolean
  /** Scribble & scratch-out erase. */
  scribbleErase: boolean
  /** Pause (ms) with the pen down before a stroke is measured for a shape. */
  holdMs: number
  /** Minimum recogniser confidence to snap to a shape (0..1). */
  shapeConfidence: number
  /** Minimum confidence to treat a stroke as a scribble/scratch-out (0..1). */
  scribbleConfidence: number
}

export const DEFAULT_GESTURE_CONFIG: GestureConfig = {
  shapeSnap: true,
  scribbleErase: true,
  holdMs: 600,
  shapeConfidence: 0.8,
  scribbleConfidence: 0.75,
}

/** Clamp + round helper for user-tunable values. */
export function sanitizeGestureConfig(raw: unknown): GestureConfig {
  const d = DEFAULT_GESTURE_CONFIG
  if (!raw || typeof raw !== 'object') return d
  const r = raw as Partial<GestureConfig>
  const bool = (v: unknown, fb: boolean): boolean => (typeof v === 'boolean' ? v : fb)
  const num = (v: unknown, fb: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fb
  return {
    shapeSnap: bool(r.shapeSnap, d.shapeSnap),
    scribbleErase: bool(r.scribbleErase, d.scribbleErase),
    holdMs: num(r.holdMs, d.holdMs, 250, 2000),
    shapeConfidence: num(r.shapeConfidence, d.shapeConfidence, 0.5, 0.99),
    scribbleConfidence: num(r.scribbleConfidence, d.scribbleConfidence, 0.5, 0.99),
  }
}

/* ------------------------------ Geometry ---------------------------------- */

export interface BBox {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function bboxOf(pts: readonly InkPoint[]): BBox {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    if (p.x < x0) x0 = p.x
    if (p.y < y0) y0 = p.y
    if (p.x > x1) x1 = p.x
    if (p.y > y1) y1 = p.y
  }
  return { x0, y0, x1, y1 }
}

export function pathLength(pts: readonly InkPoint[]): number {
  let L = 0
  for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y)
  return L
}

/** Evenly spaced resampling along the path (n points, endpoints kept). */
export function resample(pts: readonly InkPoint[], n: number): InkPoint[] {
  if (pts.length === 0) return []
  if (pts.length === 1 || n <= 1) return [{ x: pts[0]!.x, y: pts[0]!.y }]
  const total = pathLength(pts)
  if (total === 0) return Array.from({ length: n }, () => ({ x: pts[0]!.x, y: pts[0]!.y }))
  const step = total / (n - 1)
  const out: InkPoint[] = [{ x: pts[0]!.x, y: pts[0]!.y }]
  let acc = 0
  let i = 1
  let prev = pts[0]!
  while (out.length < n - 1 && i < pts.length) {
    const cur = pts[i]!
    const seg = Math.hypot(cur.x - prev.x, cur.y - prev.y)
    if (acc + seg >= step) {
      const t = (step - acc) / seg
      const q = { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t }
      out.push(q)
      prev = q
      acc = 0
    } else {
      acc += seg
      prev = cur
      i++
    }
  }
  while (out.length < n) out.push({ x: pts[pts.length - 1]!.x, y: pts[pts.length - 1]!.y })
  return out
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(ax + t * dx - px, ay + t * dy - py)
}

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v))
const r1 = (v: number): number => Math.round(v * 10) / 10

/* ---------------------------- Corner detection ---------------------------- */

/**
 * Corners of a resampled path: local maxima of the turning angle (measured
 * over a ±k window so pen jitter does not register) above `minDeg`.
 * Returns indices into `pts`.
 */
export function findCorners(pts: readonly InkPoint[], opts: { k?: number; minDeg?: number; closed?: boolean } = {}): number[] {
  const n = pts.length
  const k = opts.k ?? Math.max(2, Math.round(n / 16))
  const minDeg = opts.minDeg ?? 45
  if (n < 2 * k + 3) return []
  const angles = new Float64Array(n)
  const at = (i: number): InkPoint => {
    if (opts.closed) return pts[((i % n) + n) % n]!
    return pts[Math.max(0, Math.min(n - 1, i))]!
  }
  const lo = opts.closed ? 0 : k
  const hi = opts.closed ? n : n - k
  for (let i = lo; i < hi; i++) {
    const a = at(i - k)
    const b = pts[i]!
    const c = at(i + k)
    const v1x = b.x - a.x
    const v1y = b.y - a.y
    const v2x = c.x - b.x
    const v2y = c.y - b.y
    const l1 = Math.hypot(v1x, v1y)
    const l2 = Math.hypot(v2x, v2y)
    if (l1 < 1e-6 || l2 < 1e-6) continue
    const cos = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)))
    angles[i] = (Math.acos(cos) * 180) / Math.PI
  }
  const corners: number[] = []
  for (let i = lo; i < hi; i++) {
    const a = angles[i]!
    if (a < minDeg) continue
    let isMax = true
    for (let j = i - k; j <= i + k; j++) {
      if (j === i) continue
      const jj = opts.closed ? ((j % n) + n) % n : j
      if (jj < 0 || jj >= n) continue
      if (angles[jj]! > a || (angles[jj]! === a && jj < i)) {
        isMax = false
        break
      }
    }
    if (isMax) corners.push(i)
  }
  // Merge corners closer than k samples (one physical corner, two maxima)
  const merged: number[] = []
  for (const c of corners) {
    const last = merged[merged.length - 1]
    if (last !== undefined && c - last <= k) continue
    merged.push(c)
  }
  if (opts.closed && merged.length > 1 && merged[0]! + n - merged[merged.length - 1]! <= k) merged.pop()
  return merged
}

/* --------------------------- Shape recognition ---------------------------- */

export interface ShapeCandidate {
  kind: InkShapeKind
  /** 0..1 — how unambiguous the geometry is. */
  confidence: number
  /** Clean vector geometry (see InkShapeMeta for the per-kind convention). */
  points: InkPoint[]
  closed: boolean
  /** Diagnostics: why this kind won. */
  scores: Partial<Record<InkShapeKind, number>>
}

const SAMPLES = 64
/** Strokes smaller than this (capture px, bbox diagonal) are never shapes. */
const MIN_SHAPE_DIAG = 24

/** Straightness of an open stroke: 1 = perfect line. */
function lineScore(pts: readonly InkPoint[]): number {
  const a = pts[0]!
  const b = pts[pts.length - 1]!
  const chord = Math.hypot(b.x - a.x, b.y - a.y)
  if (chord < 20) return 0
  let maxDev = 0
  for (const p of pts) maxDev = Math.max(maxDev, distToSegment(p.x, p.y, a.x, a.y, b.x, b.y))
  const wiggle = pathLength(pts) / chord // 1 = straight, grows with wobble
  const devScore = clamp01(1 - maxDev / (0.05 * chord))
  const wiggleScore = clamp01(1 - (wiggle - 1) / 0.08)
  return devScore * 0.7 + wiggleScore * 0.3
}

/** Radial error against the bbox-inscribed ellipse: 1 = perfect ellipse. */
function ellipseScore(pts: readonly InkPoint[], bb: BBox): { score: number; coverage: number } {
  const cx = (bb.x0 + bb.x1) / 2
  const cy = (bb.y0 + bb.y1) / 2
  const rx = Math.max(1, (bb.x1 - bb.x0) / 2)
  const ry = Math.max(1, (bb.y1 - bb.y0) / 2)
  let err = 0
  let prevAng: number | null = null
  let swept = 0
  for (const p of pts) {
    const nx = (p.x - cx) / rx
    const ny = (p.y - cy) / ry
    err += Math.abs(Math.hypot(nx, ny) - 1)
    const ang = Math.atan2(ny, nx)
    if (prevAng !== null) {
      let d = ang - prevAng
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      swept += d
    }
    prevAng = ang
  }
  err /= pts.length
  const coverage = Math.abs(swept) / (2 * Math.PI)
  return { score: clamp01(1 - err / 0.18) * clamp01(coverage / 0.85), coverage }
}

/** Ellipse perimeter sampled clockwise, closed (first point repeated last). */
function ellipsePoints(bb: BBox, n = 48): InkPoint[] {
  const cx = (bb.x0 + bb.x1) / 2
  const cy = (bb.y0 + bb.y1) / 2
  const rx = (bb.x1 - bb.x0) / 2
  const ry = (bb.y1 - bb.y0) / 2
  const out: InkPoint[] = []
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2
    out.push({ x: r1(cx + rx * Math.cos(t)), y: r1(cy + ry * Math.sin(t)) })
  }
  out.push({ ...out[0]! })
  return out
}

/** How well `corners` describe an axis-aligned rectangle of the bbox. */
function rectScore(pts: readonly InkPoint[], corners: number[], bb: BBox): number {
  if (corners.length !== 4) return 0
  const w = bb.x1 - bb.x0
  const h = bb.y1 - bb.y0
  if (w < 12 || h < 12) return 0
  // Every point should hug one of the four bbox edges
  let edgeErr = 0
  for (const p of pts) {
    const d = Math.min(Math.abs(p.x - bb.x0), Math.abs(p.x - bb.x1), Math.abs(p.y - bb.y0), Math.abs(p.y - bb.y1))
    edgeErr += d
  }
  edgeErr /= pts.length
  const tol = 0.06 * Math.min(w, h) + 2
  const hug = clamp01(1 - edgeErr / tol)
  // Corners should sit near the bbox corners (one each)
  const bbCorners = [
    { x: bb.x0, y: bb.y0 },
    { x: bb.x1, y: bb.y0 },
    { x: bb.x1, y: bb.y1 },
    { x: bb.x0, y: bb.y1 },
  ]
  const used = new Set<number>()
  let cornerErr = 0
  for (const ci of corners) {
    const p = pts[ci]!
    let best = Infinity
    let bestJ = -1
    bbCorners.forEach((c, j) => {
      if (used.has(j)) return
      const d = Math.hypot(c.x - p.x, c.y - p.y)
      if (d < best) {
        best = d
        bestJ = j
      }
    })
    used.add(bestJ)
    cornerErr += best
  }
  cornerErr /= 4
  const cornerScore = clamp01(1 - cornerErr / (0.22 * Math.min(w, h) + 4))
  return hug * 0.55 + cornerScore * 0.45
}

/** A closed polygon through the detected corners: 1 = points hug its edges. */
function polygonScore(pts: readonly InkPoint[], corners: number[], diag: number): number {
  if (corners.length < 3) return 0
  const verts = corners.map((i) => pts[i]!)
  let err = 0
  for (const p of pts) {
    let best = Infinity
    for (let i = 0; i < verts.length; i++) {
      const a = verts[i]!
      const b = verts[(i + 1) % verts.length]!
      best = Math.min(best, distToSegment(p.x, p.y, a.x, a.y, b.x, b.y))
    }
    err += best
  }
  err /= pts.length
  return clamp01(1 - err / (0.04 * diag + 2))
}

/**
 * Arrow: a straight shaft whose end doubles back into a head. We look for a
 * long straight run (start → tip) followed by two short segments that both
 * end near the shaft, on either side of it.
 */
function arrowCandidate(pts: readonly InkPoint[], diag: number): { score: number; points: InkPoint[] } | null {
  const corners = findCorners(pts, { minDeg: 60 })
  if (corners.length < 2 || corners.length > 3) return null
  const tipIdx = corners[0]!
  if (tipIdx < pts.length * 0.45) return null
  const start = pts[0]!
  const tip = pts[tipIdx]!
  const shaftLen = Math.hypot(tip.x - start.x, tip.y - start.y)
  if (shaftLen < 0.4 * diag) return null
  const shaft = pts.slice(0, tipIdx + 1)
  const straight = lineScore(shaft)
  if (straight < 0.6) return null
  // Head: everything after the tip must stay within ~40% of the shaft length of the tip
  const head = pts.slice(tipIdx)
  let far = 0
  for (const p of head) far = Math.max(far, Math.hypot(p.x - tip.x, p.y - tip.y))
  const headLen = Math.min(shaftLen * 0.3, Math.max(14, far))
  if (far > 0.5 * shaftLen || far < 0.08 * shaftLen) return null
  // Head points should lie on both sides of the shaft direction
  const ux = (tip.x - start.x) / shaftLen
  const uy = (tip.y - start.y) / shaftLen
  let left = 0
  let right = 0
  for (const p of head) {
    const cross = (p.x - tip.x) * uy - (p.y - tip.y) * ux
    if (cross > 2) left++
    else if (cross < -2) right++
  }
  const sides = clamp01(Math.min(left, right) / Math.max(2, head.length * 0.2))
  const score = straight * 0.6 + sides * 0.4
  const ang = Math.PI / 6
  const back = { x: -ux, y: -uy }
  const rot = (vx: number, vy: number, a: number): InkPoint => ({
    x: vx * Math.cos(a) - vy * Math.sin(a),
    y: vx * Math.sin(a) + vy * Math.cos(a),
  })
  const l = rot(back.x, back.y, ang)
  const r = rot(back.x, back.y, -ang)
  const points: InkPoint[] = [
    { x: r1(start.x), y: r1(start.y) },
    { x: r1(tip.x), y: r1(tip.y) },
    { x: r1(tip.x + l.x * headLen), y: r1(tip.y + l.y * headLen) },
    { x: r1(tip.x), y: r1(tip.y) },
    { x: r1(tip.x + r.x * headLen), y: r1(tip.y + r.y * headLen) },
  ]
  return { score, points }
}

/**
 * Measures a raw stroke and returns the best geometric interpretation, or
 * null when nothing is convincing. Callers decide with a threshold; a
 * returned candidate is not a decision.
 */
export function recognizeShape(raw: readonly InkPoint[]): ShapeCandidate | null {
  if (raw.length < 4) return null
  const bb = bboxOf(raw)
  const w = bb.x1 - bb.x0
  const h = bb.y1 - bb.y0
  const diag = Math.hypot(w, h)
  if (diag < MIN_SHAPE_DIAG) return null
  const pts = resample(raw, SAMPLES)
  const scores: Partial<Record<InkShapeKind, number>> = {}

  const first = pts[0]!
  const last = pts[pts.length - 1]!
  const gap = Math.hypot(last.x - first.x, last.y - first.y)
  const closed = gap <= Math.max(0.2 * diag, 10)

  if (!closed) {
    scores.line = lineScore(pts)
    const arrow = arrowCandidate(pts, diag)
    if (arrow) scores.arrow = arrow.score
    if ((scores.arrow ?? 0) > (scores.line ?? 0) && arrow) {
      return { kind: 'arrow', confidence: arrow.score, points: arrow.points, closed: false, scores }
    }
    if (scores.line !== undefined && scores.line > 0) {
      return {
        kind: 'line',
        confidence: scores.line,
        points: [{ x: r1(first.x), y: r1(first.y) }, { x: r1(last.x), y: r1(last.y) }],
        closed: false,
        scores,
      }
    }
    return null
  }

  // Closed: compare ellipse vs corner-based polygons
  const loop = pts.slice(0, -1) // drop duplicate end for closed corner detection
  const corners = findCorners(loop, { closed: true, minDeg: 50 })
  const ell = ellipseScore(pts, bb)
  scores.ellipse = corners.length <= 1 ? ell.score : ell.score * clamp01(1 - (corners.length - 1) * 0.35)
  scores.rect = rectScore(loop, corners, bb)
  scores.triangle = corners.length === 3 ? polygonScore(loop, corners, diag) : 0
  scores.polygon = corners.length >= 5 && corners.length <= 8 ? polygonScore(loop, corners, diag) * 0.9 : 0

  let best: InkShapeKind = 'ellipse'
  for (const k of ['rect', 'triangle', 'polygon'] as InkShapeKind[]) {
    if ((scores[k] ?? 0) > (scores[best] ?? 0)) best = k
  }
  const confidence = scores[best] ?? 0
  if (confidence <= 0) return null

  let points: InkPoint[]
  if (best === 'ellipse') points = ellipsePoints(bb)
  else if (best === 'rect') {
    points = [
      { x: r1(bb.x0), y: r1(bb.y0) },
      { x: r1(bb.x1), y: r1(bb.y0) },
      { x: r1(bb.x1), y: r1(bb.y1) },
      { x: r1(bb.x0), y: r1(bb.y1) },
      { x: r1(bb.x0), y: r1(bb.y0) },
    ]
  } else {
    const verts = corners.map((i) => ({ x: r1(loop[i]!.x), y: r1(loop[i]!.y) }))
    points = [...verts, { ...verts[0]! }]
  }
  return { kind: best, confidence, points, closed: true, scores }
}

/* ---------------------------- Scribble erase ------------------------------ */

export interface ScribbleCandidate {
  kind: 'scribble' | 'scratch'
  confidence: number
  /** Diagnostics. */
  reversals: number
  density: number
}

/** Sign changes of motion along the stroke's dominant axis, ignoring jitter. */
function countReversals(pts: readonly InkPoint[], minExcursion: number): number {
  const bb = bboxOf(pts)
  const horizontal = bb.x1 - bb.x0 >= bb.y1 - bb.y0
  let dir = 0
  let reversals = 0
  let extreme = horizontal ? pts[0]!.x : pts[0]!.y
  for (let i = 1; i < pts.length; i++) {
    const v = horizontal ? pts[i]!.x : pts[i]!.y
    if (dir === 0) {
      if (Math.abs(v - extreme) >= minExcursion) {
        dir = v > extreme ? 1 : -1
        extreme = v
      }
      continue
    }
    if (dir === 1) {
      if (v > extreme) extreme = v
      else if (extreme - v >= minExcursion) {
        reversals++
        dir = -1
        extreme = v
      }
    } else if (v < extreme) extreme = v
    else if (v - extreme >= minExcursion) {
      reversals++
      dir = 1
      extreme = v
    }
  }
  return reversals
}

/**
 * Is this stroke a deliberate scribble (dense zig-zag) or scratch-out
 * (several long strokes back and forth over a line)? Ordinary handwriting
 * reverses direction too, so both need several reversals AND a path much
 * longer than the area they cover.
 */
export function detectScribble(raw: readonly InkPoint[]): ScribbleCandidate | null {
  if (raw.length < 8) return null
  const bb = bboxOf(raw)
  const w = bb.x1 - bb.x0
  const h = bb.y1 - bb.y0
  const diag = Math.hypot(w, h)
  if (diag < 16) return null
  const L = pathLength(raw)
  const density = L / diag
  const reversals = countReversals(raw, Math.max(3, 0.12 * Math.max(w, h)))
  if (reversals < 3 || density < 2.2) return null

  const aspect = Math.max(w, h) / Math.max(1, Math.min(w, h))
  // Scribble: many reversals, compact; scratch-out: fewer, long thin sweeps
  const scribble = clamp01((reversals - 2) / 5) * 0.55 + clamp01((density - 2) / 3) * 0.45
  const scratch = aspect >= 2.5 ? clamp01((reversals - 2) / 3) * 0.5 + clamp01((density - 2) / 2.5) * 0.5 : 0
  if (scratch > scribble) return { kind: 'scratch', confidence: scratch, reversals, density }
  return { kind: 'scribble', confidence: scribble, reversals, density }
}

/**
 * Strokes the scribble erases: those whose points mostly lie within `tol`
 * of the scribble path. Coverage is per target, so a long line the user
 * only grazed survives while a word fully scribbled over goes.
 */
export function scribbleTargets(
  scribble: readonly InkPoint[],
  strokes: readonly InkStroke[],
  opts: { tolerance: number; minCoverage?: number; excludeId?: string } ,
): InkStroke[] {
  const minCoverage = opts.minCoverage ?? 0.55
  const tol = opts.tolerance
  const sb = bboxOf(scribble)
  const area = { x0: sb.x0 - tol, y0: sb.y0 - tol, x1: sb.x1 + tol, y1: sb.y1 + tol }
  const out: InkStroke[] = []
  for (const s of strokes) {
    if (s.id === opts.excludeId || s.points.length === 0) continue
    const bb = strokeBBox(s)
    if (bb.x1 < area.x0 || bb.x0 > area.x1 || bb.y1 < area.y0 || bb.y0 > area.y1) continue
    const reach = tol + s.size / 2
    let covered = 0
    // Sample at most ~40 points per target so big strokes stay cheap
    const step = Math.max(1, Math.floor(s.points.length / 40))
    let tested = 0
    for (let i = 0; i < s.points.length; i += step) {
      const p = s.points[i]!
      tested++
      if (p.x < area.x0 || p.x > area.x1 || p.y < area.y0 || p.y > area.y1) continue
      for (let j = 1; j < scribble.length; j++) {
        const a = scribble[j - 1]!
        const b = scribble[j]!
        if (distToSegment(p.x, p.y, a.x, a.y, b.x, b.y) <= reach) {
          covered++
          break
        }
      }
    }
    if (tested > 0 && covered / tested >= minCoverage) out.push(s)
  }
  return out
}

/* ------------------------------ Diagnostics ------------------------------- */

export interface GestureDiagnostic {
  gesture: 'shape' | 'scribble' | 'tap-select'
  decision: 'applied' | 'rejected' | 'cancelled'
  confidence: number
  threshold: number
  detail?: Record<string, unknown>
}

export const GESTURE_DIAG_EVENT = 'tala:gesture'
const DEBUG_KEY = 'tala:gesture-debug'

/**
 * Developer-visible trace of every gesture decision: a window event
 * (`tala:gesture`) always, plus console output when
 * localStorage['tala:gesture-debug'] === '1'.
 */
export function emitGestureDiagnostic(d: GestureDiagnostic): void {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(GESTURE_DIAG_EVENT, { detail: d }))
    if (localStorage.getItem(DEBUG_KEY) === '1') {
      console.debug(`[tala:gesture] ${d.gesture} ${d.decision} (${d.confidence.toFixed(2)} vs ${d.threshold})`, d.detail ?? '')
    }
  } catch {
    /* ignore */
  }
}
