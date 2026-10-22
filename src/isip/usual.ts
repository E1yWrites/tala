import { dayKey } from '@/coach/study'
import { addDays, readDates } from '@/entries/dates'
import type { DayKey } from '@/entries/dates'
import { entryContext } from '@/entries/parse'
import type { EntryContext } from '@/entries/parse'
import type { IsipEntry } from '@/types/models'
import { read } from './read'

/*
  What you usually write, learnt from your own Entries and nothing else. Pure.
  It only ever offers a whole line you wrote before, so the number in it is
  yours and on screen: "jeep" never turns into ₱13 behind your back.
*/

const key = (text: string): string => text.trim().toLowerCase().replace(/\s+/g, ' ')

/** A line worth writing again as it is: an expense or a lift, with no day of its own and no habit tick (Done counts those up). */
function repeatable(e: IsipEntry, ctx: EntryContext): boolean {
  if (readDates(e.text, e.day).when?.day) return false
  const kinds = read(e, ctx).map((r) => r.entry.kind)
  return kinds.length > 0 && kinds.every((k) => k === 'money' || k === 'lift')
}

/**
 * The lines written on 3 or more days of the last 4 weeks and not yet today,
 * the ones usually written around this hour or on this weekday first: the
 * "again" chips. As last written.
 */
export function usualLines(entries: IsipEntry[], now: number, limit = 4, ctx: EntryContext = entryContext()): string[] {
  const today = dayKey(now)
  const from = addDays(today, -27)
  const hour = new Date(now).getHours()
  const weekday = new Date(now).getDay()
  const by = new Map<string, { text: string; days: Set<DayKey>; near: number; sameDay: boolean; today: boolean; repeatable: boolean }>()
  for (const e of entries) {
    if (e.day < from || e.day > today) continue
    const k = key(e.text)
    const t = by.get(k) ?? { text: e.text, days: new Set(), near: 0, sameDay: false, today: false, repeatable: repeatable(e, ctx) }
    t.text = e.text.trim()
    t.days.add(e.day)
    const at = new Date(e.createdAt)
    if (Math.abs(at.getHours() - hour) <= 2) t.near++
    if (at.getDay() === weekday) t.sameDay = true
    if (e.day === today) t.today = true
    by.set(k, t)
  }
  return [...by.values()]
    .filter((t) => t.days.size >= 3 && !t.today && t.repeatable)
    .map((t) => ({ text: t.text, score: t.days.size + (t.near * 2 > t.days.size ? 3 : 0) + (t.sameDay ? 1 : 0) }))
    .sort((a, b) => b.score - a.score || a.text.localeCompare(b.text))
    .slice(0, limit)
    .map((t) => t.text)
}

/**
 * What the capture box offers as you type: your lines written twice or more
 * in the last 90 days, most often first, then the common starters (`starters`)
 * you have not written, so a first day already has suggestions.
 */
export function suggestions(entries: IsipEntry[], now: number, starters: readonly string[], limit = 40): string[] {
  const from = addDays(dayKey(now), -89)
  const by = new Map<string, { text: string; n: number; last: number }>()
  for (const e of entries) {
    if (e.day < from) continue
    const k = key(e.text)
    const t = by.get(k) ?? { text: e.text.trim(), n: 0, last: 0 }
    t.n++
    if (e.createdAt >= t.last) [t.text, t.last] = [e.text.trim(), e.createdAt]
    by.set(k, t)
  }
  const mine = [...by.values()]
    .filter((t) => t.n >= 2)
    .sort((a, b) => b.n - a.n || b.last - a.last)
    .map((t) => t.text)
  const seen = new Set(mine.map(key))
  // A starter whose first word you already use ("jeep 13" when you write "jeep 15") is left out
  const words = new Set([...by.keys()].map((k) => k.split(' ')[0]))
  return [...mine, ...starters.filter((s) => !seen.has(key(s)) && !words.has(key(s).split(' ')[0]!))].slice(0, limit)
}
