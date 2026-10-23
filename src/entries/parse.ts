import { categoryLabel } from './categories'
import { readDates, toDate } from './dates'
import type { DayKey, Repeat, When } from './dates'

/*
  The marker grammar: what a typed line says when it starts with a marker.

    [ ] essay due fri     task (a checklist item in a Note; the `[ ]` is the item)
    @ thu 2pm dentist     event          @ MWF 9-10:30 Calc 1     weekly class
    P150 lunch gcash      expense        +P500 baon cash          income
    P500 gcash>cash       transfer       ✓ water 3                habit tick
                                         ✓ gym skip               a day off, not a miss
    bench 60x5x3 @8       lift: weight × reps × sets, RPE (Isip Entries only)

  Tasks are read from Notes; everything else from Isip Entries. The text stays
  the record: nothing here is stored, every roll-up re-reads it. `pinned` is the
  day the line counts from; relative words count from it.
*/

export type Entry =
  | { kind: 'task'; text: string; when?: When; due?: When; remind?: number }
  | { kind: 'event'; text: string; when?: When; repeat?: Repeat; amount?: number; income?: boolean; remind?: number }
  | {
      kind: 'money'
      flow: 'out' | 'in' | 'move'
      amount: number
      account?: string
      to?: string
      text: string
      day: DayKey
      /** Set by the Isip reader (isip/read.ts): a category or Food sub-category ("Eating out"), meal, place, grocery Items. */
      category?: string
      meal?: Meal
      merchant?: string
      items?: Item[]
      /** A grocery total minus what its Items add up to, when they differ. */
      gap?: number
    }
  | { kind: 'tick'; name: string; count: number; day: DayKey; skip?: true }
  | { kind: 'lift'; name: string; weight: number; unit?: 'lb'; reps: number; sets: number; rpe?: number; day: DayKey }

export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'merienda'
/** One priced thing in a grocery Reading ("eggs 98"). */
export interface Item {
  name: string
  amount: number
}

/** The owner's corrections, by the word Isip saw: exercise ("incline db") and merchant ("sm") → the name to use. */
export interface IsipAliases {
  exercise: Record<string, string>
  merchant: Record<string, string>
}

export interface EntryContext {
  /** The words that name accounts ("gcash"), lowercase. */
  accounts: string[]
  /** Habit and due-again names that `x name` may tick. */
  ticks: string[]
  /** Display names for account words ("bpi" → "BPI Savings"). */
  names?: Record<string, string>
  /** The Isip reader's corrections: aliases, and the category chosen for a word (`money:categories`). */
  aliases?: IsipAliases
  categories?: Record<string, string>
}

export const DEFAULT_CONTEXT: EntryContext = { accounts: ['cash', 'gcash', 'maya', 'bank'], ticks: [] }

/**
 * The Library's own accounts and habits, which the default `ctx` of every
 * parse reads. Set by library/context.ts when they change; tests pass a ctx.
 */
let current: EntryContext = DEFAULT_CONTEXT
export const setEntryContext = (ctx: EntryContext): void => {
  current = ctx
}
export const entryContext = (): EntryContext => current

/** ₱150, P1,299, Php 1.5k. Lowercase `p` stays prose ("p. 12"); phones capitalise line starts anyway. */
const AMOUNT = /^(?:₱\s?|P|php\s?)(\d{1,3}(?:,\d{3})+|\d+)(\.\d{1,2})?(k)?(?=\s|$)/i
const MONEY_LINE = /^(\+)?((?:₱\s?|P|[Pp][Hh][Pp]\s?)\d[\d,]*(?:\.\d{1,2})?k?)(?:\s+(.*))?$/

export function amountOf(token: string): number | undefined {
  if (/^p\d/.test(token)) return undefined
  const m = AMOUNT.exec(token)
  if (!m) return undefined
  const n = Number(m[1]!.replace(/,/g, '') + (m[2] ?? '')) * (m[3] ? 1000 : 1)
  return n > 0 ? n : undefined
}

const words = (s: string): string[] => s.split(/\s+/).filter(Boolean)

const REMIND = /^!(?:(\d+)([mhd]))?$/
const UNIT_MIN = { m: 1, h: 60, d: 1440 } as const

