import { dayKey } from '@/coach/study'

/*
  Reads dates, times and repeats out of a typed line, in English and Taglish
  ("bukas", "tuwing Lunes", "alas-tres ng hapon", "kinsenas"). Pure: every
  relative word is read against `pinned`, the day the line was written, so
  "fri" keeps meaning the same Friday next week. Hand-written rules on purpose:
  no model, no network, and a phrase table in dates.test.ts says what is covered.
*/

/** A local calendar day, `YYYY-MM-DD`. */
export type DayKey = string

export interface When {
  day?: DayKey
  /** `HH:MM`, 24-hour. */
  time?: string
  end?: string
}

export interface Repeat {
  unit: 'day' | 'week' | 'month' | 'year'
  every: number
  /** week: weekdays (0 = Sunday). month: days of the month (-1 = the last day). */
  on?: number[]
  /** `~`: due again that long after it was last done, not on fixed dates. */
  approx?: boolean
  until?: DayKey
  /** "skip oct 14": single days left out. */
  skip?: DayKey[]
}

export interface DateRead {
  when?: When
  /** "due fri", "hanggang bukas": a deadline. */
  due?: When
  repeat?: Repeat
  /** The words that were not dates, in order. */
  rest: string
}

export interface DateOptions {
  /** A bare weekday means the last one, not the next (money is logged after the fact). */
  past?: boolean
  /** Event lines: "9-10:30" style ranges without am/pm, and MWF / TTh day codes. */
  event?: boolean
}

/* -------------------------------- Day math -------------------------------- */

export const toDate = (k: DayKey): Date => {
  const [y, m, d] = k.split('-').map(Number)
  return new Date(y!, m! - 1, d!, 12) // noon: immune to DST shifts
}
const keyOf = (d: Date): DayKey => dayKey(d.getTime())
export const addDays = (k: DayKey, n: number): DayKey => {
  const d = toDate(k)
  d.setDate(d.getDate() + n)
  return keyOf(d)
}
const diffDays = (a: DayKey, b: DayKey): number => Math.round((toDate(a).getTime() - toDate(b).getTime()) / 86_400_000)
const daysIn = (y: number, m: number): number => new Date(y, m + 1, 0, 12).getDate()

/** The weekday `wd` on or after `from` (or on or before it, looking back). */
function onWeekday(from: DayKey, wd: number, back = false): DayKey {
  const cur = toDate(from).getDay()
  return back ? addDays(from, -((cur - wd + 7) % 7)) : addDays(from, (wd - cur + 7) % 7)
}

/** Day `dom` of the month (-1 = last) on or after `from`, or on or before it looking back. */
function onMonthDay(from: DayKey, dom: number, back = false): DayKey {
  const base = toDate(from)
  for (let k = 0; k < 14; k++) {
    const off = back ? -k : k
    const y = base.getFullYear()
    const m = base.getMonth() + off
    const last = new Date(y, m + 1, 0, 12).getDate()
    const day = dom === -1 ? last : dom
    if (day > last) continue
    const cand = keyOf(new Date(y, m, day, 12))
    if (back ? cand <= from : cand >= from) return cand
  }
  return from
}

/** "oct 10" with no year: this year's, unless that is more than half a year away. */
function monthDay(pinned: DayKey, month: number, day: number, year?: number): DayKey | null {
  const py = toDate(pinned).getFullYear()
  let y = year ?? py
  if (day < 1 || day > daysIn(y, month)) return null
  let k = keyOf(new Date(y, month, day, 12))
  if (year === undefined) {
    const off = diffDays(k, pinned)
    if (off < -183) y++
    else if (off > 183) y--
    if (y !== py && day <= daysIn(y, month)) k = keyOf(new Date(y, month, day, 12))
  }
  return k
}

/* --------------------------------- Words ---------------------------------- */

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0, linggo: 0,
  mon: 1, monday: 1, lunes: 1,
  tue: 2, tues: 2, tuesday: 2, martes: 2,
  wed: 3, weds: 3, wednesday: 3, miyerkules: 3, miyerkoles: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, huwebes: 4,
  fri: 5, friday: 5, biyernes: 5,
  sat: 6, saturday: 6, sabado: 6,
}

