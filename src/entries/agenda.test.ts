import { describe, expect, it } from 'vitest'
import { addMonths, agenda, trackers } from './agenda'
import { DEFAULT_CONTEXT, parseLine } from './parse'
import type { EntryRef } from './scan'

const TODAY = '2026-10-08' // a Thursday

/** A line as the scanner would hand it over: written on `at`. */
function line(text: string, at = TODAY, task?: { checked: boolean }): EntryRef {
  const body = task ? text.replace(/^\[[ xX]\]\s+/, '') : text
  const entry = parseLine(body, at, DEFAULT_CONTEXT, !!task)!
  return { noteId: 'n', pageId: 'p', pageNumber: 1, path: [Math.random()], text: body, at, archived: false, task, entry }
}
const task = (text: string, at = TODAY, checked = false) => line(text, at, { checked })
const days = (refs: EntryRef[], n = 7, from = TODAY) => agenda(refs, from, n, TODAY).map((o) => `${o.day} ${o.time ?? ''} ${o.title}`.replace(/\s+/g, ' ').trim())

describe('tasks', () => {
  it('a planned day waits on Today once it passes; only deadlines go overdue', () => {
    const o = agenda([task('essay mon', '2026-10-01'), task('report due tue', '2026-10-01'), task('read ch 3 sat')], TODAY, 7, TODAY)
    expect(o.map((x) => [x.title, x.day, x.overdue])).toEqual([
      ['essay', TODAY, undefined],
      ['report', TODAY, 2],
      ['read ch 3', '2026-10-10', undefined],
    ])
  })

  it('leaves out ticked and undated tasks', () => {
    expect(days([task('done fri', TODAY, true), task('someday')])).toEqual([])
  })
})

describe('events', () => {
  it('puts one-offs on their day and a bare time on the day it was written', () => {
    expect(days([line('@ fri 2pm dentist'), line('@ 5pm gym')])).toEqual([`${TODAY} 17:00 gym`, '2026-10-09 14:00 dentist'])
  })

  it('expands a timetable, minus skips, until its end', () => {
    const calc = line('@ MWF 9-10:30 Calc 1 skip oct 14 until oct 23')
    expect(days([calc], 21)).toEqual([
      '2026-10-09 09:00 Calc 1',
      '2026-10-12 09:00 Calc 1',
      '2026-10-16 09:00 Calc 1',
      '2026-10-19 09:00 Calc 1',
      '2026-10-21 09:00 Calc 1',
      '2026-10-23 09:00 Calc 1',
    ])
  })

  it('repeats bills on the 15th and the last day, and pay cycles on 15 & 30 even in February', () => {
    const bill = agenda([line('@ every 15th P1299 globe')], TODAY, 40, TODAY)
    expect(bill.map((o) => [o.day, o.amount])).toEqual([['2026-10-15', 1299], ['2026-11-15', 1299]])
    const pay = agenda([line('@ tuwing kinsenas at katapusan sweldo')], '2027-02-01', 28, TODAY).map((o) => o.day)
    expect(pay).toEqual(['2027-02-15', '2027-02-28'])
    const thirty = agenda([line('@ every 15 and 30 sweldo')], '2027-02-01', 28, TODAY).map((o) => o.day)
    expect(thirty).toEqual(['2027-02-15', '2027-02-28'])
  })

  it('every other week counts from the week it started', () => {
    expect(days([line('@ every other wed org meeting')], 28).map((d) => d.slice(0, 10))).toEqual(['2026-10-14', '2026-10-28'])
  })

  it('orders a day: timed by time, then the rest', () => {
    expect(days([task('buy eggs thu'), line('@ 3pm lab'), line('@ 9am lecture')], 1)).toEqual([`${TODAY} 09:00 lecture`, `${TODAY} 15:00 lab`, `${TODAY} buy eggs`])
  })
})

describe('due-again trackers', () => {
  it('is due that long after the last tick, or after the day it was written', () => {
    const haircut = line('@ haircut every ~6w', '2026-08-01')
    expect(trackers([haircut], TODAY).map((o) => [o.day, o.overdue])).toEqual([[TODAY, 26]])
    const ticked = [haircut, line('✓ haircut', '2026-10-01')]
    expect(trackers(ticked, TODAY).map((o) => [o.day, o.overdue])).toEqual([['2026-11-12', undefined]])
    expect(agenda(ticked, TODAY, 7, TODAY)).toEqual([]) // not this week
  })

  it('reads a date on the line as the last time', () => {
    expect(trackers([line('@ dentist every ~4 months may 2')], TODAY).map((o) => [o.day, o.overdue])).toEqual([[TODAY, 36]])
  })
})

describe('addMonths', () => {
  it('clamps to the end of a shorter month', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(addMonths('2026-10-08', 6)).toBe('2027-04-08')
  })
})

describe('every other month', () => {
  it('counts from the first 15th after it was written', () => {
    expect(agenda([line('@ every other month on the 15th rent', '2026-10-20')], '2026-10-20', 120, '2026-10-20').map((o) => o.day)).toEqual([
      '2026-11-15',
      '2027-01-15',
    ])
  })
})
