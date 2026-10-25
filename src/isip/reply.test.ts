import { describe, expect, it } from 'vitest'
import type { IsipEntry } from '@/types/models'
import { read } from './read'
import { reply } from './reply'

const DAY = '2026-10-22'
let n = 0
const line = (text: string): IsipEntry => ({ id: `e${++n}`, text, day: DAY, createdAt: Date.UTC(2026, 9, 22, 1, n) }) as IsipEntry
const say = (e: IsipEntry, day: IsipEntry[], targets: Record<string, number> = {}, liftNote?: string): string =>
  reply(e, read(e), { day, today: DAY, targets, liftNote })

describe('reply', () => {
  it('names the amount and the account, and adds up the day’s food', () => {
    const a = line('P150 lunch gcash')
    const b = line('P60 kape')
    expect(say(a, [a])).toMatch(/₱150.*GCash/)
    expect(say(b, [a, b])).toContain('That’s ₱210 on food today.')
  })

  it('counts a habit against its target', () => {
    const a = line('✓ water 5')
    expect(say(a, [a], { water: 8 })).toBe('Water: 5 of 8 today, 3 to go.')
  })

  it('cheers a PR', () => {
    const a = line('bench 40kg 3x10')
    expect(say(a, [a], {}, 'PR')).toMatch(/PR!$/)
  })

  it('answers how the day feels', () => {
    const a = line('sobrang pagod today')
    expect(say(a, [a])).toMatch(/Pahinga|Rest/)
  })

  it('keeps one wording per line', () => {
    const a = line('just thinking out loud')
    expect(say(a, [a])).toBe(say(a, [a]))
  })
})