/** `!` (at the time) or `!15m` / `!2h` / `!1d` (that long before): minutes before, and the other words. */
function takeRemind(ws: string[]): [string[], number | undefined] {
  let remind: number | undefined
  const rest = ws.filter((w) => {
    const m = remind === undefined ? REMIND.exec(w) : null
    if (m) remind = m[1] ? Number(m[1]) * UNIT_MIN[m[2] as keyof typeof UNIT_MIN] : 0
    return !m
  })
  return [rest, remind]
}

/**
 * "bench 60x5x3 @8", "squat 100kg x 5", "pullups x8x3" (bodyweight), "curl 25lb x12 @9",
 * "Bench Press (Barbell) 60x5" (Strong's names): weight × reps × sets.
 * After a weight with its unit, or with the word "sets", sets come first:
 * "bench 40kg 3x10", "40 kilos 3x8", "squat 3 sets of 5". "bw x 15" is bodyweight.
 * Unmarked, so only Isip Entries read it: in a Note "photo 4x6" is just words.
 */
const UNIT = String.raw`(kgs?|kilos?|lbs?)`
const RPE = String.raw`(?:\s+@\s?(\d+(?:\.5)?))?$`
// No digits in a name: one would let "ohp 30kg 3x8, lat 45kg 3x10" read as a single lift
const LIFT = new RegExp(String.raw`^(\p{L}[\p{L}'’.,()\- ]*?)\s+(?:(\d+(?:\.\d+)?)\s?${UNIT}?\s?|(?:bw|bodyweight)\s?)?[x×]\s?(\d+)(?:\s?[x×]\s?(\d+))?${RPE}`, 'iu')
const LIFT_SETS = new RegExp(
  String.raw`^(\p{L}[\p{L}'’.()\- ]*?)(?:\s+(\d+(?:\.\d+)?)\s?${UNIT})?\s+(\d+)\s?(?:([x×])|sets?\s+(?:of\s+)?(?:[x×]\s?)?)\s?(\d+)(?:\s?reps?)?${RPE}`,
  'iu',
)

function parseLift(line: string, day: DayKey): Entry | null {
  let name: string, weight: number, unit: string | undefined, reps: number, sets: number, rpe: string | undefined
  const s = LIFT_SETS.exec(line)
  // "3x10" with no weight before it stays weight × reps ("pullups 3x10" is not read as sets)
  if (s && (s[2] || !s[5])) {
    ;[name, weight, unit, sets, reps, rpe] = [s[1]!, Number(s[2] ?? 0), s[3], Number(s[4]), Number(s[6]), s[7]]
  } else {
    const m = LIFT.exec(line)
    if (!m) return null
    ;[name, weight, unit, reps, sets, rpe] = [m[1]!, Number(m[2] ?? 0), m[3], Number(m[4]), Number(m[5] ?? 1), m[6]]
  }
  const lb = /^lb/i.test(unit ?? '')
  const r = rpe ? Number(rpe) : undefined
  if (weight > (lb ? 2200 : 1000) || reps < 1 || reps > 100 || sets < 1 || sets > 20 || (r !== undefined && (r < 1 || r > 10))) return null
  return { kind: 'lift', name: name.trim(), weight, ...(lb ? { unit: 'lb' as const } : {}), reps, sets, ...(r !== undefined ? { rpe: r } : {}), day }
}

