import { describe, expect, it } from 'vitest'
import type { InkStroke } from '@/types/ink'
import { inkHistoryState, recordInk, stepInk } from './inkHistory'

const s = (id: string): InkStroke => ({ id, tool: 'pen', color: '#000', size: 2, points: [{ x: 0, y: 0 }] })
const all = (): boolean => true

describe('note-wide ink history', () => {
  it('undoes the newest change whichever page it was on, and redoes it', () => {
    recordInk('n1', { pageId: 'p1', before: [], after: [s('a')] })
    recordInk('n1', { pageId: 'p2', before: [], after: [s('b')] })
    expect(stepInk('n1', 'undo', all)?.pageId).toBe('p2')
    expect(stepInk('n1', 'undo', all)?.pageId).toBe('p1')
    expect(inkHistoryState('n1')).toEqual({ canUndo: false, canRedo: true })
    expect(stepInk('n1', 'redo', all)?.pageId).toBe('p1')
    expect(stepInk('n1', 'undo', all)?.after[0]?.id).toBe('a')
  })

  it('a new change clears redo; notes keep separate histories', () => {
    recordInk('n2', { pageId: 'p1', before: [], after: [s('a')] })
    stepInk('n2', 'undo', all)
    recordInk('n2', { pageId: 'p1', before: [], after: [s('c')] })
    expect(inkHistoryState('n2')).toEqual({ canUndo: true, canRedo: false })
    expect(inkHistoryState('other')).toEqual({ canUndo: false, canRedo: false })
  })

  it('skips changes on deleted pages', () => {
    recordInk('n3', { pageId: 'kept', before: [], after: [s('a')] })
    recordInk('n3', { pageId: 'gone', before: [], after: [s('b')] })
    expect(stepInk('n3', 'undo', (id) => id !== 'gone')?.pageId).toBe('kept')
    expect(inkHistoryState('n3')).toEqual({ canUndo: false, canRedo: true })
  })

  it('keeps the last 100 changes', () => {
    for (let i = 0; i < 105; i++) recordInk('n4', { pageId: `p${i}`, before: [], after: [] })
    let n = 0
    while (stepInk('n4', 'undo', all)) n++
    expect(n).toBe(100)
  })
})