// No "ago", "set", "dis": they are ordinary words ("3 days ago", "a set").
const MONTHS: Record<string, number> = {
  jan: 0, january: 0, enero: 0,
  feb: 1, february: 1, pebrero: 1,
  mar: 2, march: 2, marso: 2,
  apr: 3, april: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, june: 5, hunyo: 5,
  jul: 6, july: 6, hulyo: 6,
  aug: 7, august: 7, agosto: 7,
  sep: 8, sept: 8, september: 8, setyembre: 8,
  oct: 9, october: 9, oktubre: 9,
  nov: 10, november: 10, nobyembre: 10,
  dec: 11, december: 11, disyembre: 11,
}

/** Spanish hours, as in "alas-tres". */
const SPANISH: Record<string, number> = {
  una: 1, dos: 2, tres: 3, kwatro: 4, kuwatro: 4, kuwarto: 4, singko: 5, sais: 6,
  siyete: 7, syete: 7, otso: 8, nuwebe: 9, diyes: 10, dyis: 10, onse: 11, dose: 12,
}

const UNITS: Record<string, Repeat['unit']> = {
  d: 'day', day: 'day', days: 'day', araw: 'day',
  w: 'week', wk: 'week', wks: 'week', week: 'week', weeks: 'week',
  mo: 'month', mos: 'month', month: 'month', months: 'month', buwan: 'month',
  y: 'year', yr: 'year', yrs: 'year', year: 'year', years: 'year', taon: 'year',
}

const weekdayOf = (t: string): number | undefined => WEEKDAYS[t] ?? (t.endsWith('s') ? WEEKDAYS[t.slice(0, -1)] : undefined)

/** "15th", "ika-15", "kinsenas", "katapusan"; a bare "15" only where `bare` (after "every"). */
function domOf(t: string, bare: boolean): number | undefined {
  if (t === 'kinsenas') return 15
  if (t === 'katapusan') return -1
  const m = (bare ? /^(?:ika-?)?(\d{1,2})(?:st|nd|rd|th)?$/ : /^(?:ika-?(\d{1,2})|(\d{1,2})(?:st|nd|rd|th))$/).exec(t)
  const n = m ? Number(m[1] ?? m[2]) : NaN
  return n >= 1 && n <= 31 ? n : undefined
}

/** MWF, TTh, MW: Philippine timetable day codes. Case matters ("SM" is a mall, not a schedule). */
function dayCodes(raw: string): number[] | undefined {
  if (raw.length < 2 || !/^(?:Th|Tu|M|T|W|F)+$/.test(raw)) return undefined
  const codes: Record<string, number> = { M: 1, T: 2, Tu: 2, W: 3, Th: 4, F: 5 }
  return [...raw.matchAll(/Th|Tu|M|T|W|F/g)].map((m) => codes[m[0]]!)
}

/* --------------------------------- Times ---------------------------------- */

interface Clock {
  h: number
  m: number
  /** am/pm was written (or the hour is 13+). */
  fixed: boolean
}

const MERIDIEM = /^(am|pm|nn|mn)$/

function clockOf(t: string, allowBare: boolean): Clock | undefined {
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm|nn|mn)?$/.exec(t)
  if (!m) return undefined
  let h = Number(m[1])
  const min = m[2] ? Number(m[2]) : 0
  const mer = m[3]
  if (h > 23 || min > 59) return undefined
  if (!mer && !m[2] && !allowBare) return undefined // a bare "3" is a count, not a time
  if (mer === 'pm' && h < 12) h += 12
  if ((mer === 'am' || mer === 'mn') && h === 12) h = 0
  if (mer && h > 23) return undefined
  return { h, m: min, fixed: !!mer || h >= 13 || h === 0 }
}

/** No am/pm written: 1-6 o'clock is afternoon, 7-11 morning (class and appointment hours). */
const settle = (c: Clock): Clock => (c.fixed || c.h > 6 || c.h === 0 ? c : { ...c, h: c.h + 12, fixed: true })

const fmt = (c: Clock): string => `${String(c.h).padStart(2, '0')}:${String(c.m).padStart(2, '0')}`

/** "ng hapon" / "gabi" make it pm, "umaga" am. */
function qualify(c: Clock, word: string | undefined): Clock | undefined {
  if (word === 'hapon' || word === 'gabi') return { ...c, h: c.h < 12 ? c.h + 12 : c.h, fixed: true }
  if (word === 'umaga' || word === 'madaling-araw') return { ...c, h: c.h === 12 ? 0 : c.h, fixed: true }
  if (word === 'tanghali') return { ...c, h: 12, fixed: true }
  return undefined
}

