import { describe, expect, it } from 'vitest'
import { menuShift } from './menuPosition'

describe('menuShift', () => {
  it('nudges an end-aligned menu at the right screen edge by the overflow only', () => {
    // trigger flush with the right edge of a 390px phone: pull in by the 8px pad, not the menu width
    expect(menuShift('end', { left: 330, right: 390 }, 200, 390)).toBe(-8)
  })
  it('pushes a menu that would leave the left edge back in', () => {
    expect(menuShift('end', { left: 0, right: 60 }, 200, 390)).toBe(148)
    expect(menuShift('start', { left: 300, right: 360 }, 200, 390)).toBe(-118)
  })
  it('leaves a menu that fits alone', () => {
    expect(menuShift('start', { left: 20, right: 80 }, 200, 390)).toBe(0)
  })
})
