import { describe, expect, it } from 'vitest'
import type { InkPoint, InkStroke } from '@/types/ink'
import {
  DEFAULT_GESTURE_CONFIG,
  detectScribble,
  findCorners,
  recognizeShape,
  resample,
  sanitizeGestureConfig,
  scribbleTargets,
} from './gestures'

/* Synthetic strokes with deterministic jitter — "hand-drawn" enough to
   exercise the tolerances, repeatable enough to assert on. */

let seed = 7
const rnd = (): number => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff
  return seed / 0x7fffffff
}
const jitter = (amp: number): number => (rnd() - 0.5) * 2 * amp

function line(x0: number, y0: number, x1: number, y1: number, n = 40, wobble = 1.2): InkPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    return { x: x0 + (x1 - x0) * t + jitter(wobble), y: y0 + (y1 - y0) * t + jitter(wobble) }
  })
}

function circle(cx: number, cy: number, r: number, n = 60, wobble = 1.5, sweep = 2 * Math.PI): InkPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const t = (i / (n - 1)) * sweep
    return { x: cx + r * Math.cos(t) + jitter(wobble), y: cy + r * Math.sin(t) + jitter(wobble) }
  })
}

function rect(x0: number, y0: number, x1: number, y1: number, wobble = 1.5): InkPoint[] {
  return [
    ...line(x0, y0, x1, y0, 20, wobble),
    ...line(x1, y0, x1, y1, 20, wobble),
    ...line(x1, y1, x0, y1, 20, wobble),
    ...line(x0, y1, x0, y0 + 4, 20, wobble),
  ]
}

function triangle(wobble = 1.5): InkPoint[] {
  return [...line(100, 200, 200, 40, 25, wobble), ...line(200, 40, 300, 200, 25, wobble), ...line(300, 200, 104, 200, 25, wobble)]
}

/** A wavy "word": wobbly loops that never double back fully. */
function handwriting(): InkPoint[] {
  const pts: InkPoint[] = []
  for (let i = 0; i < 80; i++) {
    const t = i / 79
    pts.push({ x: 100 + t * 160 + Math.sin(t * 40) * 4, y: 200 + Math.sin(t * 25) * 12 + jitter(0.8) })
  }
  return pts
}

function scribble(cx: number, cy: number, w: number, h: number, passes = 7): InkPoint[] {
  const pts: InkPoint[] = []
  for (let p = 0; p < passes; p++) {
    const dir = p % 2 === 0 ? 1 : -1
    for (let i = 0; i <= 10; i++) {
      const t = i / 10
      pts.push({ x: cx - w / 2 + (dir === 1 ? t : 1 - t) * w + jitter(0.5), y: cy - h / 2 + (p / (passes - 1)) * h + jitter(1) })
    }
  }
  return pts
}

const stroke = (id: string, points: InkPoint[], size = 3): InkStroke => ({ id, tool: 'pen', color: '#000', size, points })

describe('gesture config', () => {
  it('sanitises and clamps user values', () => {
    expect(sanitizeGestureConfig(null)).toEqual(DEFAULT_GESTURE_CONFIG)
    expect(sanitizeGestureConfig({ holdMs: 50, shapeConfidence: 2, scribbleErase: false })).toMatchObject({
      holdMs: 250,
      shapeConfidence: 0.99,
      scribbleErase: false,
      shapeSnap: true,
    })
  })
})

