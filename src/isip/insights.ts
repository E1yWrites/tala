import { topCategory } from '@/entries/categories'
import { addDays, toDate } from '@/entries/dates'
import type { DayKey } from '@/entries/dates'
import { moneyRefs } from '@/entries/money'
import type { MoneyRef } from '@/entries/money'
import type { EntryRef } from '@/entries/scan'
import { liftRefs } from '@/entries/workouts'
import { ISIP } from './copy'

/*
  Insights: plain counting over the Readings that count. Pure. Each one shows
  only once there is enough to say something (the thresholds are the spec's),
  and each describes; none of them judges or says how often you write.
*/

const weekday = (d: DayKey): number => toDate(d).getDay()
/** The Monday of a day's week. */
export const weekOf = (d: DayKey): DayKey => addDays(d, -((weekday(d) + 6) % 7))
const daysBetween = (a: DayKey, b: DayKey): number => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000)
const last = <T>(xs: T[]): T => xs[xs.length - 1]!
const add = <K>(m: Map<K, number>, k: K, n: number): void => void m.set(k, (m.get(k) ?? 0) + n)
const spent = (refs: EntryRef[]): MoneyRef[] => moneyRefs(refs).filter((r) => r.entry.flow === 'out')
const leaf = (r: MoneyRef): string => r.entry.category ?? 'Other'

/* -------------------------------- Workouts --------------------------------- */

export interface Split {
  /** 0 = Sunday. */
  weekday: number
  /** Done on at least half of that weekday's Workouts, most often first. */
  exercises: string[]
  workouts: number
}

/** The usual exercises per weekday, once that weekday has held 3 Workouts. Monday first. */
export function usualSplit(refs: EntryRef[]): Split[] {
  const byDay = new Map<DayKey, Set<string>>()
  for (const { entry: l } of liftRefs(refs)) byDay.set(l.day, (byDay.get(l.day) ?? new Set()).add(l.name))
  const byWeekday = new Map<number, Array<Set<string>>>()
  for (const [day, names] of byDay) byWeekday.set(weekday(day), [...(byWeekday.get(weekday(day)) ?? []), names])
  const out: Split[] = []
  for (const [wd, workouts] of byWeekday) {
    if (workouts.length < 3) continue
    const counts = new Map<string, number>()
    for (const w of workouts) for (const n of w) add(counts, n, 1)
    const exercises = [...counts]
      .filter(([, n]) => n * 2 >= workouts.length)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([n]) => n)
    if (exercises.length) out.push({ weekday: wd, exercises, workouts: workouts.length })
  }
  return out.sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7))
}

export interface WeeklyTop {
  name: string
  unit?: 'lb'
  /** The heaviest weight of each week it was done (Monday-start), oldest first, the last 8. */
  weeks: Array<{ week: DayKey; top: number }>
}

/** Each exercise's top weight per week, once it was lifted with weight in 4 different weeks. Lines in another unit than its latest are left out. */
export function weeklyTops(refs: EntryRef[]): WeeklyTop[] {
  const byName = new Map<string, ReturnType<typeof liftRefs>>()
  for (const r of liftRefs(refs)) if (r.entry.weight) byName.set(r.entry.name, [...(byName.get(r.entry.name) ?? []), r])
  const out: WeeklyTop[] = []
  for (const [name, rs] of byName) {
    const unit = rs.reduce((a, b) => (b.entry.day >= a.entry.day ? b : a)).entry.unit
    const tops = new Map<DayKey, number>()
    for (const { entry: l } of rs) if (l.unit === unit) tops.set(weekOf(l.day), Math.max(tops.get(weekOf(l.day)) ?? 0, l.weight))
    if (tops.size < 4) continue
    const weeks = [...tops].sort((a, b) => a[0].localeCompare(b[0])).slice(-8).map(([week, top]) => ({ week, top }))
    out.push({ name, ...(unit ? { unit } : {}), weeks })
  }
  return out.sort((a, b) => last(b.weeks).week.localeCompare(last(a.weeks).week) || a.name.localeCompare(b.name))
}

/* ---------------------------------- Money ---------------------------------- */

export interface FoodMix {
  groceries: number
  eatingOut: number
  delivery: number
  /** The first day counted (four weeks back, today included). */
  from: DayKey
}

/** Groceries vs eating out vs delivery over the last 4 weeks, once Food Readings span 2 weeks. */
export function foodMix(refs: EntryRef[], today: DayKey): FoodMix | null {
  const food = spent(refs).filter((r) => topCategory(leaf(r)) === 'Food')
  const first = food.reduce<DayKey | null>((d, r) => (d === null || r.entry.day < d ? r.entry.day : d), null)
  if (!first || daysBetween(first, today) < 14) return null
  const from = addDays(today, -27)
  const sum = (c: string): number => food.filter((r) => leaf(r) === c && r.entry.day >= from && r.entry.day <= today).reduce((n, r) => n + r.entry.amount, 0)
  const mix = { groceries: sum('Groceries'), eatingOut: sum('Eating out'), delivery: sum('Delivery'), from }
  return mix.groceries + mix.eatingOut + mix.delivery > 0 ? mix : null
}

export interface Recurring {
  amount: number
  category: string
  /** What the latest one said. */
  text: string
  /** The usual gap in days. */
  every: number
  last: DayKey
  next: DayKey
  times: number
}

/**
 * Costs that come back: the same amount and category on 3 or more days, the
 * gaps between them about even (within a fifth, or 2 days) and at least 6 days
 * long, so a daily fare is not one.
 */
