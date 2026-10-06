import { describe, expect, it } from 'vitest'
import type { InkStroke } from '@/types/ink'
import { lassoPath, strokesInLasso } from './lasso'

const stroke = (id: string, pts: [number, number][]): InkStroke => ({
  id,
  tool: 'pen',
  color: '#000',
  size: 2,
  points: pts.map(([x, y]) => ({ x, y })),
})

const loop = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
]

describe('strokesInLasso', () => {
  const inside = stroke('in', [[10, 10], [50, 50], [90, 20]])
  const outside = stroke('out', [[200, 200], [300, 250]])
  const half = stroke('half', [[50, 50], [60, 60], [150, 60], [160, 60]])
  const mostly = stroke('mostly', [[10, 10], [20, 20], [30, 30], [150, 30]])

  it('takes strokes inside, leaves strokes outside', () => {
    expect(strokesInLasso([inside, outside], loop)).toEqual(['in'])
  })
  it('needs at least half the points inside', () => {
    expect(strokesInLasso([half], loop)).toEqual(['half']) // exactly half counts
    expect(strokesInLasso([stroke('edge', [[50, 50], [150, 50], [160, 50]])], loop)).toEqual([])
    expect(strokesInLasso([mostly], loop)).toEqual(['mostly'])
  })
  it('ignores a degenerate lasso', () => {
    expect(strokesInLasso([inside], [{ x: 1, y: 1 }, { x: 2, y: 2 }])).toEqual([])
  })
})

describe('lassoPath', () => {
  it('closes the polygon', () => {
    expect(lassoPath(loop)).toBe('M0 0L100 0L100 100L0 100Z')
    expect(lassoPath([])).toBe('')
  })
})
