import { describe, expect, it } from 'vitest'
import { dayGroupLabels } from './noteFilters'
import type { Note } from '@/types/models'

const now = new Date(2026, 9, 7, 15, 0).getTime()
const at = (daysAgo: number, pinned = false): Note =>
  ({ id: String(Math.random()), isPinned: pinned, updatedAt: now - daysAgo * 86_400_000 }) as Note

describe('dayGroupLabels', () => {
  it('labels the first row of each group only', () => {
    const labels = dayGroupLabels([at(9, true), at(0), at(0), at(1), at(3), at(30)], true, now)
    expect(labels).toEqual(['Pinned', 'Today', undefined, 'Yesterday', 'This week', 'Earlier'])
  })
  it('ignores pins when pinned notes are not sorted first', () => {
    expect(dayGroupLabels([at(0, true)], false, now)).toEqual(['Today'])
  })
})
