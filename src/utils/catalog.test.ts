import { describe, expect, it } from 'vitest'
import { catalogNumbers, formatCatalog } from './catalog'
import type { Note } from '@/types/models'

const note = (id: string, createdAt: number): Note => ({ id, createdAt } as Note)

describe('catalogNumbers', () => {
  it('numbers notes in creation order, ties broken by id', () => {
    const map = catalogNumbers([note('c', 30), note('a', 10), note('b', 10)])
    expect([map.get('a'), map.get('b'), map.get('c')]).toEqual([1, 2, 3])
  })
  it('pads to three digits', () => {
    expect(formatCatalog(7)).toBe('№ 007')
    expect(formatCatalog(1234)).toBe('№ 1234')
  })
})
