import { describe, expect, it } from 'vitest'
import {
  GAP_CAP_MS,
  PULSE_MS,
  STUDY_DAY_SECONDS,
  WRAPUP_MIN_MS,
  creditFor,
  dayKey,
  makeWrapup,
  studyDaysThisWeek,
  weekDays,
  weekKey,
} from './study'

// Wednesday 7 Oct 2026, local noon
const WED = new Date(2026, 9, 7, 12).getTime()

describe('weeks', () => {
  it('a week starts on Monday', () => {
    expect(weekKey(WED)).toBe('2026-10-05')
    expect(weekKey(new Date(2026, 9, 11, 23, 59).getTime())).toBe('2026-10-05') // Sunday still belongs to it
    expect(weekKey(new Date(2026, 9, 12, 0, 1).getTime())).toBe('2026-10-12')
  })
  it('lists Monday to Sunday and marks today', () => {
    const days = weekDays({}, WED)
    expect(days.map((d) => d.key)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11'])
    expect(days.filter((d) => d.today).map((d) => d.key)).toEqual(['2026-10-07'])
  })
  it('counts only days with five minutes of writing, and only this week', () => {
    const seconds = {
      '2026-10-05': STUDY_DAY_SECONDS,
      '2026-10-06': STUDY_DAY_SECONDS - 1,
      '2026-10-07': 3600,
      '2026-10-04': 9999, // last week
    }
    expect(studyDaysThisWeek(seconds, WED)).toBe(2)
  })
  it('keys days locally', () => {
    expect(dayKey(new Date(2026, 0, 2, 0, 5).getTime())).toBe('2026-01-02')
  })
})

describe('creditFor', () => {
  it('credits the gap while writing continues, a pulse after a pause', () => {
    expect(creditFor(1000, 4000)).toBe(3000)
    expect(creditFor(1000, 1000 + GAP_CAP_MS)).toBe(GAP_CAP_MS)
    expect(creditFor(1000, 1000 + GAP_CAP_MS + 1)).toBe(PULSE_MS)
    expect(creditFor(null, 5000)).toBe(PULSE_MS)
  })
})

describe('makeWrapup', () => {
  const base = { noteId: 'n', title: 'Enzymes', pagesAtStart: 2, pagesNow: 4, tasksLeft: 3, now: 99 }
  it('skips a session too short to mention', () => {
    expect(makeWrapup({ ...base, activeMs: WRAPUP_MIN_MS - 1 })).toBeNull()
  })
  it('summarises minutes, pages added and tasks left', () => {
    expect(makeWrapup({ ...base, activeMs: 14 * 60_000 + 20_000 })).toEqual({
      noteId: 'n', title: 'Enzymes', minutes: 14, pagesAdded: 2, tasksLeft: 3, at: 99,
    })
  })
  it('never reports negative pages (a page was deleted)', () => {
    expect(makeWrapup({ ...base, pagesNow: 1, activeMs: 5 * 60_000 })!.pagesAdded).toBe(0)
  })
})
