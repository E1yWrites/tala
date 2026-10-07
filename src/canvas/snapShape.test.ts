import { describe, expect, it } from 'vitest'
import type { Pt } from './geometry'
import { classifyShape, shapeToPoints } from './snapShape'

/** Deterministic wobble so tests are repeatable but not perfectly clean. */
function rng(seed: number): () => number {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296 - 0.5
  }
}

/** Points along a polyline, `step` apart, jittered by up to ±`noise`. */
function walk(corners: Pt[], step: number, noise: number, seed = 1): Pt[] {
  const r = rng(seed)
  const out: Pt[] = []
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i]!
    const b = corners[i + 1]!
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / step))
    for (let k = 0; k < n; k++) {
      const t = k / n
      out.push({ x: a.x + (b.x - a.x) * t + r() * 2 * noise, y: a.y + (b.y - a.y) * t + r() * 2 * noise })
    }
  }
  out.push({ ...corners[corners.length - 1]! })
  return out
}

const ellipse = (cx: number, cy: number, rx: number, ry: number, n = 80, noise = 1.5, seed = 7): Pt[] => {
  const r = rng(seed)
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = (i / n) * Math.PI * 2 + 0.4
    return { x: cx + rx * Math.cos(t) + r() * 2 * noise, y: cy + ry * Math.sin(t) + r() * 2 * noise }
  })
}

describe('classifyShape', () => {
  it('straightens a wobbly line, whatever its angle', () => {
    const s = classifyShape(walk([{ x: 10, y: 10 }, { x: 210, y: 60 }], 4, 1.2))
    expect(s?.kind).toBe('line')
    if (s?.kind === 'line') {
      // the endpoints are where the pen went down and lifted, give or take the wobble
      expect(Math.abs(s.a.x - 10)).toBeLessThan(3)
      expect(Math.abs(s.b.x - 210)).toBeLessThan(3)
    }
  })

  it('turns a rough circle into a true circle', () => {
    const s = classifyShape(ellipse(100, 100, 60, 58))
    expect(s?.kind).toBe('ellipse')
    if (s?.kind === 'ellipse') {
      expect(s.rx).toBeCloseTo(s.ry, 5)
      expect(s.cx).toBeCloseTo(100, -1)
    }
  })

  it('keeps an oval an oval', () => {
    const s = classifyShape(ellipse(100, 100, 90, 40))
    expect(s?.kind === 'ellipse' && s.rx > s.ry * 1.8).toBe(true)
  })

  it('turns a rough rectangle into an exact, level rectangle', () => {
    const rough = walk([{ x: 20, y: 30 }, { x: 180, y: 34 }, { x: 178, y: 120 }, { x: 22, y: 118 }, { x: 21, y: 31 }], 5, 1.5)
    const s = classifyShape(rough)
    expect(s?.kind).toBe('polygon')
    if (s?.kind === 'polygon') {
      expect(s.corners).toHaveLength(4)
      expect(s.corners[0]!.y).toBeCloseTo(s.corners[1]!.y, 6) // level top
      expect(s.corners[0]!.x).toBeCloseTo(s.corners[3]!.x, 6) // plumb side
    }
  })

  it('keeps a tilted rectangle tilted but with true right angles', () => {
    const a = (30 * Math.PI) / 180
    const rot = (x: number, y: number): Pt => ({ x: 100 + x * Math.cos(a) - y * Math.sin(a), y: 100 + x * Math.sin(a) + y * Math.cos(a) })
    const c = [rot(-80, -40), rot(80, -40), rot(80, 40), rot(-80, 40), rot(-80, -40)]
    const s = classifyShape(walk(c, 5, 1))
    expect(s?.kind).toBe('polygon')
    if (s?.kind === 'polygon') {
      const [p0, p1, p2] = s.corners as [Pt, Pt, Pt]
      const dot = (p1.x - p0.x) * (p2.x - p1.x) + (p1.y - p0.y) * (p2.y - p1.y)
      expect(Math.abs(dot)).toBeLessThan(1e-6)
    }
  })

  it('recognises a triangle', () => {
    const s = classifyShape(walk([{ x: 100, y: 20 }, { x: 180, y: 150 }, { x: 20, y: 148 }, { x: 101, y: 22 }], 5, 1.5))
    expect(s?.kind === 'polygon' && s.corners.length).toBe(3)
  })

  it('leaves everything else alone', () => {
    // a zigzag, an open arc, a tap, a pentagon-ish blob, a flat scribble
    expect(classifyShape(walk([{ x: 0, y: 0 }, { x: 40, y: 50 }, { x: 80, y: 0 }, { x: 120, y: 50 }, { x: 160, y: 0 }], 4, 0.5))).toBeNull()
    const arc = ellipse(100, 100, 60, 60, 40, 0.5).slice(0, 26)
    expect(classifyShape(arc)).toBeNull()
    expect(classifyShape([{ x: 5, y: 5 }, { x: 6, y: 5 }, { x: 6, y: 6 }])).toBeNull()
    const star = [0, 1, 2, 3, 4, 5].map((i) => {
      const t = (i / 5) * Math.PI * 4 - Math.PI / 2
      return { x: 100 + 60 * Math.cos(t), y: 100 + 60 * Math.sin(t) }
    })
    expect(classifyShape(walk(star, 4, 0.5))).toBeNull()
  })
})

describe('shapeToPoints', () => {
  it('closes polygons and samples ellipses on their outline', () => {
    const tri = shapeToPoints({ kind: 'polygon', corners: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 5, y: 8 }] })
    expect(tri).toHaveLength(4)
    expect(tri[3]).toEqual(tri[0])
    const ring = shapeToPoints({ kind: 'ellipse', cx: 50, cy: 50, rx: 20, ry: 10 }, 24)
    expect(ring).toHaveLength(25)
    expect(ring.every((p) => Math.abs(((p.x - 50) / 20) ** 2 + ((p.y - 50) / 10) ** 2 - 1) < 1e-9)).toBe(true)
  })
})
