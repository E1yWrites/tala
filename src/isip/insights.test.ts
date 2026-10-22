import { describe, expect, it } from 'vitest'
import { addDays } from '@/entries/dates'
import { DEFAULT_CONTEXT } from '@/entries/parse'
import { isipRefs } from '@/entries/scan'
import { foodMix, gymFood, mentions, planLine, priceChanges, recurring, usualSplit, weekOf, weeklyTops } from './insights'
import { parseLine } from '@/entries/parse'

const TODAY = '2026-10-22' // a Thursday
const ctx = { ...DEFAULT_CONTEXT, ticks: ['gym'], aliases: { exercise: {}, merchant: {} }, categories: {} }
let n = 0
/** Isip Entries as [day, line], read the way the views read them. */
const refs = (lines: Array<[string, string]>) =>
  isipRefs(
    lines.map(([day, text]) => ({ id: String(n++), text, day, createdAt: new Date(`${day}T09:00:00`).getTime() + n, updatedAt: 0 })),
    ctx,
  )

describe('workouts', () => {
  it('the usual split shows for a weekday with 3 Workouts: what was done on at least half of them', () => {
    const r = refs([
      ['2026-10-05', 'bench 60x5x3'], ['2026-10-05', 'ohp 30kg 3x8'],
      ['2026-10-12', 'bench 60x5x3'], ['2026-10-12', 'ohp 30kg 3x8'], ['2026-10-12', 'curl 10kg 3x12'],
      ['2026-10-19', 'bench 62.5x5x3'], ['2026-10-19', 'dips bw x 12'],
      ['2026-10-07', 'squat 80x5x3'], ['2026-10-14', 'squat 80x5x3'],
    ])
    expect(usualSplit(r)).toEqual([{ weekday: 1, exercises: ['Bench press', 'Overhead press'], workouts: 3 }])
  })

  it('top weight per week shows once an exercise spans 4 weeks', () => {
    const lines: Array<[string, string]> = [['2026-09-29', 'bench 55x5x3'], ['2026-10-01', 'bench 57.5x5'], ['2026-10-06', 'bench 57.5x5x3'], ['2026-10-13', 'bench 60x5x3']]
    expect(weeklyTops(refs(lines))).toEqual([])
    expect(weeklyTops(refs([...lines, ['2026-10-20', 'bench 60x5x3'], ['2026-10-20', 'pull ups bw x 10']]))).toEqual([
      { name: 'Bench press', weeks: [{ week: '2026-09-28', top: 57.5 }, { week: '2026-10-05', top: 57.5 }, { week: '2026-10-12', top: 60 }, { week: '2026-10-19', top: 60 }] },
    ])
    expect(weekOf('2026-10-25')).toBe('2026-10-19') // Sunday belongs to the week that began Monday
  })
})

describe('money', () => {
  it('groceries vs eating out vs delivery over 4 weeks, once Food spans 2 weeks', () => {
    const recent: Array<[string, string]> = [['2026-10-20', 'puregold 1,200'], ['2026-10-21', 'lunch sa jollibee 189'], ['2026-10-22', 'grabfood 320'], ['2026-09-01', 'puregold 900']]
    expect(foodMix(refs([['2026-10-09', 'kape 120'], ...recent.slice(0, 3)]), TODAY)).toBeNull()
    expect(foodMix(refs([['2026-10-08', 'kape 120'], ...recent]), TODAY)).toEqual({ groceries: 1200, eatingOut: 189, delivery: 320, from: '2026-09-25' })
  })

  it('a cost that comes back: same amount and category on 3 days, even gaps of a week or more', () => {
    const r = refs([
      ['2026-08-08', 'netflix 149'], ['2026-09-08', 'netflix 149'], ['2026-10-08', 'netflix 149'],
      ...[0, 1, 2, 3, 4].map((i): [string, string] => [addDays('2026-10-12', i), 'jeep 13']),
      ['2026-09-01', 'load 99'], ['2026-10-01', 'load 99'],
      ['2026-09-02', 'gym 500'], ['2026-09-09', 'gym 500'], ['2026-10-20', 'gym 500'],
    ])
    expect(recurring(r)).toEqual([{ amount: 149, category: 'Bills & load', text: 'netflix', every: 31, last: '2026-10-08', next: '2026-11-08', times: 3 }])
  })

  it('a recurring cost plans as a repeating bill line the parser reads back', () => {
    const base = { amount: 149, category: 'Bills & load', text: 'netflix', last: '2026-10-08', times: 3 }
    const cases: Array<[number, string, string, Record<string, unknown>]> = [
      [31, '2026-11-08', '@ every 8th P149 netflix', { unit: 'month', every: 1, on: [8] }],
      [7, '2026-10-15', '@ every thu P149 netflix', { unit: 'week', every: 1, on: [4] }],
      [14, '2026-10-22', '@ every other thu P149 netflix', { unit: 'week', every: 2, on: [4] }],
      [21, '2026-10-29', '@ every 3 weeks P149 netflix', { unit: 'week', every: 3 }],
      [10, '2026-10-18', '@ every 10 days P149 netflix', { unit: 'day', every: 10 }],
    ]
    for (const [every, next, line, repeat] of cases) {
      expect(planLine({ ...base, every, next })).toBe(line)
      expect(parseLine(line, TODAY)).toMatchObject({ kind: 'event', amount: 149, text: 'netflix', repeat })
    }
  })

  it('a grocery Item bought twice: the last price against the one before', () => {
    const r = refs([
      ['2026-10-10', 'grocery 300 — eggs 98, milk 115'],
      ['2026-10-17', 'palengke: Eggs 106, milk 115, gulay 60'],
    ])
    expect(priceChanges(r)).toEqual([
      { name: 'Eggs', last: 106, prev: 98, day: '2026-10-17' },
      { name: 'milk', last: 115, prev: 115, day: '2026-10-17' },
    ])
  })

  it('food on gym days vs other days, over days with something written, once the first gym day is 2 weeks back', () => {
    const lines: Array<[string, string]> = [
      ['2026-10-05', 'bench 60x5x3'], ['2026-10-05', 'lunch 200'],
      ['2026-10-07', '✓ gym'], ['2026-10-07', 'dinner 300'],
      ['2026-10-06', 'kape 100'],
      ['2026-10-09', 'jeep 13'], // written, no food: a ₱0 food day
      ['2026-10-22', 'lunch 999'], // today is not counted yet
    ]
    expect(gymFood(refs(lines), TODAY)).toEqual({ gym: 250, rest: 50, gymDays: 2, restDays: 2 })
    expect(gymFood(refs(lines), '2026-10-18')).toBeNull()
  })
})

describe('Bituin', () => {
  it('one mention per unlocked insight, describing, never judging', () => {
    const r = refs([
      ['2026-10-10', 'grocery: eggs 98'],
      ['2026-10-17', 'grocery: eggs 106'],
    ])
    expect(mentions(r, TODAY)).toEqual([{ key: 'price', view: 'money', text: 'Eggs cost ₱8 more than last time.' }])
    expect(mentions(refs([['2026-10-21', 'kape 120']]), TODAY)).toEqual([])
  })
})
