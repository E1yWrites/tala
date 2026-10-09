import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTEXT, parseLine } from './parse'
import type { EntryRef } from './scan'
import { e1rm, exercises, liftNote, strongCsv } from './workouts'
import type { Lift } from './workouts'

let n = 0
const line = (text: string, at: string): EntryRef => ({
  noteId: 'n', pageId: at, pageNumber: 1, path: [n++], text, at, archived: false, journal: true, entry: parseLine(text, at, DEFAULT_CONTEXT, false, true)!,
})
const lift = (text: string, at = '2026-10-08') => line(text, at).entry as Lift

describe('workouts', () => {
  it('estimates a one-rep max, counting RPE as reps left', () => {
    expect(e1rm(lift('bench 100x1'))).toBe(100)
    expect(e1rm(lift('bench 90x5'))).toBeCloseTo(105)
    expect(e1rm(lift('bench 90x5 @8'))).toBeCloseTo(90 * (1 + 7 / 30))
  })

  it('says "PR" or what you did last time', () => {
    const history = [line('bench 55x5x3', '2026-10-01'), line('bench 57.5x5x3', '2026-10-05'), line('bench 40x8', '2026-10-05')]
    expect(liftNote(history, lift('bench 60x5x3'))).toBe('PR')
    expect(liftNote(history, lift('Bench 50x5'))).toMatch(/^last .*5: 3×5 57.5kg$/)
    expect(liftNote(history, lift('squat 100x5'))).toBe('')
    expect(liftNote(history, lift('bench 55x5x3', '2026-10-01'))).toBe('') // nothing before the first day
  })

  it('lists each exercise with its last day and its best', () => {
    const list = exercises([line('pullups x8x3', '2026-10-01'), line('pullups 10kg x5', '2026-10-03'), line('bench 60x5', '2026-10-05'), line('bench 50x10', '2026-10-05')])
    expect(list.map((e) => [e.name, e.lastDay, e.sessions])).toEqual([['bench', '2026-10-05', 1], ['pullups', '2026-10-03', 2]])
    expect(list[0]!.last.entry.weight).toBe(60) // that day's best: 60x5 (e1RM 70) over 50x10 (66.7)
    expect(list[1]!.best).toMatchObject({ weight: 10, reps: 5 }) // any weight beats bodyweight
  })

  it('exports one Strong row per set', () => {
    const csv = strongCsv([line('bench 60x5x2 @8', '2026-10-08'), line('Bench, close grip 50x8', '2026-10-08'), line('bench 62.5x3', '2026-10-08')])
    expect(csv.split('\n')).toEqual([
      'Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE',
      '2026-10-08 00:00:00,Tala,,bench,1,60,5,0,0,,,8',
      '2026-10-08 00:00:00,Tala,,bench,2,60,5,0,0,,,8',
      '2026-10-08 00:00:00,Tala,,"Bench, close grip",1,50,8,0,0,,,',
      '2026-10-08 00:00:00,Tala,,bench,3,62.5,3,0,0,,,',
      '',
    ])
  })
})
