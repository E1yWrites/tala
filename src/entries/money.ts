import { agenda } from './agenda'
import { categoryOf, topCategory } from './categories'
import { addDays, toDate } from './dates'
import type { DayKey } from './dates'
import type { Entry } from './parse'
import type { EntryRef } from './scan'

/*
  Money, read from the ₱ Readings in Isip. Pure: the Library's accounts and
  category choices come in as arguments (library/money.ts keeps them).

  A balance is every line for that account plus an adjustment, which "set
  balance" stores as (what you have) − (what the lines add up to), so every
  later line still counts. Lines with no account go to the first one.

  Safe to spend: what you have, less what you keep aside and the bills due
  before your next income, spread over the days until then. Income is a
  repeating event with a + amount ("@ tuwing kinsenas at katapusan +P8000
  sweldo", "@ daily +P200 baon"); with none, the month's end stands in.
*/

export interface Account {
  id: string
  name: string
  /** The word you type for it ("gcash"), lowercase, one word. */
  tag: string
  adjust: number
}

export const DEFAULT_ACCOUNTS: Account[] = [
  { id: 'cash', name: 'Cash', tag: 'cash', adjust: 0 },
  { id: 'gcash', name: 'GCash', tag: 'gcash', adjust: 0 },
  { id: 'maya', name: 'Maya', tag: 'maya', adjust: 0 },
  { id: 'bank', name: 'Bank', tag: 'bank', adjust: 0 },
]

type MoneyEntry = Extract<Entry, { kind: 'money' }>
export type MoneyRef = EntryRef & { entry: MoneyEntry }

export const moneyRefs = (refs: EntryRef[]): MoneyRef[] => refs.filter((r): r is MoneyRef => r.entry.kind === 'money')

/** Each account's balance, by account id. */
export function balances(refs: EntryRef[], accounts: Account[]): Map<string, number> {
  const out = new Map(accounts.map((a) => [a.id, a.adjust]))
  const byTag = new Map(accounts.map((a) => [a.tag, a.id]))
  const fallback = accounts[0]?.id
  const add = (tag: string | undefined, n: number): void => {
    const id = (tag && byTag.get(tag)) ?? fallback
    if (id) out.set(id, (out.get(id) ?? 0) + n)
  }
  for (const { entry: e } of moneyRefs(refs)) {
    if (e.flow === 'move') {
      add(e.account, -e.amount)
      add(e.to, e.amount)
    } else add(e.account, e.flow === 'in' ? e.amount : -e.amount)
  }
  return out
}

/* ------------------------------- This month -------------------------------- */

export interface MonthSummary {
  spent: number
  income: number
  /** Spending per category, biggest first. */
  byCategory: Array<[string, number]>
  /** Food's spending by sub-category ("Food" itself when none was read), biggest first. */
  food: Array<[string, number]>
  /** The month's lines, newest first. */
  lines: MoneyRef[]
}

export function monthSummary(refs: EntryRef[], month: string, chosen: Record<string, string>): MonthSummary {
  const lines = moneyRefs(refs)
    .filter((r) => r.entry.day.startsWith(month))
    .sort((a, b) => b.entry.day.localeCompare(a.entry.day))
  let spent = 0
  let income = 0
  const cats = new Map<string, number>()
  const food = new Map<string, number>()
  const add = (m: Map<string, number>, k: string, n: number): void => void m.set(k, (m.get(k) ?? 0) + n)
  for (const { entry: e } of lines) {
    if (e.flow === 'in') income += e.amount
    if (e.flow !== 'out') continue
    spent += e.amount
    // Food's sub-categories count toward Food, and are split out under it
    const leaf = e.category ?? categoryOf(e.text, chosen)
    add(cats, topCategory(leaf), e.amount)
    if (topCategory(leaf) === 'Food') add(food, leaf, e.amount)
  }
  const biggest = (m: Map<string, number>): Array<[string, number]> => [...m].sort((a, b) => b[1] - a[1])
  return { spent, income, byCategory: biggest(cats), food: biggest(food), lines }
}

/* ------------------------------ Safe to spend ------------------------------ */

export interface SafeToSpend {
  /** What's left to spend today (can go below zero). */
  leftToday: number
  /** The even daily share until the next income. */
  perDay: number
  spentToday: number
  /** The next income day, or the day after the month ends when no income line exists. */
  until: DayKey
  /** What arrives then ("sweldo"), when known. */
  incomeName?: string
  /** Days from today up to (not including) `until`. */
  days: number
  /** Bills due after today and before `until`. */
  bills: number
  total: number
}

export function safeToSpend(refs: EntryRef[], accounts: Account[], keep: number, today: DayKey): SafeToSpend {
  const total = [...balances(refs, accounts).values()].reduce((a, b) => a + b, 0)
  const ahead = agenda(refs, addDays(today, 1), 62, today)
  const next = ahead.find((o) => o.ref.entry.kind === 'event' && o.ref.entry.income && o.amount)
  const d = toDate(today)
  const monthEnd = addDays(today, new Date(d.getFullYear(), d.getMonth() + 1, 0, 12).getDate() - d.getDate() + 1)
  const until = next?.day ?? monthEnd
  const bills = ahead
    .filter((o) => o.day < until && o.amount && o.ref.entry.kind === 'event' && !o.ref.entry.income)
    .reduce((n, o) => n + o.amount!, 0)
  const spentToday = moneyRefs(refs)
    .filter((r) => r.entry.day === today && r.entry.flow === 'out')
    .reduce((n, r) => n + r.entry.amount, 0)
  const days = Math.max(1, Math.round((toDate(until).getTime() - d.getTime()) / 86_400_000))
  // Spread what there was at the start of today, so spending today lowers today's share only
  const perDay = (total + spentToday - keep - bills) / days
  return { leftToday: perDay - spentToday, perDay, spentToday, until, incomeName: next?.title, days, bills, total }
}