/** A typed line: a checklist item's own text when `task`; `isip`: an Isip Entry, where an unmarked lift counts. */
export function parseLine(text: string, pinned: DayKey, ctx: EntryContext = current, task = false, isip = false): Entry | null {
  const line = text.trim()
  if (task) {
    const d = readDates(line, pinned)
    const [rest, remind] = takeRemind(words(d.rest))
    return {
      kind: 'task',
      text: rest.join(' '),
      ...(d.when?.day || d.when?.time ? { when: d.when } : {}),
      ...(d.due ? { due: d.due } : {}),
      ...(remind !== undefined ? { remind } : {}),
    }
  }

  if (/^@\s/.test(line)) {
    const d = readDates(line.slice(2), pinned, { event: true })
    let amount: number | undefined
    let income = false
    const [ws, remind] = takeRemind(words(d.rest))
    const rest = ws.filter((w) => {
      // "+P8000" on an event is income (payday, baon); a plain amount is a bill
      const a = amount === undefined ? amountOf(w.replace(/^\+/, '')) : undefined
      if (a !== undefined) {
        amount = a
        income = w.startsWith('+')
      }
      return a === undefined
    })
    const repeat = d.repeat && d.due?.day && !d.repeat.until ? { ...d.repeat, until: d.due.day } : d.repeat
    const when = d.when ?? (d.due && !repeat ? d.due : undefined)
    return {
      kind: 'event',
      text: rest.join(' '),
      ...(when ? { when } : {}),
      ...(repeat ? { repeat } : {}),
      ...(amount !== undefined ? { amount } : {}),
      ...(income ? { income } : {}),
      ...(remind !== undefined ? { remind } : {}),
    }
  }

  const money = MONEY_LINE.exec(line)
  const amount = money ? amountOf(money[2]!.replace(/\s/g, '')) : undefined
  if (money && amount !== undefined) {
    const d = readDates(money[3] ?? '', pinned, { past: true })
    let account: string | undefined
    let to: string | undefined
    const rest = words(d.rest).filter((w) => {
      const lw = w.toLowerCase().replace(/[,.;]+$/, '')
      const move = /^([a-z]+)\s*(?:>|->|→)\s*([a-z]+)$/.exec(lw)
      if (move && ctx.accounts.includes(move[1]!) && ctx.accounts.includes(move[2]!) && !to) {
        account = move[1]
        to = move[2]
        return false
      }
      if (!account && ctx.accounts.includes(lw)) {
        account = lw
        return false
      }
      return true
    })
    return {
      kind: 'money',
      flow: to ? 'move' : money[1] ? 'in' : 'out',
      amount,
      ...(account ? { account } : {}),
      ...(to ? { to } : {}),
      text: rest.join(' '),
      day: d.when?.day ?? pinned,
    }
  }

  const tick = /^(✓|✔|x|X)\s+(.+)$/.exec(line)
  if (tick) {
    // "✓ gym skip": a day off. Taken before the dates, which read "skip <day>" as a repeat's day out
    const skip = /\S\s+skip(?=\s|$)/i.test(tick[2]!)
    const d = readDates(skip ? tick[2]!.replace(/(\S)\s+skip(?=\s|$)/i, '$1') : tick[2]!, pinned, { past: true })
    const ws = words(d.rest)
    const count = ws.length > 1 && /^\d+$/.test(ws[ws.length - 1]!) ? Number(ws.pop()) : 1
    const said = ws.join(' ')
    const known = ctx.ticks.find((n) => n.toLowerCase() === said.toLowerCase())
    // `x` is also algebra and crossed-out lists: it only ticks a name Tala knows
    if (!said || (tick[1]!.toLowerCase() === 'x' && !known)) return null
    return { kind: 'tick', name: known ?? said, count, day: d.when?.day ?? pinned, ...(skip ? { skip } : {}) }
  }
  return isip ? parseLift(line, pinned) : null
}

/** A lift read from one clause of an Isip Entry ("Bench 40kg 3x10"). */
export const liftOf = parseLift

export const NOT_MONEY = new Set([
  'h', 'hr', 'hrs', 'hour', 'hours', 'oras', 'min', 'mins', 'minute', 'minutes', 'minuto', 'sec', 'secs',
  'page', 'pages', 'pahina', 'pcs', 'pc', 'piece', 'pieces', 'km', 'kg', 'g', 'lbs', 'ml', 'l', 'x', 'times', 'beses',
  'glass', 'glasses', 'baso', 'cups', 'cup', 'steps', 'reps', 'sets', 'people', 'students', 'items', 'days', 'weeks',
  'chapters', 'chapter', 'percent', '%', 'pts', 'points', 'out', 'of', 'to', '-', 'am', 'pm',
])

/**
 * An unmarked line that looks like an entry: the marker that
 * would make it one (`P`, `@ `, `✓ `), or null. "150 lunch" → "P", "dentist 2pm" → "@ ".
 */
export function suggestMarker(text: string, pinned: DayKey, ctx: EntryContext = current): string | null {
  const line = text.trim()
  if (!line || parseLine(line, pinned, ctx) !== null) return null
  const ws = words(line)
  const first = ws[0]!
  const next = ws[1]?.toLowerCase()
  if (/^\d{1,3}(,\d{3})*(\.\d{1,2})?k?$|^\d+(\.\d{1,2})?k?$/.test(first) && next && !NOT_MONEY.has(next) && /^[\p{L}]/u.test(next)) {
    return 'P'
  }
  if (ctx.ticks.some((n) => line.toLowerCase().replace(/\s+\d+$/, '') === n.toLowerCase())) return '✓ '
  if (readDates(line, pinned).when?.time) return '@ '
  return null
}

