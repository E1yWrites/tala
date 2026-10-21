import { dayKey } from '@/coach/study'
import { findCategory } from '@/entries/categories'
import { readDates } from '@/entries/dates'
import type { DayKey } from '@/entries/dates'
import { amountOf, entryContext, liftOf, NOT_MONEY, parseLine } from '@/entries/parse'
import type { Entry, EntryContext, IsipAliases, Item, Meal } from '@/entries/parse'
import type { IsipEntry } from '@/types/models'

/*
  The Isip reader: what an Entry says, as Readings (an expense, an event, a
  tick, a lift), each with the span of the line it came from and a score.

  A line the marker grammar accepts (entries/parse.ts) is one Reading, score 1.
  Anything else is split into clauses and each is scored: 0.8 and up counts,
  0.5 to 0.8 asks "confirm?", below 0.5 is dropped. Anything unsure returns
  nothing. Pure and hand-written: no DOM, no Dexie, no network; the phrase
  table in read.test.ts says what is covered. Nothing here is stored: the
  views re-read every Entry, and the owner's decisions and corrections (on the
  Entry, in `isip:aliases`, in `money:categories`) win.
*/

export type Status = 'auto' | 'suggested' | 'confirmed' | 'dismissed'

export interface Reading {
  entry: Entry
  /** Where in the Entry's text it was read: the key its owner's decision is saved under. */
  span: [number, number]
  score: number
  status: Status
  /** The word a correction is saved under: the merchant or first word (money), the exercise as written (lift). */
  key?: string
}

export const AUTO = 0.8
export const SUGGEST = 0.5
/** Only these count in the views. */
export const counts = (r: Reading): boolean => r.status === 'auto' || r.status === 'confirmed'

const NO_ALIASES: IsipAliases = { exercise: {}, merchant: {} }

/* -------------------------------- Exercises -------------------------------- */

const EXERCISES: Record<string, string> = {}
const exercise = (name: string, forms: string): void => {
  for (const f of forms.split('|')) EXERCISES[f] = name
}
exercise('Bench press', 'bench|bench press|flat bench|bp|barbell bench')
exercise('Incline bench press', 'incline bench|incline bench press|incline')
exercise('Incline dumbbell press', 'incline db|incline db press|incline dumbbell|incline dumbbell press')
exercise('Dumbbell press', 'db press|db bench|dumbbell press|dumbbell bench')
exercise('Squat', 'squat|back squat|barbell squat')
exercise('Front squat', 'front squat')
exercise('Goblet squat', 'goblet squat|goblet')
exercise('Deadlift', 'deadlift|dl|conventional deadlift')
exercise('Romanian deadlift', 'rdl|romanian deadlift')
exercise('Overhead press', 'ohp|overhead press|military press|shoulder press')
exercise('Pull-up', 'pull up|pullup|pull-up')
exercise('Chin-up', 'chin up|chinup|chin-up')
exercise('Push-up', 'push up|pushup|push-up')
exercise('Dip', 'dip')
exercise('Barbell row', 'row|bb row|barbell row|bent over row')
exercise('Dumbbell row', 'db row|dumbbell row')
exercise('Lat pulldown', 'lat pulldown|pulldown|lat pull down|lat')
exercise('Bicep curl', 'curl|bicep curl|biceps curl|db curl|barbell curl')
exercise('Hammer curl', 'hammer curl|hammer')
exercise('Tricep pushdown', 'pushdown|tricep pushdown|triceps pushdown')
exercise('Leg press', 'leg press')
exercise('Leg curl', 'leg curl')
exercise('Leg extension', 'leg extension')
exercise('Lunge', 'lunge|walking lunge')
exercise('Hip thrust', 'hip thrust')
exercise('Lateral raise', 'lateral raise|lat raise|side raise')
exercise('Calf raise', 'calf raise')

const FILLER = new Set(['ako', 'ko', 'ng', 'today', 'kanina', 'ulit', 'again', 'did', 'the', 'some', 'nag'])
/** "pull ups" → "pull up"; "press" stays. */
const singular = (s: string): string => s.replace(/(\p{L}{2,}?)s(?=\s|$)/gu, (m, w: string) => (w.endsWith('s') ? m : w))

