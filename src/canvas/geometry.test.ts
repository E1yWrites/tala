import { describe, expect, it } from 'vitest'
import {
  clampZoom,
  fitWidth,
  pageToScreen,
  pinchOf,
  pointInPolygon,
  screenToPage,
  scrollAfterZoom,
  zoomAbout,
} from './geometry'

describe('page <-> screen', () => {
  const v = { scale: 2, tx: 30, ty: -10 }
  it('round-trips', () => {
    const p = { x: 123.5, y: 40 }
    const back = screenToPage(v, pageToScreen(v, p))
    expect(back.x).toBeCloseTo(p.x)
    expect(back.y).toBeCloseTo(p.y)
  })
  it('maps the origin to the translation', () => {
    expect(pageToScreen(v, { x: 0, y: 0 })).toEqual({ x: 30, y: -10 })
  })
})

describe('zoomAbout', () => {
  it('keeps the focus point fixed', () => {
    const v = { scale: 1, tx: 0, ty: 0 }
    const focus = { x: 200, y: 300 }
    const before = screenToPage(v, focus)
    const next = zoomAbout(v, focus, 2.5)
    const after = screenToPage(next, focus)
    expect(after.x).toBeCloseTo(before.x)
    expect(after.y).toBeCloseTo(before.y)
  })
  it('clamps the scale', () => {
    expect(zoomAbout({ scale: 1, tx: 0, ty: 0 }, { x: 0, y: 0 }, 99, 1, 4).scale).toBe(4)
    expect(clampZoom(0.2)).toBe(1)
  })
})

describe('pinch and scroll', () => {
  it('measures a pinch', () => {
    const { dist, mid } = pinchOf({ x: 0, y: 0 }, { x: 6, y: 8 })
    expect(dist).toBe(10)
    expect(mid).toEqual({ x: 3, y: 4 })
  })
  it('scrolls so the pointed content stays put', () => {
    // 400px column, scrolled 100, pointer at 50 in the viewport => content x = 150
    const next = scrollAfterZoom(100, 50, 400, 800)
    expect(next).toBe(250) // content x = 300 at 2x, minus the 50 focus
  })
  it('fits a page', () => {
    expect(fitWidth(595, 595)).toBe(1)
    expect(fitWidth(300, 600)).toBe(0.5)
  })
})

describe('pointInPolygon', () => {
  const square = [
    { x: 0, y: 0 },
    { x: 10, y: 0 },
    { x: 10, y: 10 },
    { x: 0, y: 10 },
  ]
  it('hits inside, misses outside', () => {
    expect(pointInPolygon({ x: 5, y: 5 }, square)).toBe(true)
    expect(pointInPolygon({ x: 15, y: 5 }, square)).toBe(false)
  })
  it('handles a concave polygon', () => {
    const l = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 4 },
      { x: 4, y: 4 },
      { x: 4, y: 10 },
      { x: 0, y: 10 },
    ]
    expect(pointInPolygon({ x: 2, y: 8 }, l)).toBe(true)
    expect(pointInPolygon({ x: 8, y: 8 }, l)).toBe(false)
  })
})