export function recurring(refs: EntryRef[]): Recurring[] {
  const groups = new Map<string, MoneyRef[]>()
  for (const r of spent(refs)) {
    const k = `${r.entry.amount}|${leaf(r)}`
    groups.set(k, [...(groups.get(k) ?? []), r])
  }
  const out: Recurring[] = []
  for (const rs of groups.values()) {
    const days = [...new Set(rs.map((r) => r.entry.day))].sort()
    if (days.length < 3) continue
    const gaps = days.slice(1).map((d, i) => daysBetween(days[i]!, d))
    const every = [...gaps].sort((a, b) => a - b)[Math.floor(gaps.length / 2)]!
    if (every < 6 || gaps.some((g) => Math.abs(g - every) > Math.max(2, every / 5))) continue
    const lastDay = last(days)
    const latest = last(rs.filter((r) => r.entry.day === lastDay))
    out.push({ amount: latest.entry.amount, category: leaf(latest), text: latest.entry.text, every, last: lastDay, next: addDays(lastDay, every), times: days.length })
  }
  return out.sort((a, b) => b.amount - a.amount)
}

const WD = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
const nth = (n: number): string => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')}`

/** The line that plans a cost that comes back as a bill on Upcoming: "@ every 8th P149 netflix". */
export function planLine(r: Recurring): string {
  const next = toDate(r.next)
  const when =
    r.every >= 28 && r.every <= 31
      ? `every ${nth(next.getDate())}`
      : r.every === 7
        ? `every ${WD[next.getDay()]}`
        : r.every === 14
          ? `every other ${WD[next.getDay()]}`
          : r.every % 7 === 0
            ? `every ${r.every / 7} weeks`
            : `every ${r.every} days`
  return `@ ${when} P${r.amount} ${r.text || r.category}`
}

export interface PriceChange {
  /** As written the last time. */
  name: string
  last: number
  prev: number
  day: DayKey
}

/** Each grocery Item bought twice or more: the last price against the one before. Newest first. */
export function priceChanges(refs: EntryRef[]): PriceChange[] {
  const byItem = new Map<string, Array<{ name: string; amount: number; day: DayKey }>>()
  // Readings come in the order they were written; a stable sort by day keeps that within a day
  const buys = spent(refs)
    .filter((r) => r.entry.items)
    .sort((a, b) => a.entry.day.localeCompare(b.entry.day))
  for (const { entry: e } of buys) {
    for (const it of e.items!) {
      const k = it.name.toLowerCase()
      byItem.set(k, [...(byItem.get(k) ?? []), { ...it, day: e.day }])
    }
  }
  return [...byItem.values()]
    .filter((xs) => xs.length >= 2)
    .map((xs) => ({ name: last(xs).name, last: last(xs).amount, prev: xs[xs.length - 2]!.amount, day: last(xs).day }))
    .sort((a, b) => b.day.localeCompare(a.day) || a.name.localeCompare(b.name))
}

export interface GymFood {
  /** Food spending per day, on average. */
  gym: number
  rest: number
  gymDays: number
  restDays: number
}

/**
 * Food spend on gym days (a lift, or ✓ gym) against rest days, over the days
 * you wrote anything in Isip before today, once the first gym day is 2 weeks
 * back. A day with nothing written is not a rest day: it is just not known.
 */
export function gymFood(refs: EntryRef[], today: DayKey): GymFood | null {
  const isip = refs.filter((r) => r.isip && r.at < today)
  const gym = new Set(
    isip.filter((r) => r.entry.kind === 'lift' || (r.entry.kind === 'tick' && !r.entry.skip && r.entry.name.toLowerCase() === 'gym')).map((r) => r.at),
  )
  const first = [...gym].sort()[0]
  if (!first || daysBetween(first, today) < 14) return null
  const written = new Set(isip.filter((r) => r.at >= first).map((r) => r.at))
  const food = new Map<DayKey, number>()
  for (const r of spent(isip)) if (topCategory(leaf(r)) === 'Food') add(food, r.entry.day, r.entry.amount)
  let [g, gd, rs, rd] = [0, 0, 0, 0]
  for (const d of written) {
    if (gym.has(d)) [g, gd] = [g + (food.get(d) ?? 0), gd + 1]
    else [rs, rd] = [rs + (food.get(d) ?? 0), rd + 1]
  }
  return gd && rd ? { gym: g / gd, rest: rs / rd, gymDays: gd, restDays: rd } : null
}

/* --------------------------------- Bituin ---------------------------------- */

export interface Mention {
  /** One per insight: Bituin mentions each only the first time it unlocks. */
  key: string
  view: 'workouts' | 'money'
  text: string
}

/** What Bituin could mention, one line per insight that has unlocked. */
export function mentions(refs: EntryRef[], today: DayKey): Mention[] {
  const say = ISIP.bituin
  const out: Mention[] = []
  const split = usualSplit(refs)[0]
  if (split) out.push({ key: 'split', view: 'workouts', text: say.split(split.weekday, split.exercises) })
  const top = weeklyTops(refs)[0]
  if (top) out.push({ key: 'weekly-top', view: 'workouts', text: say.weekly(top.name) })
  const price = priceChanges(refs).find((p) => p.last !== p.prev)
  if (price) out.push({ key: 'price', view: 'money', text: say.price(price.name, price.last - price.prev) })
  const back = recurring(refs)[0]
  if (back) out.push({ key: 'recurring', view: 'money', text: say.recurring(back.amount, back.text || back.category, back.every) })
  const mix = foodMix(refs, today)
  if (mix) out.push({ key: 'food-mix', view: 'money', text: say.mix(mix.groceries, mix.eatingOut, mix.delivery) })
  const gf = gymFood(refs, today)
  if (gf) out.push({ key: 'gym-food', view: 'money', text: say.gym(gf.gym, gf.rest) })
  return out
}