/** "nag-bench ako" → Bench press; a name Isip doesn't know stays as written. `key` is what an alias is saved under. */
function exerciseName(raw: string, aliases: IsipAliases): { name: string; key: string; known: boolean } {
  const kept = raw.trim().replace(/^nag-?(?=\p{L})/iu, '').split(/\s+/).filter((w) => !FILLER.has(w.toLowerCase()))
  const key = kept.join(' ').toLowerCase().replace(/-/g, ' ')
  const name = aliases.exercise[key] ?? EXERCISES[key] ?? EXERCISES[singular(key)] ?? EXERCISES[key.replace(/ /g, '')]
  return { name: name ?? (kept.join(' ') || raw.trim()), key, known: !!name }
}

/* ---------------------------------- Money ---------------------------------- */

const MEALS: Record<string, Meal> = {
  breakfast: 'breakfast', almusal: 'breakfast',
  lunch: 'lunch', tanghalian: 'lunch',
  dinner: 'dinner', hapunan: 'dinner',
  merienda: 'merienda', meryenda: 'merienda',
}
const VERBS = new Set(['paid', 'pay', 'bayad', 'nagbayad', 'binayaran', 'gastos', 'gumastos', 'spent', 'spend', 'bought', 'bumili', 'binili', 'cost'])
const PESO_WORDS = new Set(['pesos', 'peso', 'php', 'piso'])
/** Numbers after these are not money: "page 12", "3 x 10". */
const NOT_AFTER = new Set(['x', '×', '@', 'page', 'p.', 'pahina', 'chapter', 'ch', 'ch.', 'room', 'rm', 'grade', 'week', 'day', 'level', 'no', 'no.', '#'])
/** Bare numbers before these count things, not pesos: "lunch with 3 friends". */
const COUNTED = new Set(['friends', 'tao', 'pax', 'kami', 'sila', 'orders', 'servings', 'slices', 'rounds', 'laps', 'k', 'mi', 'miles', 'kilos', 'kgs', 'lb', 'sets', 'rep'])
/** Words after `sa`/`at` that are not a merchant. */
const NOT_PLACE = new Set(['bahay', 'home', 'school', 'work', 'office', 'opisina', 'labas', 'the', 'ng', 'gym'])

