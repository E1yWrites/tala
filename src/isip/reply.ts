import { topCategory } from '@/entries/categories'
import { addDays } from '@/entries/dates'
import type { DayKey, When } from '@/entries/dates'
import { accountName, formatDay, formatPeso, formatRepeat, formatTime, formatWeight } from '@/entries/parse'
import type { Entry } from '@/entries/parse'
import type { IsipEntry } from '@/types/models'
import { ISIP } from './copy'
import { counts, read } from './read'
import type { Reading } from './read'

/*
  What Bituin says under a line on Today. Rules, not a model: the lead Reading
  says what was filed, in words, and the day around it adds the one fact worth
  knowing (food so far today, water 5 of 8, a PR). Every number is one the
  user's own lines already hold.
*/

const R = ISIP.reply
const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The same line always gets the same wording. */
function pick<T>(id: string, options: readonly T[]): T {
  let h = 0
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) | 0
  return options[Math.abs(h) % options.length]!
}

/** "today", "tomorrow", "Fri, Oct 23", plus " at 2pm". */
function when(w: When | undefined, today: DayKey): string {
  const day = !w?.day || w.day === today ? R.today : w.day === addDays(today, 1) ? R.tomorrow : formatDay(w.day)
  return `${day}${w?.time ? R.at(formatTime(w.time)) : ''}`
}

/** 15 → "15 min before", 120 → "2 hr before", 0 → "at the time". */
function lead(min: number): string {
  if (min === 0) return 'at the time'
  return min % 1440 === 0 ? `${min / 1440} day before` : min % 60 === 0 ? `${min / 60} hr before` : `${min} min before`
}

export interface ReplyContext {
  /** Every Entry written for the same day, the line itself included. */
  day: IsipEntry[]
  today: DayKey
  /** A habit's target by lowercase name ("water" → 8). */
  targets: Record<string, number>
  /** For a lift: "PR", "last Oct 20: 3×5 57.5kg" or "" (workouts.liftNote). */
  liftNote?: string
}

export function reply(entry: IsipEntry, readings: Reading[], ctx: ReplyContext): string {
  const lead_ = readings.find((r) => r.status !== 'dismissed')
  if (!readings.length) return pick(entry.id, R.moods.find((m) => m.words.test(entry.text))?.say ?? R.plain)
  if (!lead_) return pick(entry.id, R.dismissed)
  if (lead_.status === 'suggested') return pick(entry.id, R.unsure(label(lead_.entry, ctx.today)))
  const extra = readings.filter((r) => r !== lead_ && counts(r)).length
  return [say(entry, lead_.entry, ctx), extra ? R.more(extra) : ''].filter(Boolean).join(' ')
}

/** A plain name for what a Reading is, for "Did you mean …?". */
function label(e: Entry, today: DayKey): string {
  switch (e.kind) {
    case 'money':
      return e.flow === 'in' ? `+${formatPeso(e.amount)}` : formatPeso(e.amount)
    case 'event':
      return `${e.text || 'that'} ${when(e.when, today)}`.trim()
    case 'task':
      return `${e.text || 'that'} ${when(e.when ?? e.due, today)}`.trim()
    case 'tick':
      return `✓ ${e.name}`
    case 'lift':
      return `${e.name} ${e.sets}×${e.reps}`
  }
}

/** The Readings that count on this line's day, written no later than it. */
function dayReadings(entry: IsipEntry, ctx: ReplyContext): Entry[] {
  return ctx.day.filter((x) => x.createdAt <= entry.createdAt).flatMap((x) => read(x).filter(counts).map((r) => r.entry))
}

function say(entry: IsipEntry, e: Entry, ctx: ReplyContext): string {
  switch (e.kind) {
    case 'money': {
      const amount = formatPeso(e.amount)
      if (e.flow === 'move') return R.moved(amount, accountName(e.account!), accountName(e.to!))
      if (e.flow === 'in') return pick(entry.id, R.received(amount, e.account ? R.into(accountName(e.account)) : ''))
      const what = e.meal ?? e.merchant ?? (e.text.trim() || (e.category ? topCategory(e.category).toLowerCase() : 'that'))
      const first = pick(entry.id, R.spent(amount, what, e.account ? R.from(accountName(e.account)) : ''))
      if (e.items?.length) return `${first} ${R.items(e.items.length)}`
      const top = e.category ? topCategory(e.category) : undefined
      if (!top) return first
      const total = dayReadings(entry, ctx).reduce(
        (sum, x) => (x.kind === 'money' && x.flow === 'out' && x.category && topCategory(x.category) === top ? sum + x.amount : sum),
        0,
      )
      return total > e.amount ? `${first} ${R.dayTotal(formatPeso(total), top.toLowerCase())}` : first
    }
    case 'event': {
      const title = cap(e.text || 'Event')
      const remind = e.remind !== undefined ? ` ${R.remind(lead(e.remind))}` : ''
      if (e.repeat && e.income && e.amount) return R.income(`+${formatPeso(e.amount)}`, formatRepeat(e.repeat))
      if (e.repeat) return R.repeats(title, `${formatRepeat(e.repeat)}${e.when?.time ? R.at(formatTime(e.when.time)) : ''}`) + remind
      return pick(entry.id, R.event(title, when(e.when, ctx.today))) + remind
    }
    case 'task': {
      const title = e.text || 'that'
      const day = e.due?.day ? R.due(when(e.due, ctx.today)) : e.when?.day ? R.on(when(e.when, ctx.today)) : ''
      return pick(entry.id, R.task(title, day))
    }
    case 'tick': {
      if (e.skip) return R.dayOff(e.name)
      const target = ctx.targets[e.name.toLowerCase()] ?? 1
      if (target <= 1) return pick(entry.id, R.tick(e.name))
      const n = dayReadings(entry, ctx).reduce((sum, x) => (x.kind === 'tick' && !x.skip && x.name.toLowerCase() === e.name.toLowerCase() ? sum + x.count : sum), 0)
      return R.count(e.name, n, target)
    }
    case 'lift': {
      const first = R.lift(e.name, `${e.sets}×${e.reps} at ${formatWeight(e)}`)
      const note = ctx.liftNote ?? ''
      return `${first} ${note === 'PR' ? R.pr : note ? R.last(note.replace(/^last /, '')) : R.firstLift}`
    }
  }
}