/* --------------------------------- Labels --------------------------------- */

const dayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const formatDay = (k: DayKey): string => dayFmt.format(toDate(k))

const longDayFmt = new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
/** A day as a heading: "Thursday, October 8". */
export const formatLongDay = (k: DayKey): string => longDayFmt.format(toDate(k))

export function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const h12 = h! % 12 === 0 ? 12 : h! % 12
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h! < 12 ? 'am' : 'pm'}`
}

export const formatPeso = (n: number): string =>
  `${n < 0 ? '−' : ''}₱${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`

/** "60kg", "25lb", "bodyweight". */
export const formatWeight = (l: { weight: number; unit?: 'lb' }): string => (l.weight ? `${l.weight}${l.unit ?? 'kg'}` : 'bodyweight')

/** An account word as shown: its name in the Library, else "GCash", "Cash". */
export const accountName = (tag: string): string =>
  current.names?.[tag] ?? (tag === 'gcash' ? 'GCash' : tag.charAt(0).toUpperCase() + tag.slice(1))

function formatWhen(w: When | undefined): string[] {
  if (!w) return []
  const time = w.time ? (w.end ? `${formatTime(w.time)}–${formatTime(w.end)}` : formatTime(w.time)) : ''
  return [w.day ? formatDay(w.day) : '', time].filter(Boolean)
}

export function formatRepeat(r: Repeat): string {
  const every = r.every > 1 ? `every ${r.approx ? '~' : ''}${r.every} ${r.unit}s` : `every ${r.unit}`
  let s = every
  if (r.unit === 'week' && r.on?.length) {
    const days = r.on.map((d) => DAY_NAMES[d]).join(', ')
    s = r.every > 1 ? `${every} on ${days}` : days
  } else if (r.unit === 'month' && r.on?.length) {
    s = `every ${r.on.map((d) => (d === -1 ? 'last day' : ordinal(d))).join(' & ')}`
  }
  if (r.until) s += ` until ${formatDay(r.until)}`
  if (r.skip?.length) s += `, not ${r.skip.map(formatDay).join(', ')}`
  return s
}

/** "remind 15m before", "remind at the time". */
export function formatRemind(min: number): string {
  if (min === 0) return 'remind at the time'
  const [n, u] = min % 1440 === 0 ? [min / 1440, 'd'] : min % 60 === 0 ? [min / 60, 'h'] : [min, 'm']
  return `remind ${n}${u} before`
}

const ordinal = (n: number): string => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : (['th', 'st', 'nd', 'rd'][n % 10] ?? 'th')
  return `${n}${s}`
}

/** What the chip beside a line says. Empty for a task with no date (the checkbox says enough). */
export function entryLabel(e: Entry): string {
  switch (e.kind) {
    case 'task':
      return [
        ...formatWhen(e.when),
        ...(e.due ? [`due ${formatWhen(e.due).join(' ')}`] : []),
        ...(e.remind !== undefined ? [formatRemind(e.remind)] : []),
      ].join(' · ')
    case 'event':
      return (
        [
          ...(e.repeat ? [formatRepeat(e.repeat)] : []),
          ...formatWhen(e.when),
          ...(e.amount ? [`${e.income ? '+' : ''}${formatPeso(e.amount)}`] : []),
          ...(e.remind !== undefined ? [formatRemind(e.remind)] : []),
        ].join(' · ') || 'Event'
      )
    case 'money': {
      if (e.flow === 'move') return `${formatPeso(e.amount)} ${accountName(e.account!)} → ${accountName(e.to!)}`
      return [
        `${e.flow === 'in' ? '+' : '−'}${formatPeso(e.amount)}`,
        ...(e.category ? [categoryLabel(e.category)] : []),
        ...(e.merchant ? [e.merchant] : []),
        ...(e.items ? [`${e.items.length} ${e.items.length === 1 ? 'item' : 'items'}${e.gap ? ` + ${formatPeso(e.gap)} unlisted` : ''}`] : []),
        ...(e.account ? [accountName(e.account)] : []),
      ].join(' · ')
    }
    case 'lift':
      return [`${e.sets}×${e.reps}`, formatWeight(e), ...(e.rpe !== undefined ? [`RPE ${e.rpe}`] : [])].join(' · ')
    case 'tick':
      return e.skip ? `Day off · ${e.name}` : `✓ ${e.name}${e.count > 1 ? ` ×${e.count}` : ''}`
  }
}
