import { agenda } from './agenda'
import { addDays, toDate } from './dates'
import type { DayKey } from './dates'
import type { Entry } from './parse'
import type { EntryRef } from './scan'

/*
  Money, read from the ₱ lines on every page. Pure: the Library's accounts and
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

/* ------------------------------- Categories -------------------------------- */

export const CATEGORIES = ['Food', 'Transport', 'Bills & load', 'School', 'Groceries', 'Shopping', 'Health', 'Fun', 'Other'] as const

const WORDS: Record<string, (typeof CATEGORIES)[number]> = {}
const add = (cat: (typeof CATEGORIES)[number], words: string): void => {
  for (const w of words.split(' ')) WORDS[w] = cat
}
add('Food', 'food lunch dinner breakfast almusal tanghalian hapunan merienda meryenda snack snacks kain ulam rice kanin coffee kape milktea jollibee mcdo chowking mang inasal kfc pizza drinks bread pandesal')
add('Transport', 'jeep jeepney bus mrt lrt grab angkas joyride moveit tricycle trike taxi pamasahe fare gas gasolina parking toll ferry uv')
add('Bills & load', 'load data globe smart dito tm gomo meralco kuryente electric tubig internet wifi pldt converge netflix spotify youtube rent upa bills bill')
add('School', 'tuition print printing xerox photocopy book books school project supplies notebook pen ballpen')
add('Groceries', 'grocery groceries palengke market puregold sm savemore')
add('Shopping', 'shopee lazada shein clothes damit shoes sapatos')
add('Health', 'medicine gamot doctor checkup dentist vitamins pharmacy')
add('Fun', 'movie movies sine games game gift regalo date gala')

/** A line's category: your choice for its first word, else Tala's guess, else Other. */
export function categoryOf(text: string, chosen: Record<string, string>): string {
  const word = text.trim().split(/\s+/)[0]?.toLowerCase() ?? ''
  return chosen[word] ?? WORDS[word] ?? 'Other'
}

/* ------------------------------- This month -------------------------------- */

export interface MonthSummary {
  spent: number
  income: number
  /** Spending per category, biggest first. */
  byCategory: Array<[string, number]>
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
  for (const { entry: e } of lines) {
    if (e.flow === 'in') income += e.amount
    if (e.flow !== 'out') continue
    spent += e.amount
    const c = categoryOf(e.text, chosen)
    cats.set(c, (cats.get(c) ?? 0) + e.amount)
  }
  return { spent, income, byCategory: [...cats].sort((a, b) => b[1] - a[1]), lines }
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