const clean = (w: string): string => w.toLowerCase().replace(/^[("'“]+|[)"'”,.;:!?]+$/g, '')
const BARE = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?$/

interface Token {
  text: string
  low: string
  from: number
}

function tokens(s: string): Token[] {
  return [...s.matchAll(/\S+/g)].map((m) => ({ text: m[0], low: clean(m[0]), from: m.index }))
}

/** The amount at token i, how many tokens it takes, and whether it was said as money (₱, pesos, php). */
function amountAt(ts: Token[], i: number): { amount: number; n: number; explicit: boolean } | undefined {
  const t = ts[i]!
  const raw = t.text.replace(/[,.;:]+$/, '')
  const marked = amountOf(raw)
  if (marked !== undefined) return { amount: marked, n: 1, explicit: true }
  const suffixed = /^((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?:php|pesos?)$/i.exec(raw)
  if (suffixed) return { amount: Number(suffixed[1]!.replace(/,/g, '')), n: 1, explicit: true }
  if (!BARE.test(raw)) return undefined
  const next = ts[i + 1]?.low
  const prev = ts[i - 1]?.low
  if ((next && NOT_MONEY.has(next)) || (prev && NOT_AFTER.has(prev))) return undefined
  const amount = Number(raw.replace(/,/g, ''))
  if (!(amount >= 5) || (next && COUNTED.has(next))) return undefined
  return next && PESO_WORDS.has(next) ? { amount, n: 2, explicit: true } : { amount, n: 1, explicit: false }
}

const titleCase = (w: string): string => (w === w.toLowerCase() ? w.charAt(0).toUpperCase() + w.slice(1) : w)

/** The words after `sa` / `at`, up to a number or the end: "lunch sa jollibee 189" → "jollibee". */
function placeOf(ts: Token[]): string | undefined {
  const i = ts.findIndex((t) => t.low === 'sa' || t.low === 'at')
  if (i < 0) return undefined
  const words: string[] = []
  for (const t of ts.slice(i + 1, i + 4)) {
    if (!/^\p{L}[\p{L}'&-]*$/u.test(t.text.replace(/[,.;:]+$/, '')) || FILLER.has(t.low) || t.low in MEALS) break
    words.push(t.text.replace(/[,.;:]+$/, ''))
    if (/[,.;:]$/.test(t.text)) break
  }
  return words.length && !NOT_PLACE.has(words[0]!.toLowerCase()) ? words.join(' ') : undefined
}

interface Found {
  entry: Entry
  span: [number, number]
  score: number
  key?: string
}

/** A grocery list: "grocery sa SM 1,240 — eggs 98, chicken 1kg 220". */
const GROCERY_LIST = /(?:^|(?<=[.;]\s))[^.;]*?\b(?:grocery|groceries|palengke|supermarket|puregold|savemore)\b[^.;—–:]*?(?:[—–:]|\s-\s)[^;]*?(?=[.;](?:\s|$)|$)/iu

function moneyIn(clause: string, context: string, day: DayKey, ctx: EntryContext): Omit<Found, 'span'> | undefined {
  const chosen = ctx.categories ?? {}
  const aliases = ctx.aliases ?? NO_ALIASES
  const grocery = GROCERY_LIST.exec(clause)?.[0] === clause
  const sep = grocery ? /[—–:]|\s-\s/.exec(clause)! : undefined
  const head = sep ? clause.slice(0, sep.index) : clause
  const ts = tokens(head)

  let amount: number | undefined
  let explicit = false
  const used = new Set<number>()
  for (let i = 0; i < ts.length && amount === undefined; i++) {
    const a = amountAt(ts, i)
    if (!a) continue
    ;({ amount, explicit } = a)
    for (let k = 0; k < a.n; k++) used.add(i + k)
  }

  let items: Item[] | undefined
  if (sep) {
    items = clause
      .slice(sep.index + sep[0].length)
      .split(/,\s|\s+and\s+|\s+at\s+/i)
      .flatMap((part) => {
        const its = tokens(part)
        for (let i = its.length - 1; i > 0; i--) {
          const a = amountAt(its, i)
          if (a && i + a.n === its.length) return [{ name: its.slice(0, i).map((t) => t.text).join(' '), amount: a.amount }]
        }
        return []
      })
  }
  const sum = items?.reduce((n, it) => n + it.amount, 0) ?? 0
  const total = amount ?? (sum || undefined)
  if (total === undefined) return undefined

  const rest = ts.filter((_, i) => !used.has(i))
  let account: string | undefined
  const words = rest.filter((t) => {
    if (!account && ctx.accounts.includes(t.low)) {
      account = t.low
      return false
    }
    return true
  })
  const meal = words.map((t) => MEALS[t.low]).find(Boolean)
  const place = placeOf(ts)
  const key = place?.toLowerCase()
  const merchant = key ? (aliases.merchant[key] ?? place!.split(' ').map(titleCase).join(' ')) : undefined
  const text = readDates(words.map((t) => t.text).join(' '), day, { past: true }).rest.replace(/[,.;:]+$/, '')
  const clue = explicit || words.some((t) => VERBS.has(t.low))
  // "Went to the gym. … Paid 150": a clause said as money takes its context's category when it has none of its own
  const category = findCategory(head, chosen, key) ?? (grocery ? 'Groceries' : undefined) ?? (clue && context ? findCategory(context, {}) : undefined)
  // A bare amount with no clue as to what it was for never counts on its own
  const score = category || items?.length ? 0.9 : clue ? 0.7 : 0.4
  const gap = items?.length && amount !== undefined && amount !== sum ? amount - sum : undefined
  // A correction is saved under the place, else the first word that is not "paid" or "spent"
  const fixKey = key ?? words.map((t) => t.low).find((w) => /^\p{L}/u.test(w) && !VERBS.has(w))
  return {
    entry: {
      kind: 'money', flow: 'out', amount: total, text, day,
      ...(account ? { account } : {}),
      ...(category ? { category } : {}),
      ...(meal ? { meal } : {}),
      ...(merchant ? { merchant } : {}),
      ...(items?.length ? { items } : {}),
      ...(gap ? { gap } : {}),
    },
    score,
    ...(fixKey ? { key: fixKey } : {}),
  }
}

/* --------------------------------- Clauses --------------------------------- */

const BREAK = /[.;](?=\s|$)|,(?=\s)|\s+(?:and then|then|tapos)(?=\s)/giu

/** The clauses of a line as [from, to], trimmed. A grocery list after —, - or : stays one clause. */
export function clauses(text: string): Array<[number, number]> {
  const split = (from: number, to: number): Array<[number, number]> => {
    const out: Array<[number, number]> = []
    let start = from
    for (const m of text.slice(from, to).matchAll(BREAK)) {
      out.push([start, from + m.index])
      start = from + m.index + m[0].length
    }
    out.push([start, to])
    return out
  }
  const g = GROCERY_LIST.exec(text)
  const ranges = g ? [...split(0, g.index), [g.index, g.index + g[0].length] as [number, number], ...split(g.index + g[0].length, text.length)] : split(0, text.length)
  return ranges.flatMap(([a, b]) => {
    const s = text.slice(a, b)
    const lead = s.length - s.trimStart().length
    const body = s.trim().replace(/[.,;:]+$/, '')
    return body ? [[a + lead, a + lead + body.length] as [number, number]] : []
  })
}

/* ---------------------------------- Read ----------------------------------- */

function readClause(clause: string, context: string, day: DayKey, ctx: EntryContext): Omit<Found, 'span'> | undefined {
  const lift = liftOf(clause, day)
  if (lift?.kind === 'lift') {
    const ex = exerciseName(lift.name, ctx.aliases ?? NO_ALIASES)
    // "monitor 1920x10" is not a lift; "bench 40kg 3x10" is
    return { entry: { ...lift, name: ex.name }, score: ex.known ? 0.95 : 0.6, key: ex.key }
  }
  return moneyIn(clause, context, day, ctx)
}

/** Everything an Entry says, with each Reading's status. Readings below 0.5 are dropped. */
export function read(entry: Pick<IsipEntry, 'text' | 'day' | 'createdAt' | 'decisions'>, ctx: EntryContext = entryContext()): Reading[] {
  const text = entry.text
  const aliases = ctx.aliases ?? NO_ALIASES
  // Relative words count from the day it was written; what it counts for is the Entry's day
  const written = dayKey(entry.createdAt)
  const whole = parseLine(text, written, ctx, false, true)
  let found: Found[]
  if (whole) {
    const lead = text.length - text.trimStart().length
    found = [{ entry: whole, span: [lead, lead + text.trim().length], score: 1 }]
    if (whole.kind === 'lift') {
      const ex = exerciseName(whole.name, aliases)
      found[0] = { ...found[0]!, entry: { ...whole, name: ex.name }, key: ex.key }
    }
    if (whole.kind === 'money' && whole.flow === 'out') {
      // The marker says it is money; the reader still says what for
      const m = moneyIn(`${whole.amount} ${whole.text}`, '', written, ctx)
      const { category, meal, merchant } = m?.entry.kind === 'money' ? m.entry : {}
      found[0]!.entry = { ...whole, ...(category ? { category } : {}), ...(meal ? { meal } : {}), ...(merchant ? { merchant } : {}) }
      found[0]!.key = m?.key
    }
  } else {
    const spans = clauses(text)
    // The clauses with no numbers say where it happened ("Went to the gym")
    const context = spans.map((sp) => text.slice(...sp)).filter((c) => !/\d/.test(c)).join('. ')
    found = spans.flatMap((span) => {
      const r = readClause(text.slice(...span), context, written, ctx)
      return r ? [{ ...r, span }] : []
    })
  }
  return found
    .map((f): Reading => {
      const e = f.entry
      const dated = e.kind === 'money' || e.kind === 'tick' || e.kind === 'lift' ? { ...e, day: entry.day } : e
      const status = entry.decisions?.[text.slice(...f.span)] ?? (f.score >= AUTO ? 'auto' : 'suggested')
      return { ...f, entry: dated, status }
    })
    .filter((r) => r.score >= SUGGEST)
}

/**
 * The day a new line counts for: the day it was written, moved back by a day
 * word in it ("lunch 150 kahapon", "P85 jeep yesterday") when it holds an
 * expense, tick or lift. Events keep their own dates.
 */
export function entryDay(text: string, written: DayKey, ctx: EntryContext = entryContext()): DayKey {
  const moved = readDates(text, written, { past: true }).when?.day
  if (!moved || moved > written) return written
  const createdAt = new Date(`${written}T12:00:00`).getTime()
  const kinds = read({ text, day: written, createdAt }, ctx).map((r) => r.entry.kind)
  return kinds.some((k) => k === 'money' || k === 'tick' || k === 'lift') ? moved : written
}