/* --------------------------------- Reader --------------------------------- */

/** Strips surrounding punctuation, keeps what times and ranges use. */
const norm = (w: string): string => w.toLowerCase().replace(/^[,.;!?()"']+|[,.;!?()"']+$/g, '')

export function readDates(text: string, pinned: DayKey, opts: DateOptions = {}): DateRead {
  const raw = text.split(/\s+/).filter(Boolean)
  const low = raw.map(norm)
  const used = new Array<boolean>(raw.length).fill(false)
  const out: DateRead = { rest: '' }
  const at = (i: number): string | undefined => low[i]
  const take = (i: number, n: number): number => {
    for (let k = i; k < i + n; k++) used[k] = true
    return n
  }

  /** A day phrase at i: [day, tokens used]. */
  function day(i: number): [DayKey, number] | undefined {
    const t = at(i)
    if (t === undefined) return undefined
    const next = at(i + 1)
    if (t === 'today' || t === 'ngayon' || t === 'tonight') return [pinned, 1]
    if (t === 'ngayong' && next === 'araw') return [pinned, 2]
    if (t === 'mamaya') return [pinned, 1]
    if (t === 'mamayang') return [pinned, next === 'gabi' || next === 'hapon' ? 2 : 1]
    if (t === 'tomorrow' || t === 'tmrw' || t === 'tmr' || t === 'bukas') return [addDays(pinned, 1), 1]
    if (t === 'yesterday' || t === 'kahapon') return [addDays(pinned, -1), 1]
    if (t === 'samakalawa' || t === 'makalawa') return [addDays(pinned, 2), 1]
    if (t === 'day' && next === 'after' && at(i + 2) === 'tomorrow') return [addDays(pinned, 2), 3]
    if (t === 'next' || t === 'this' || t === 'last') {
      if (next === 'week') return t === 'this' ? undefined : [addDays(onWeekday(pinned, 1, true), t === 'next' ? 7 : -7), 2]
      if (next === 'month' && t !== 'this') {
        const d = toDate(pinned)
        return [keyOf(new Date(d.getFullYear(), d.getMonth() + (t === 'next' ? 1 : -1), 1, 12)), 2]
      }
      const wd = next === undefined ? undefined : WEEKDAYS[next]
      if (wd === undefined) return undefined
      if (t === 'this') return [onWeekday(pinned, wd), 2]
      if (t === 'last') return [onWeekday(addDays(pinned, -1), wd, true), 2]
      // next fri: the Friday of next week (weeks start on Monday)
      return [addDays(addDays(onWeekday(pinned, 1, true), 7), (wd + 6) % 7), 2]
    }
    if (t === 'in' && next !== undefined && /^\d+$/.test(next)) {
      const unit = UNITS[at(i + 2) ?? '']
      const n = Number(next)
      if (unit === 'day') return [addDays(pinned, n), 3]
      if (unit === 'week') return [addDays(pinned, 7 * n), 3]
      return undefined
    }
    const wd = WEEKDAYS[t]
    if (wd !== undefined) return [onWeekday(pinned, wd, opts.past), 1]
    const mo = MONTHS[t]
    if (mo !== undefined && next !== undefined && /^\d{1,2}$/.test(next.replace(/(st|nd|rd|th)$/, ''))) {
      const yr = at(i + 2)
      const year = yr && /^\d{4}$/.test(yr) ? Number(yr) : undefined
      const k = monthDay(pinned, mo, Number(next.replace(/\D/g, '')), year)
      return k ? [k, year ? 3 : 2] : undefined
    }
    if (next !== undefined && MONTHS[next] !== undefined && /^\d{1,2}(st|nd|rd|th)?$/.test(t)) {
      const k = monthDay(pinned, MONTHS[next]!, Number(t.replace(/\D/g, '')))
      return k ? [k, 2] : undefined
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      const [y, m, d] = t.split('-').map(Number)
      const k = monthDay(pinned, m! - 1, d!, y)
      return k ? [k, 1] : undefined
    }
    const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t)
    if (slash && Number(slash[1]) >= 1 && Number(slash[1]) <= 12) {
      const y = slash[3] ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]) : undefined
      const k = monthDay(pinned, Number(slash[1]) - 1, Number(slash[2]), y)
      return k ? [k, 1] : undefined
    }
    if (t === 'the' && next !== undefined) {
      const dom = domOf(next, false)
      return dom === undefined ? undefined : [onMonthDay(pinned, dom, opts.past), 2]
    }
    const dom = domOf(t, false)
    if (dom !== undefined) return [onMonthDay(pinned, dom, opts.past), 1]
    return undefined
  }

  /** A time or range at i: [when, tokens used]. */
  function time(i: number): [When, number] | undefined {
    const t = at(i)
    if (t === undefined) return undefined
    let n = 1
    let start: Clock | undefined
    let end: Clock | undefined
    if (t === 'alas' || t.startsWith('alas-')) {
      // alas-3, alas 3, alas-tres, alas-tres y medya
      const word = t === 'alas' ? at(i + 1) : t.slice(5)
      if (word === undefined) return undefined
      const sp = SPANISH[word]
      start = sp !== undefined ? { h: sp, m: 0, fixed: false } : clockOf(word, true)
      if (t === 'alas') n = 2
      if (start && at(i + n) === 'y' && (at(i + n + 1) === 'medya' || at(i + n + 1) === 'media')) {
        start = { ...start, m: 30 }
        n += 2
      }
    } else {
      const range = /^(\d{1,2}(?::\d{2})?)(am|pm)?[-–](\d{1,2}(?::\d{2})?)(am|pm)?$/.exec(t)
      const mer = at(i + 1)
      if (range) {
        // Without am/pm, "10-20" is pages or a score; only event lines read it as hours
        if (!opts.event && !range[2] && !range[4]) return undefined
        start = clockOf(range[1]! + (range[2] ?? ''), true)
        end = clockOf(range[3]! + (range[4] ?? ''), true)
        if (!end) return undefined
      } else if (mer !== undefined && MERIDIEM.test(mer) && /^\d{1,2}(:\d{2})?$/.test(t)) {
        start = clockOf(t + mer, false) // "9 am"
        n = 2
      } else {
        start = clockOf(t, false)
      }
    }
    if (!start) return undefined
    // "ng hapon", "gabi"
    const ng = at(i + n) === 'ng' ? 1 : 0
    const qualified = qualify(start, at(i + n + ng))
    if (qualified) {
      start = qualified
      n += 1 + ng
    }
    // "9am - 11am", "9am to 11"
    const sep = at(i + n)
    if (!end && (sep === '-' || sep === '–' || sep === 'to')) {
      const next = at(i + n + 1)
      end = next === undefined ? undefined : clockOf(next, true)
      if (end) n += 2
    }
    if (!end) return [{ time: fmt(settle(start)) }, n]
    // An unmarked start takes the end's half of the day: "7-9pm" is evening
    if (!start.fixed && end.fixed && start.h + 12 <= end.h) start = { ...start, h: start.h + 12, fixed: true }
    start = settle(start)
    // An unmarked end comes after the start: "1-2:30" is 13:00-14:30, "11-1" is 11:00-13:00
    if (!end.fixed && end.h < 12 && end.h * 60 + end.m <= start.h * 60 + start.m) end = { ...end, h: end.h + 12 }
    return [{ time: fmt(start), end: fmt(end) }, n]
  }

  /** A repeat at i: [repeat, tokens used]. */
  function repeat(i: number): [Repeat, number] | undefined {
    const t = at(i)
    if (t === undefined) return undefined
    if (t === 'daily' || t === 'araw-araw') return [{ unit: 'day', every: 1 }, 1]
    if (t === 'weekly' || t === 'linggo-linggo') return [{ unit: 'week', every: 1 }, 1]
    if (t === 'monthly' || t === 'buwan-buwan') return [{ unit: 'month', every: 1 }, 1]
    if (t === 'yearly' || t === 'annually' || t === 'taon-taon') return [{ unit: 'year', every: 1 }, 1]
    if (opts.event) {
      const codes = dayCodes(raw[i]!.replace(/[,.;]+$/, ''))
      if (codes) return [{ unit: 'week', every: 1, on: codes }, 1]
    }
    if (t !== 'every' && t !== 'tuwing' && t !== 'kada' && t !== 'each') return undefined
    let n = 1
    let every = 1
    if (at(i + n) === 'other') {
      every = 2
      n++
    }
    const w = at(i + n)
    if (w === undefined) return undefined
    // every ~6w, every 2 weeks, every ~3 mo
    const iv = /^(~)?(\d+)([a-z]*)$/.exec(w)
    const ivUnit = iv && (iv[3] ? UNITS[iv[3]] : UNITS[at(i + n + 1) ?? ''])
    if (iv && ivUnit) {
      return [{ unit: ivUnit, every: Number(iv[2]), ...(iv[1] ? { approx: true } : {}) }, n + (iv[3] ? 1 : 2)]
    }
    if (UNITS[w] && w.length > 1) return [{ unit: UNITS[w]!, every }, n + 1]
    if (w === 'weekday' || w === 'weekdays') return [{ unit: 'week', every, on: [1, 2, 3, 4, 5] }, n + 1]
    if (w === 'weekend' || w === 'weekends') return [{ unit: 'week', every, on: [6, 0] }, n + 1]
    const slashed = w.split('/')
    if (slashed.length > 1 && slashed.every((d) => weekdayOf(d) !== undefined)) {
      return [{ unit: 'week', every, on: slashed.map((d) => weekdayOf(d)!) }, n + 1]
    }
    // Lists: "mon and wed", "mon, wed", "lunes at huwebes", "15th & 30th", "kinsenas at katapusan"
    const list = (read: (s: string) => number | undefined): [number[], number] | undefined => {
      const vals: number[] = []
      let k = n
      for (;;) {
        const v = read(at(i + k) ?? '')
        if (v === undefined) break
        vals.push(v)
        k++
        const sep = at(i + k)
        const joined = raw[i + k - 1]!.endsWith(',')
        if (joined && read(sep ?? '') !== undefined) continue
        if ((sep === 'and' || sep === 'at' || sep === '&') && read(at(i + k + 1) ?? '') !== undefined) k++
        else break
      }
      return vals.length ? [vals, k] : undefined
    }
    const days = list(weekdayOf)
    if (days) return [{ unit: 'week', every, on: days[0] }, days[1]]
    const doms = list((s) => domOf(s, true))
    if (doms) return [{ unit: 'month', every, on: doms[0] }, doms[1]]
    return undefined
  }

  let until: DayKey | undefined
  const skip: DayKey[] = []
  for (let i = 0; i < raw.length; ) {
    const t = low[i]!
    // "skip oct 14", "except 10/14": one day out of a repeat
    if (t === 'skip' || t === 'except') {
      const d = day(i + 1)
      if (d) {
        skip.push(d[0])
        i += take(i, 1 + d[1])
        continue
      }
    }
    // Deadline and end words take the date (and time) that follows
    if (t === 'due' || t === 'hanggang' || t === 'deadline' || t === 'by' || t === 'until' || t === 'till' || t === 'til') {
      const isUntil = t === 'until' || t === 'till' || t === 'til'
      const d = day(i + 1)
      const tm = time(i + 1 + (d?.[1] ?? 0))
      if (d && isUntil) {
        until = d[0]
        i += take(i, 1 + d[1])
        continue
      }
      if ((d || tm) && !isUntil) {
        out.due ??= { day: d?.[0] ?? pinned, ...tm?.[0] }
        i += take(i, 1 + (d?.[1] ?? 0) + (tm?.[1] ?? 0))
        continue
      }
    }
    // "sa lunes", "on fri", "at 3pm": the little word goes with the date
    const filler = t === 'sa' || t === 'on' || t === 'at' || t === 'ng' || t === '@'
    const j = filler && i + 1 < raw.length ? i + 1 : i
    const r = !out.repeat ? repeat(j) : undefined
    if (r) {
      out.repeat = r[0]
      i += take(i, j - i + r[1])
      continue
    }
    const d = !out.when?.day ? day(j) : undefined
    if (d) {
      out.when = { ...out.when, day: d[0] }
      i += take(i, j - i + d[1])
      continue
    }
    const tm = !out.when?.time ? time(j) : undefined
    if (tm) {
      out.when = { ...out.when, ...tm[0] }
      i += take(i, j - i + tm[1])
      continue
    }
    i++
  }
  if (until && out.repeat) out.repeat.until = until
  else if (until) out.due ??= { day: until }
  if (skip.length && out.repeat) out.repeat.skip = skip
  out.rest = raw.filter((_, k) => !used[k]).join(' ')
  return out
}
