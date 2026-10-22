import { describe, expect, it } from 'vitest'
import { readDates } from './dates'

const PIN = '2026-10-08' // a Thursday

const day = (s: string, past = false) => readDates(s, PIN, { past }).when?.day
const time = (s: string, event = false) => {
  const w = readDates(s, PIN, { event }).when
  return w?.end ? `${w.time}-${w.end}` : w?.time
}

describe('days', () => {
  it.each([
    ['bukas', '2026-10-09'],
    ['tomorrow', '2026-10-09'],
    ['kahapon', '2026-10-07'],
    ['mamaya', '2026-10-08'],
    ['mamayang gabi', '2026-10-08'],
    ['samakalawa', '2026-10-10'],
    ['fri', '2026-10-09'],
    ['thu', '2026-10-08'],
    ['wed', '2026-10-14'],
    ['sa Lunes', '2026-10-12'],
    ['Biyernes', '2026-10-09'],
    ['next fri', '2026-10-16'],
    ['next week', '2026-10-12'],
    ['last fri', '2026-10-02'],
    ['in 3 days', '2026-10-11'],
    ['oct 10', '2026-10-10'],
    ['10 oct', '2026-10-10'],
    ['October 10th', '2026-10-10'],
    ['jan 5', '2027-01-05'],
    ['10/15', '2026-10-15'],
    ['the 15th', '2026-10-15'],
    ['kinsenas', '2026-10-15'],
    ['katapusan', '2026-10-31'],
    ['ika-3', '2026-11-03'],
  ])('%s → %s', (phrase, expected) => {
    expect(day(`quiz ${phrase}`)).toBe(expected)
  })

  it('reads a bare weekday backwards for money', () => {
    expect(day('lunch wed', true)).toBe('2026-10-07')
    expect(day('lunch fri', true)).toBe('2026-10-02')
  })

  it('keeps the other words, in order', () => {
    expect(readDates('quiz sa Biyernes Rm 301', PIN).rest).toBe('quiz Rm 301')
  })
})

describe('times', () => {
  it.each([
    ['2pm', '14:00'],
    ['9am', '09:00'],
    ['9 am', '09:00'],
    ['9:30', '09:30'],
    ['3:00', '15:00'],
    ['14:00', '14:00'],
    ['12nn', '12:00'],
    ['alas-3', '15:00'],
    ['alas 3', '15:00'],
    ['alas-tres ng hapon', '15:00'],
    ['alas-tres y medya', '15:30'],
    ['alas-7 ng umaga', '07:00'],
    ['alas-8 ng gabi', '20:00'],
    ['9am-11am', '09:00-11:00'],
    ['9am to 11', '09:00-11:00'],
  ])('%s → %s', (phrase, expected) => {
    expect(time(`dentist ${phrase}`)).toBe(expected)
  })

  it.each([
    ['9-10:30', '09:00-10:30'],
    ['1-2:30', '13:00-14:30'],
    ['7-9pm', '19:00-21:00'],
    ['11-1', '11:00-13:00'],
    ['7-8:30', '07:00-08:30'],
  ])('event range %s → %s', (phrase, expected) => {
    expect(time(`Calc ${phrase}`, true)).toBe(expected)
  })

  it('does not read counts, pages or scores as times', () => {
    expect(time('read pages 10-20')).toBeUndefined()
    expect(time('water 3')).toBeUndefined()
    expect(time('150 students attended')).toBeUndefined()
    expect(readDates('read pages 10-20', PIN).rest).toBe('read pages 10-20')
  })
})

describe('repeats', () => {
  const rep = (s: string, event = false) => readDates(s, PIN, { event }).repeat

  it.each([
    ['every 15th', { unit: 'month', every: 1, on: [15] }],
    ['every 15 and 30', { unit: 'month', every: 1, on: [15, 30] }],
    ['tuwing kinsenas at katapusan', { unit: 'month', every: 1, on: [15, -1] }],
    ['tuwing Lunes', { unit: 'week', every: 1, on: [1] }],
    ['every mon and wed', { unit: 'week', every: 1, on: [1, 3] }],
    ['every mon, wed', { unit: 'week', every: 1, on: [1, 3] }],
    ['every weekday', { unit: 'week', every: 1, on: [1, 2, 3, 4, 5] }],
    ['every other wed', { unit: 'week', every: 2, on: [3] }],
    ['every 2 weeks', { unit: 'week', every: 2 }],
    ['every ~6w', { unit: 'week', every: 6, approx: true }],
    ['every ~6 months', { unit: 'month', every: 6, approx: true }],
    ['daily', { unit: 'day', every: 1 }],
    ['araw-araw', { unit: 'day', every: 1 }],
  ])('%s', (phrase, expected) => {
    expect(rep(`bill ${phrase}`)).toEqual(expected)
  })

  it('reads timetable day codes on event lines only, case-sensitively', () => {
    expect(rep('MWF 9-10:30', true)).toEqual({ unit: 'week', every: 1, on: [1, 3, 5] })
    expect(rep('TTh 1-2:30', true)).toEqual({ unit: 'week', every: 1, on: [2, 4] })
    expect(rep('MWF 9-10:30')).toBeUndefined()
    expect(readDates('meet at SM 3pm', PIN, { event: true }).repeat).toBeUndefined()
  })

  it('reads a whole timetable line', () => {
    const r = readDates('MWF 9-10:30 Calc 1 until dec 12', PIN, { event: true })
    expect(r.repeat).toEqual({ unit: 'week', every: 1, on: [1, 3, 5], until: '2026-12-12' })
    expect(r.when).toEqual({ time: '09:00', end: '10:30' })
    expect(r.rest).toBe('Calc 1')
  })
})

describe('deadlines', () => {
  it('splits a deadline from a planned day', () => {
    expect(readDates('essay due fri', PIN)).toEqual({ due: { day: '2026-10-09' }, rest: 'essay' })
    expect(readDates('essay hanggang bukas', PIN)).toEqual({ due: { day: '2026-10-09' }, rest: 'essay' })
    expect(readDates('essay mon due fri 5pm', PIN)).toEqual({
      when: { day: '2026-10-12' },
      due: { day: '2026-10-09', time: '17:00' },
      rest: 'essay',
    })
  })

  it('leaves "by" alone when no date follows', () => {
    expect(readDates('made by mom', PIN)).toEqual({ rest: 'made by mom' })
  })
})

describe('skips and ISO days', () => {
  it('reads "skip" days on a repeat, and ISO dates', () => {
    expect(readDates('MWF 9-10:30 Calc skip oct 14 except 2026-10-16', PIN, { event: true }).repeat).toEqual({
      unit: 'week',
      every: 1,
      on: [1, 3, 5],
      skip: ['2026-10-14', '2026-10-16'],
    })
    expect(readDates('quiz 2026-11-03', PIN).when).toEqual({ day: '2026-11-03' })
  })
})