describe('resample / corners', () => {
  it('resamples to n evenly spaced points keeping the endpoints', () => {
    const out = resample([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 5)
    expect(out).toHaveLength(5)
    expect(out[0]).toEqual({ x: 0, y: 0 })
    expect(out[4]).toEqual({ x: 10, y: 10 })
    expect(out[2]!.x).toBeCloseTo(10, 5)
  })
  it('finds four corners on a rectangle and none on a circle', () => {
    expect(findCorners(resample(rect(100, 100, 300, 220, 0), 64).slice(0, -1), { closed: true, minDeg: 50 })).toHaveLength(4)
    expect(findCorners(resample(circle(200, 200, 80, 60, 0), 64).slice(0, -1), { closed: true, minDeg: 50 })).toHaveLength(0)
  })
})

describe('shape recognition', () => {
  const T = DEFAULT_GESTURE_CONFIG.shapeConfidence

  it('recognises a wobbly straight line and snaps it to its endpoints', () => {
    const c = recognizeShape(line(50, 60, 300, 90))
    expect(c?.kind).toBe('line')
    expect(c!.confidence).toBeGreaterThanOrEqual(T)
    expect(c!.points).toHaveLength(2)
    expect(c!.points[0]!.x).toBeCloseTo(50, -1)
    expect(c!.points[1]!.x).toBeCloseTo(300, -1)
  })

  it('recognises a circle as an ellipse with a closed perimeter', () => {
    const c = recognizeShape(circle(200, 200, 70))
    expect(c?.kind).toBe('ellipse')
    expect(c!.confidence).toBeGreaterThanOrEqual(T)
    expect(c!.closed).toBe(true)
    expect(c!.points[0]).toEqual(c!.points[c!.points.length - 1])
    const bb = c!.points.reduce((b, p) => ({ x0: Math.min(b.x0, p.x), x1: Math.max(b.x1, p.x) }), { x0: Infinity, x1: -Infinity })
    expect(bb.x1 - bb.x0).toBeCloseTo(140, -1)
  })

  it('recognises a rectangle and snaps it to its bounding box', () => {
    const c = recognizeShape(rect(100, 100, 300, 220))
    expect(c?.kind).toBe('rect')
    expect(c!.confidence).toBeGreaterThanOrEqual(T)
    expect(c!.points).toHaveLength(5)
    expect(c!.points[0]!.x).toBeCloseTo(100, -1)
    expect(c!.points[2]!.y).toBeCloseTo(220, -1)
  })

  it('recognises a triangle', () => {
    const c = recognizeShape(triangle())
    expect(c?.kind).toBe('triangle')
    expect(c!.confidence).toBeGreaterThanOrEqual(T)
    expect(c!.points).toHaveLength(4)
  })

  it('recognises an arrow (shaft + head)', () => {
    const pts = [
      ...line(60, 200, 260, 200, 40, 0.8),
      ...line(260, 200, 232, 180, 8, 0.5),
      ...line(232, 180, 260, 200, 8, 0.5),
      ...line(260, 200, 232, 220, 8, 0.5),
    ]
    const c = recognizeShape(pts)
    expect(c?.kind).toBe('arrow')
    expect(c!.confidence).toBeGreaterThanOrEqual(0.7)
    expect(c!.points).toHaveLength(5)
    expect(c!.points[1]!.x).toBeCloseTo(260, -1)
  })

  it('leaves handwriting and tiny marks alone (low confidence / null)', () => {
    const hw = recognizeShape(handwriting())
    expect(hw === null || hw.confidence < T).toBe(true)
    expect(recognizeShape(line(10, 10, 20, 12, 6))).toBeNull()
    const halfCircle = recognizeShape(circle(200, 200, 60, 40, 1, Math.PI))
    expect(halfCircle === null || halfCircle.kind !== 'ellipse' || halfCircle.confidence < T).toBe(true)
  })

  it('does not call a very wobbly loop a clean shape', () => {
    const messy = circle(200, 200, 60, 60, 14)
    const c = recognizeShape(messy)
    expect(c === null || c.confidence < T).toBe(true)
  })
})

describe('scribble erase', () => {
  const T = DEFAULT_GESTURE_CONFIG.scribbleConfidence

  it('detects a dense zig-zag scribble', () => {
    const c = detectScribble(scribble(200, 200, 90, 40))
    expect(c?.kind).toBe('scribble')
    expect(c!.confidence).toBeGreaterThanOrEqual(T)
    expect(c!.reversals).toBeGreaterThanOrEqual(5)
  })

  it('detects a long scratch-out but not a single crossing stroke', () => {
    const c = detectScribble(scribble(200, 200, 160, 6, 5))
    expect(c?.kind).toBe('scratch')
    expect(c!.confidence).toBeGreaterThanOrEqual(T)
    expect(detectScribble(line(50, 60, 300, 90))).toBeNull()
  })

  it('does not mistake handwriting or a circle for a scribble', () => {
    const hw = detectScribble(handwriting())
    expect(hw === null || hw.confidence < T).toBe(true)
    expect(detectScribble(circle(200, 200, 60))).toBeNull()
  })

  it('erases only strokes the scribble actually covers', () => {
    const covered = stroke('a', line(160, 200, 240, 200))
    const nearby = stroke('b', line(160, 260, 240, 260))
    const longLine = stroke('c', line(0, 200, 600, 200, 120))
    const targets = scribbleTargets(scribble(200, 200, 100, 40), [covered, nearby, longLine], { tolerance: 8 })
    expect(targets.map((s) => s.id)).toEqual(['a'])
  })
})
