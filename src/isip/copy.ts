/*
  Every Isip line in one place, so the owner can review the English and the
  Filipino together (as with coach/copy.ts). Describe, never judge; nothing
  about how often you write.
*/

import { formatPeso } from '@/entries/parse'

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/** "A", "A and B", "A, B and C". */
const list = (xs: string[]): string => (xs.length < 3 ? xs.join(' and ') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)
const peso = (n: number): string => formatPeso(Math.round(n))
/** "every week", "every 2 weeks", "every month", "every 10 days". */
const every = (days: number): string =>
  days === 7 ? 'every week' : days % 7 === 0 && days < 28 ? `every ${days / 7} weeks` : days >= 28 && days <= 31 ? 'every month' : `every ${days} days`
const first = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

export const ISIP = {
  capture: {
    title: 'Write in Isip',
    tab: 'Write',
    label: 'Write a line in Isip',
    placeholder: 'Write it down…  P150 lunch · @ 2pm dentist · bench 60x5x3',
    placeholderShort: 'Write it down…  P150 lunch · @ 2pm',
    saved: (n: number): string => (n === 1 ? 'Saved' : `${n} lines saved`),
    palette: (line: string): string => `Write in Isip: “${line}”`,
  },
  day: {
    title: 'Written',
    empty: 'Nothing written this day.',
    emptyToday: 'Lines you write above land here: “P150 lunch gcash”, “@ fri 2pm dentist”, “✓ water”.',
    prev: 'Day before',
    next: 'Day after',
    today: 'Today',
    pick: 'Pick a day',
  },
  entry: {
    edit: (text: string): string => `Edit: ${text}`,
    text: 'Line',
    day: 'Day it counts for',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    deleted: 'Line deleted',
  },
  reading: {
    fix: (label: string): string => `Correct: ${label}`,
    dismiss: (label: string): string => `Don’t count: ${label}`,
    confirm: 'confirm?',
    confirmLabel: (label: string): string => `Count: ${label}`,
    restore: (label: string): string => `Count again: ${label}`,
    category: 'Category',
    pick: 'Pick one',
    merchant: 'Place',
    exercise: 'Exercise',
    from: (word: string): string => `Lines with “${word}” read this way from now on. Your line stays as you wrote it.`,
    save: 'Save',
    cancel: 'Cancel',
  },
  insight: {
    split: { title: 'Usual split', day: (wd: number): string => `${WEEKDAYS[wd]}s`, count: (n: number): string => `${n} Workouts` },
    weekly: { title: 'Top weight by week', note: 'The heaviest weight each week, oldest first' },
    food: { title: 'Groceries, eating out, delivery', note: 'Food in the last 4 weeks', groceries: 'Groceries', eatingOut: 'Eating out', delivery: 'Delivery', byKind: 'Food by kind', other: 'Other food' },
    recurring: {
      title: 'Comes back',
      every,
      next: (day: string): string => `next around ${day}`,
    },
    prices: {
      title: 'Grocery prices',
      change: (last: number, prev: number): string =>
        last === prev ? 'same as last time' : `${peso(Math.abs(last - prev))} ${last > prev ? 'more' : 'less'} than last time (${peso(prev)})`,
    },
    gym: {
      title: 'Food on gym days',
      gym: 'Gym days',
      rest: 'Other days',
      perDay: 'a day',
      note: (g: number, r: number): string => `Over ${g} gym ${g === 1 ? 'day' : 'days'} and ${r} other ${r === 1 ? 'day' : 'days'} you wrote in Isip`,
    },
  },
  /** Bituin's one mention of an insight the first time it unlocks: it describes, never judges. */
  bituin: {
    body: 'From what you wrote in Isip.',
    action: 'Show me',
    later: 'Got it',
    split: (wd: number, exercises: string[]): string => `${WEEKDAYS[wd]}s are usually ${list(exercises)}.`,
    weekly: (name: string): string => `Your top ${name} each week is on Workouts now.`,
    price: (item: string, diff: number): string => `${first(item)} cost ${peso(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than last time.`,
    recurring: (amount: number, what: string, days: number): string => `${peso(amount)} for ${what} comes back ${every(days)}.`,
    mix: (g: number, e: number, d: number): string => `Food, last 4 weeks: ${peso(g)} groceries, ${peso(e)} eating out, ${peso(d)} delivery.`,
    gym: (g: number, r: number): string => `On gym days food comes to ${peso(g)} a day; on other days, ${peso(r)}.`,
  },
  search: {
    hint: (day: string): string => `Isip · ${day}`,
  },
  undo: 'Undo',
} as const
