import { describe, expect, it } from 'vitest'
import type { InkStroke } from '@/types/ink'
import { groupIntoLines } from './inkLines'

const stroke = (id: string, x: number, y0: number, y1: number, tool: InkStroke['tool'] = 'pen'): InkStroke => ({
  id,
  tool,
  color: '#000',
  size: 3,
  points: [{ x, y: y0 }, { x: x + 10, y: y1 }],
})

describe('groupIntoLines', () => {
  it('groups strokes by line, lines top to bottom, strokes left to right', () => {
    const lines = groupIntoLines([
      stroke('b2', 60, 100, 130), // second line, written second
      stroke('a2', 40, 10, 40),
      stroke('a1', 10, 12, 38),
      stroke('b1', 20, 98, 128),
    ])
    expect(lines.map((l) => l.map((s) => s.id))).toEqual([['a1', 'a2'], ['b1', 'b2']])
  })

  it('keeps tall letters and dots with their line', () => {
    const lines = groupIntoLines([stroke('body', 10, 20, 40), stroke('ascender', 30, 5, 40), stroke('dot', 50, 12, 16)])
    expect(lines).toHaveLength(1)
  })

  it('ignores highlighter marks and empty strokes', () => {
    const lines = groupIntoLines([stroke('hl', 0, 0, 200, 'highlighter'), { ...stroke('empty', 0, 0, 0), points: [] }, stroke('w', 5, 5, 25)])
    expect(lines.map((l) => l.map((s) => s.id))).toEqual([['w']])
  })

  it('nothing in, nothing out', () => {
    expect(groupIntoLines([])).toEqual([])
  })
})
