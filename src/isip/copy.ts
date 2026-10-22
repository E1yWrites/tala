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
    label: 'Write a line in Isip',
    placeholder: 'Write anything…  lunch 150 · dentist fri 2pm · bench 60x5x3',
    placeholderShort: 'Write anything…  lunch 150',
    saved: (n: number): string => (n === 1 ? 'Saved' : `${n} lines saved`),
    palette: (line: string): string => `Write in Isip: “${line}”`,
    forDay: (day: string): string => `Write it down for ${day}…`,
  },
  day: {
    title: 'Written',
    empty: 'Nothing written this day.',
    emptyToday: 'What you write above lands here, sorted: “lunch 150 gcash”, “dentist fri 2pm”, “bench 60x5x3”, “✓ water”.',
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
  empty: {
    today: 'Nothing planned. Write “dentist fri 2pm” above, or “[ ] essay fri” in a note.',
    upcoming: 'Write a line with a time above (“dentist fri 2pm”, “@ MWF 9-10:30 Calc 1” for a class), or a dated task in a note (“[ ] essay due fri”).',
    money: 'No spending yet this month. Write “lunch 150” above; add “gcash” to say where it came from.',
  },
  habits: {
    note: 'From every ✓ line you write in Isip',
    how: 'Write a habit’s name above to tick it: “water 3”, “gym kahapon”; “✓ stretch” starts a new one, “✓ gym skip” is a day off. Strength grows as you keep it; a missed day dents it and nothing resets it.',
    untracked: 'Ticked, not kept yet',
    ticked: (days: number): string => `${days} ${days === 1 ? 'day' : 'days'} in the last 4 weeks`,
    track: 'Keep',
    trackLabel: (name: string): string => `Keep “${name}” as a habit`,
  },
  search: {
    heading: 'In Isip',
    hint: (day: string): string => `Isip · ${day}`,
  },
  /** First run: what Tala is, said type-first. */
  onboarding: {
    headline: 'Write it once. Tala sorts it out.',
    promises: [
      'Type a line about your day: “lunch 150”, “bench 40kg 3x10”, “dentist fri 2pm”. No forms, no categories.',
      'Tala files it under Money, Workouts, Habits and Upcoming, and you can undo anything it read.',
      'Notes too: type, write with a pen, and mark up PDF slides, even offline.',
      'No account. Everything stays on this device unless you back it up.',
    ],
    nameNote: 'Only for the greeting. You can leave it empty.',
    tipsIntro: 'Three things worth knowing:',
    tips: [
      ['Just write', 'The gold Write button (or Ctrl+Shift+Space) takes a line from anywhere. Tala reads it; tap a chip to fix what it got wrong.'],
      ['Notes', 'New note for lectures and longer thoughts. Tap Write in a note for the pen.'],
      ['Back up', 'Everything lives on this device only. Save a backup from Settings now and then.'],
    ] as Array<[string, string]>,
  },
  undo: 'Undo',
} as const
