import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import { habitLogs, habitRule, habitStatus, strength, studyHabit } from './habits'
import type { Habit } from './habits'
import { DEFAULT_CONTEXT, parseLine } from './parse'
import type { EntryRef } from './scan'

const TODAY = '2026-10-08' // a Thursday
let n = 0
const line = (text: string, at = TODAY): EntryRef => ({
  noteId: 'n', pageId: 'p', pageNumber: 1, path: [n++], text, at, archived: false, entry: parseLine(text, at, DEFAULT_CONTEXT)!,
})
const habit = (h: Partial<Habit> = {}): Habit => ({ id: 'h', name: 'gym', days: 7, target: 1, since: TODAY, ...h })
const log = (lines: EntryRef[], name = 'gym') => habitLogs(lines).get(name)!
/** One tick per day for the `count` days ending on `last`. */
const daily = (count: number, last: string, text = '✓ gym') => Array.from({ length: count }, (_, i) => line(text, addDays(last, -i)))
const m = (days: number) => 0.5 ** (Math.sqrt(days / 7) / 13)

describe('strength (Loop score)', () => {
  it('reaches half after 13 straight days, and a day not yet done does not lower it', () => {
    expect(strength(habit(), log(daily(13, TODAY)), TODAY)).toBeCloseTo(0.5)
    expect(strength(habit(), log(daily(12, addDays(TODAY, -1))), TODAY)).toBeCloseTo(1 - m(7) ** 12)
  })

  it('a day off leaves it alone; a miss dents it', () => {
    const withGap = (gap: string) => [...daily(5, TODAY), ...(gap ? [line(gap, addDays(TODAY, -5))] : []), ...daily(6, addDays(TODAY, -6))]
    const off = strength(habit(), log(withGap('✓ gym skip')), TODAY)
    const miss = strength(habit(), log(withGap('')), TODAY)
    expect(off).toBeCloseTo(1 - m(7) ** 11)
    expect(miss).toBeLessThan(off)
  })

  it('3 days a week every week counts every day', () => {
    const weeks = Array.from({ length: 8 }, (_, w) => addDays('2026-08-17', 7 * w)) // Mondays
    const lines = weeks.flatMap((mon) => [0, 1, 2].map((d) => line('✓ gym', addDays(mon, d))))
    // Aug 17 .. Oct 7 is 52 days, every one full
    expect(strength(habit({ days: 3 }), log(lines), TODAY)).toBeCloseTo(1 - m(3) ** 52)
  })
})

describe('status', () => {
  it('adds up a measurable habit through the day', () => {
    const water = habit({ name: 'water', target: 8 })
    expect(habitStatus(water, log([line('✓ water 3')], 'water'), TODAY)).toMatchObject({ count: 3, done: false, due: true, age: 0 })
    expect(habitStatus(water, log([line('✓ water 3', '2026-10-01')], 'water'), TODAY).age).toBe(7) // a tick before it was added counts
    const s = habitStatus(water, log([line('✓ water 3'), line('✓ water 5')], 'water'), TODAY)
    expect(s).toMatchObject({ count: 8, done: true, due: false })
    expect(s.days.map((d) => d.state)).toEqual(['none', 'none', 'none', 'done', 'later', 'later', 'later'])
  })

  it('a weekly habit is not due once the week has its days', () => {
    const lines = [line('✓ gym', '2026-10-05'), line('✓ gym', '2026-10-06'), line('✓ gym skip', '2026-10-07')]
    expect(habitStatus(habit({ days: 3 }), log(lines), TODAY)).toMatchObject({ week: 2, due: true })
    expect(habitStatus(habit({ days: 2 }), log(lines), TODAY)).toMatchObject({ week: 2, due: false })
    expect(habitStatus(habit({ days: 3 }), log(lines), TODAY).days[2]!.state).toBe('off')
  })

  it('Study is habit #1, done on days with 5 minutes of writing', () => {
    const [study, studyLog] = studyHabit({ '2026-10-06': 400, '2026-10-07': 100 }, 4, TODAY)
    expect(study).toMatchObject({ name: 'Study', days: 4, since: '2026-10-06' })
    expect(habitStatus(study, studyLog, TODAY)).toMatchObject({ week: 1, due: true })
  })

  it('says its rule', () => {
    expect(habitRule({ days: 7, target: 1 })).toBe('Every day')
    expect(habitRule({ days: 3, target: 8 })).toBe('3 days a week · 8 a day')
  })
})
