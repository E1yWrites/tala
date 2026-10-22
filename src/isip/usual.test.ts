import { describe, expect, it } from 'vitest'
import { addDays } from '@/entries/dates'
import { DEFAULT_CONTEXT } from '@/entries/parse'
import type { IsipEntry } from '@/types/models'
import { suggestions, usualLines } from './usual'

const TODAY = '2026-10-22' // a Thursday
const NOW = new Date(`${TODAY}T08:00:00`).getTime()
const ctx = { ...DEFAULT_CONTEXT, ticks: ['water'], aliases: { exercise: {}, merchant: {} }, categories: {} }
let n = 0
const entry = (text: string, daysAgo: number, hm = '08:00'): IsipEntry => {
  const day = addDays(TODAY, -daysAgo)
  const at = new Date(`${day}T${hm}:00`).getTime()
  return { id: String(n++), text, day, createdAt: at, updatedAt: at }
}

describe('usual lines', () => {
  it('lines written on 3+ days of the last 4 weeks, the ones written around this hour first, not yet today', () => {
    const es = [
      ...[1, 2, 3, 4].map((d) => entry('kape 120', d, '15:00')),
      ...[1, 3, 5].map((d) => entry('jeep 13', d, '07:30')),
      ...[2, 9, 16].map((d) => entry('Bench 40kg 3x10', d, '18:00')),
      ...[1, 2, 3].map((d) => entry('lunch 150', d, '12:00')), entry('lunch 150', 0, '12:00'), // already written today
      ...[1, 2, 3].map((d) => entry('water 3', d)), // a habit: Done counts it up
      ...[1, 2, 3].map((d) => entry('@ fri 2pm dentist', d)), // a plan, not a log
      ...[1, 2].map((d) => entry('grab 200', d)), // only twice
      ...[30, 31, 32].map((d) => entry('load 99', d)), // too long ago
      ...[1, 2, 3].map((d) => entry('just a thought', d)), // nothing read
    ]
    expect(usualLines(es, NOW, 4, ctx)).toEqual(['jeep 13', 'kape 120', 'Bench 40kg 3x10'])
  })
})

describe('suggestions', () => {
  it('your lines written twice, most often first, then the starters whose first word you do not use', () => {
    const es = [entry('jeep 15', 1), entry('jeep 15', 2), entry('jeep 15', 3), entry('kape 120', 1), entry('kape 120', 4), entry('once only', 1)]
    expect(suggestions(es, NOW, ['lunch 150', 'jeep 13', 'kape 120'])).toEqual(['jeep 15', 'kape 120', 'lunch 150'])
    expect(suggestions([], NOW, ['lunch 150', 'jeep 13'])).toEqual(['lunch 150', 'jeep 13'])
  })
})
