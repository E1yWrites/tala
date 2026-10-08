import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTEXT, entryLabel, parseLine, suggestMarker } from './parse'

const PIN = '2026-10-08' // a Thursday
const parse = (s: string, task = false) => parseLine(s, PIN, DEFAULT_CONTEXT, task)

describe('money', () => {
  it.each([
    ['P150 lunch gcash', { flow: 'out', amount: 150, account: 'gcash', text: 'lunch', day: PIN }],
    ['₱150 lunch', { flow: 'out', amount: 150, text: 'lunch', day: PIN }],
    ['Php 1.5k tuition', { flow: 'out', amount: 1500, text: 'tuition', day: PIN }],
    ['P1,299.50 globe', { flow: 'out', amount: 1299.5, text: 'globe', day: PIN }],
    ['+P500 baon cash', { flow: 'in', amount: 500, account: 'cash', text: 'baon', day: PIN }],
    ['P500 gcash>cash', { flow: 'move', amount: 500, account: 'gcash', to: 'cash', text: '', day: PIN }],
    ['P85 jeep kahapon', { flow: 'out', amount: 85, text: 'jeep', day: '2026-10-07' }],
  ])('%s', (line, expected) => {
    expect(parse(line)).toEqual({ kind: 'money', ...expected })
  })

  it('needs the peso marker', () => {
    expect(parse('150 lunch')).toBeNull()
    expect(parse('p150 lunch')).toBeNull()
    expect(parse('Page 12 summary')).toBeNull()
    expect(parse('PE class')).toBeNull()
  })
})

describe('events', () => {
  it('reads appointments, classes, bills and due-again trackers', () => {
    expect(parse('@ thu 2pm dentist')).toEqual({ kind: 'event', text: 'dentist', when: { day: PIN, time: '14:00' } })
    expect(parse('@ MWF 9-10:30 Calc 1')).toEqual({
      kind: 'event',
      text: 'Calc 1',
      when: { time: '09:00', end: '10:30' },
      repeat: { unit: 'week', every: 1, on: [1, 3, 5] },
    })
    expect(parse('@ every 15th P1299 globe')).toEqual({
      kind: 'event',
      text: 'globe',
      repeat: { unit: 'month', every: 1, on: [15] },
      amount: 1299,
    })
    expect(parse('@ haircut every ~6w')).toEqual({
      kind: 'event',
      text: 'haircut',
      repeat: { unit: 'week', every: 6, approx: true },
    })
  })

  it('needs the @ and a space', () => {
    expect(parse('@mention someone')).toBeNull()
    expect(parse('dentist thu 2pm')).toBeNull()
  })
})

describe('tasks', () => {
  it('splits planned day from deadline, in Taglish too', () => {
    expect(parse('essay fri', true)).toEqual({ kind: 'task', text: 'essay', when: { day: '2026-10-09' } })
    expect(parse('essay due fri', true)).toEqual({ kind: 'task', text: 'essay', due: { day: '2026-10-09' } })
    expect(parse('essay hanggang bukas', true)).toEqual({ kind: 'task', text: 'essay', due: { day: '2026-10-09' } })
    expect(parse('buy eggs', true)).toEqual({ kind: 'task', text: 'buy eggs' })
  })
})

describe('ticks', () => {
  it('✓ ticks anything, x only a known name', () => {
    expect(parse('✓ water 3')).toEqual({ kind: 'tick', name: 'water', count: 3, day: PIN })
    expect(parse('✓ gym kahapon')).toEqual({ kind: 'tick', name: 'gym', count: 1, day: '2026-10-07' })
    expect(parse('x water')).toBeNull()
    expect(parse('x = 5')).toBeNull()
    expect(parseLine('x Water 2', PIN, { ...DEFAULT_CONTEXT, ticks: ['water'] })).toEqual({
      kind: 'tick',
      name: 'water',
      count: 2,
      day: PIN,
    })
  })
})

describe('prose stays prose', () => {
  it.each(['150 students attended', '1920x1080 screenshot', 'x = 5', 'Monday was tough', 'Chapter 3 notes', ''])('%s', (line) => {
    expect(parse(line)).toBeNull()
  })
})

describe('suggestMarker (journal pages)', () => {
  it.each([
    ['150 lunch', 'P'],
    ['1,299 globe bill', 'P'],
    ['dentist thu 2pm', '@ '],
    ['meeting alas-3', '@ '],
    ['150 students attended', null],
    ['3 pages read', null],
    ['2 hours study', null],
    ['Monday was tough', null],
    ['P150 lunch', null], // already an entry
  ])('%s → %s', (line, expected) => {
    expect(suggestMarker(line, PIN)).toBe(expected)
  })

  it('suggests a tick for a known habit', () => {
    expect(suggestMarker('water 3', PIN, { ...DEFAULT_CONTEXT, ticks: ['water'] })).toBe('✓ ')
  })
})

describe('entryLabel', () => {
  it('says what the line became', () => {
    expect(entryLabel(parse('P150 lunch gcash')!)).toBe('−₱150 · GCash')
    expect(entryLabel(parse('+P500 baon cash')!)).toBe('+₱500 · Cash')
    expect(entryLabel(parse('P500 gcash>cash')!)).toBe('₱500 GCash → Cash')
    expect(entryLabel(parse('@ MWF 9-10:30 Calc 1')!)).toBe('Mon, Wed, Fri · 9am–10:30am')
    expect(entryLabel(parse('@ every 15th P1299 globe')!)).toBe('every 15th · ₱1,299')
    expect(entryLabel(parse('@ haircut every ~6w')!)).toBe('every ~6 weeks')
    expect(entryLabel(parse('✓ water 3')!)).toBe('✓ water ×3')
    expect(entryLabel(parse('buy eggs', true)!)).toBe('')
  })
})

describe('reminders', () => {
  it('reads ! (at the time) and !15m / !2h / !1d (before)', () => {
    expect(parse('@ thu 2pm dentist !30m')).toMatchObject({ text: 'dentist', remind: 30 })
    expect(parse('@ thu 2pm dentist !')).toMatchObject({ text: 'dentist', remind: 0 })
    expect(parse('essay due fri !1d', true)).toMatchObject({ text: 'essay', remind: 1440 })
    expect(parse('@ every 15th P1299 globe !2h')).toMatchObject({ amount: 1299, remind: 120 })
    expect(parse('wow!', true)).toEqual({ kind: 'task', text: 'wow!' })
    expect(entryLabel(parse('@ thu 2pm dentist !30m')!)).toBe('Thu, Oct 8 · 2pm · remind 30m before')
  })
})
