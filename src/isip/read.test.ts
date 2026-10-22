import { describe, expect, it } from 'vitest'
import { DEFAULT_CONTEXT } from '@/entries/parse'
import type { EntryContext } from '@/entries/parse'
import { clauses, entryDay, read } from './read'

const DAY = '2026-10-08' // a Thursday
const at = new Date(`${DAY}T09:00:00`).getTime()
const ctx: EntryContext = { ...DEFAULT_CONTEXT, aliases: { exercise: {}, merchant: {} }, categories: {} }
const readLine = (text: string, c = ctx, decisions?: Record<string, 'dismissed' | 'confirmed'>) =>
  read({ text, day: DAY, createdAt: at, ...(decisions ? { decisions } : {}) }, c)

/*
  The phrase table: the spec's starter lines. Replace and extend with the
  owner's 20–30 real lines before the Phase 2 gate (docs/isip/SPEC.md).
*/
const TABLE: Array<[string, Array<Record<string, unknown>>]> = [
  [
    'Went to the gym. Bench 40kg 3x10, incline db 12kg x 12. Paid 150 day pass',
    [
      { status: 'auto', entry: { kind: 'lift', name: 'Bench press', weight: 40, sets: 3, reps: 10 } },
      { status: 'auto', entry: { kind: 'lift', name: 'Incline dumbbell press', weight: 12, sets: 1, reps: 12 } },
      { status: 'auto', entry: { kind: 'money', amount: 150, category: 'Fitness' } },
    ],
  ],
  ['lunch sa jollibee 189', [{ status: 'auto', entry: { kind: 'money', amount: 189, category: 'Eating out', meal: 'lunch', merchant: 'Jollibee' } }]],
  ['kape 120', [{ status: 'auto', entry: { kind: 'money', amount: 120, category: 'Coffee/snacks' } }]],
  [
    'grocery sa SM 1,240 — eggs 98, chicken 1kg 220, rice 5kg 290, milk 115',
    [
      {
        status: 'auto',
        entry: {
          kind: 'money', amount: 1240, category: 'Groceries', merchant: 'SM', gap: 517,
          items: [{ name: 'eggs', amount: 98 }, { name: 'chicken 1kg', amount: 220 }, { name: 'rice 5kg', amount: 290 }, { name: 'milk', amount: 115 }],
        },
      },
    ],
  ],
  ['spent 500 today', [{ status: 'suggested', entry: { kind: 'money', amount: 500 } }]],
  ['padeliver ng milktea 160', [{ status: 'auto', entry: { kind: 'money', amount: 160, category: 'Delivery' } }]],
  ['nag-bench ako 40 kilos 3x8', [{ status: 'auto', score: 1, entry: { kind: 'lift', name: 'Bench press', weight: 40, sets: 3, reps: 8 } }]],
  ['pull ups bw x 10', [{ status: 'auto', entry: { kind: 'lift', name: 'Pull-up', weight: 0, sets: 1, reps: 10 } }]],
  ['P150 lunch gcash', [{ status: 'auto', score: 1, entry: { kind: 'money', amount: 150, category: 'Food', account: 'gcash', meal: 'lunch' } }]],
  ['@ thu 2pm dentist', [{ status: 'auto', score: 1, entry: { kind: 'event', text: 'dentist', when: { day: DAY, time: '14:00' } } }]],
  ['lunch 150 kahapon', [{ status: 'auto', entry: { kind: 'money', amount: 150, category: 'Food', meal: 'lunch', text: 'lunch' } }]],
  ['Lecture notes: supply and demand curve', []],
  // Beyond the spec's starters
  ['150 pesos load', [{ status: 'auto', entry: { kind: 'money', amount: 150, category: 'Bills & load' } }]],
  ['jeep 150php', [{ status: 'auto', entry: { kind: 'money', amount: 150, category: 'Transport' } }]],
  ['bayad 99 sa printing', [{ status: 'auto', entry: { kind: 'money', amount: 99, category: 'School' } }]],
  ['gastos 200', [{ status: 'suggested', entry: { kind: 'money', amount: 200 } }]],
  ['grabfood 320', [{ status: 'auto', entry: { kind: 'money', amount: 320, category: 'Delivery' } }]],
  ['squats 3 sets of 5', [{ status: 'auto', entry: { kind: 'lift', name: 'Squat', weight: 0, sets: 3, reps: 5 } }]],
  ['lunch with 3 friends', []],
  ['read 30 pages tapos slept 8 hours', []],
  ['chapter 12 done', []],
  ['finally finished the essay', []],
]

/*
  A day-to-day set written for the gate: a student who commutes, lifts and
  shops at the palengke. Stand-ins until the owner's own lines replace them.
*/
TABLE.push(
  ['jeep papuntang school 13', [{ status: 'auto', entry: { kind: 'money', amount: 13, category: 'Transport' } }]],
  ['grab pauwi 186 gcash', [{ status: 'auto', entry: { kind: 'money', amount: 186, category: 'Transport', account: 'gcash' } }]],
  ['load 99 globe', [{ status: 'auto', entry: { kind: 'money', amount: 99, category: 'Bills & load' } }]],
  ['tuition downpayment 5,000', [{ status: 'auto', entry: { kind: 'money', amount: 5000, category: 'School' } }]],
  ['xerox ng readings 45', [{ status: 'auto', entry: { kind: 'money', amount: 45, category: 'School' } }]],
  ['merienda fishball 20', [{ status: 'auto', entry: { kind: 'money', amount: 20, category: 'Coffee/snacks', meal: 'merienda' } }]],
  ['dinner sa mang inasal 159 with blockmates', [{ status: 'auto', entry: { kind: 'money', amount: 159, category: 'Eating out', meal: 'dinner', merchant: 'Mang Inasal' } }]],
  [
    'starbucks 180 tapos bus 45',
    [
      { status: 'auto', entry: { kind: 'money', amount: 180, category: 'Coffee/snacks' } },
      { status: 'auto', entry: { kind: 'money', amount: 45, category: 'Transport' } },
    ],
  ],
  ['foodpanda jollibee 289', [{ status: 'auto', entry: { kind: 'money', amount: 289, category: 'Delivery' } }]],
  ['meralco bill 1,420 kahapon', [{ status: 'auto', entry: { kind: 'money', amount: 1420, category: 'Bills & load', text: 'meralco bill' } }]],
  ['gamot sa mercury 235', [{ status: 'auto', entry: { kind: 'money', amount: 235, category: 'Health', merchant: 'Mercury' } }]],
  ['birthday gift for mama 650', [{ status: 'auto', entry: { kind: 'money', amount: 650, category: 'Fun' } }]],
  ['P2,500 shopee sapatos', [{ status: 'auto', score: 1, entry: { kind: 'money', amount: 2500, category: 'Shopping' } }]],
  [
    'palengke 450 — isda 180, gulay 120, bigas 150',
    [{ status: 'auto', entry: { kind: 'money', amount: 450, category: 'Groceries', items: [{ name: 'isda', amount: 180 }, { name: 'gulay', amount: 120 }, { name: 'bigas', amount: 150 }] } }],
  ],
  ['puregold 1,850', [{ status: 'auto', entry: { kind: 'money', amount: 1850, category: 'Groceries' } }]],
  ['bayad kay kuya 50', [{ status: 'suggested', entry: { kind: 'money', amount: 50 } }]],
  ['squat 60kg 5x5', [{ status: 'auto', score: 1, entry: { kind: 'lift', name: 'Squat', weight: 60, sets: 5, reps: 5 } }]],
  ['deadlift 100x5 @8', [{ status: 'auto', score: 1, entry: { kind: 'lift', name: 'Deadlift', weight: 100, reps: 5, sets: 1, rpe: 8 } }]],
  [
    'ohp 30kg 3x8, lat pulldown 45kg 3x10',
    [
      { status: 'auto', entry: { kind: 'lift', name: 'Overhead press', weight: 30, sets: 3, reps: 8 } },
      { status: 'auto', entry: { kind: 'lift', name: 'Lat pulldown', weight: 45, sets: 3, reps: 10 } },
    ],
  ],
  ['nag-squat ako 70 kilos 3x5', [{ status: 'auto', entry: { kind: 'lift', name: 'Squat', weight: 70, sets: 3, reps: 5 } }]],
  ['dips bw x 12', [{ status: 'auto', entry: { kind: 'lift', name: 'Dip', weight: 0, sets: 1, reps: 12 } }]],
  ['✓ water 6', [{ status: 'auto', score: 1, entry: { kind: 'tick', name: 'water', count: 6 } }]],
  ['@ sat 9am org meeting', [{ status: 'auto', score: 1, entry: { kind: 'event', text: 'org meeting', when: { day: '2026-10-10', time: '09:00' } } }]],
  ['naglakad 5 km pauwi', []],
  ['slept 7 hours, gym later', []],
  ['quiz sa calc bukas, 20 items', []],
  ['ipon 500', []],
)

/* Common lines, generated to cover an ordinary Filipino day beyond the two sets above. */
const money = (amount: number, extra: Record<string, unknown> = {}) => [{ status: 'auto', entry: { kind: 'money', amount, ...extra } }]
const lift = (name: string, weight: number, sets: number, reps: number) => [{ status: 'auto', entry: { kind: 'lift', name, weight, sets, reps } }]
TABLE.push(
  ['tricycle 20', money(20, { category: 'Transport' })],
  ['pamasahe 50', money(50, { category: 'Transport' })],
  ['mrt 28', money(28, { category: 'Transport' })],
  ['angkas 120', money(120, { category: 'Transport' })],
  ['gas 1,000', money(1000, { category: 'Transport' })],
  ['meralco 2,350', money(2350, { category: 'Bills & load' })],
  ['wifi 1,299 pldt', money(1299, { category: 'Bills & load' })],
  ['spotify 149', money(149, { category: 'Bills & load' })],
  ['upa 5000', money(5000, { category: 'Bills & load' })],
  ['gamot 85', money(85, { category: 'Health' })],
  ['vitamins 450', money(450, { category: 'Health' })],
  ['tuition 15,000', money(15000, { category: 'School' })],
  ['print 30', money(30, { category: 'School' })],
  ['shopee 599', money(599, { category: 'Shopping' })],
  ['sine 350', money(350, { category: 'Fun' })],
  ['regalo kay mama 800', money(800, { category: 'Fun' })],
  ['milktea 120', money(120, { category: 'Coffee/snacks' })],
  ['7-eleven 85', money(85, { category: 'Coffee/snacks' })],
  ['mcdo 199', money(199, { category: 'Eating out' })],
  ['almusal 80', money(80, { category: 'Food', meal: 'breakfast' })],
  ['hapunan 250', money(250, { category: 'Food', meal: 'dinner' })],
  ['ulam 120', money(120, { category: 'Food' })],
  ['palengke 600', money(600, { category: 'Groceries' })],
  ['foodpanda 350', money(350, { category: 'Delivery' })],
  ['gym membership 1500', money(1500, { category: 'Fitness' })],
  ['whey 1800', money(1800, { category: 'Fitness' })],
  ['allowance 2000', money(2000, { flow: 'in' })],
  ['refund 299 shopee', money(299, { flow: 'in' })],
  ['deadlift 120kg 5x3', lift('Deadlift', 120, 5, 3)],
  ['lat pulldown 50kg 3x12', lift('Lat pulldown', 50, 3, 12)],
  ['rdl 60kg 3x8', lift('Romanian deadlift', 60, 3, 8)],
  ['curls 12kg 3x12', lift('Bicep curl', 12, 3, 12)],
  ['push ups x 20', lift('Push-up', 0, 1, 20)],
  ['meeting tomorrow 10am', [{ status: 'auto', entry: { kind: 'event', text: 'meeting', when: { day: '2026-10-09', time: '10:00' } } }]],
  ['bday ni ana sat 7pm', [{ status: 'auto', entry: { kind: 'event', when: { day: '2026-10-10', time: '19:00' } } }]],
  ['remind me to pay rent fri', [{ status: 'auto', entry: { kind: 'event', text: 'pay rent', remind: 0 } }]],
  ['ang init ngayon', []],
  ['studied for 2 hours', []],
  ['room 204 exam', []],
  ['plank 60s', []],
)

describe('the phrase table', () => {
  it.each(TABLE)('%s', (line, expected) => {
    const got = readLine(line)
    expect(got).toHaveLength(expected.length)
    expected.forEach((e, i) => expect(got[i]).toMatchObject(e))
  })

  it('never holds a number that is not in the line', () => {
    for (const [line] of TABLE) {
      for (const r of readLine(line)) {
        const e = r.entry
        const numbers = e.kind === 'money' ? [e.amount, ...(e.items ?? []).map((i) => i.amount)] : e.kind === 'lift' ? [e.weight, e.reps, e.sets].filter((n) => n > 1) : []
        for (const n of numbers) expect(line.replace(/,/g, '')).toContain(String(n))
      }
    }
  })
})

describe('reading', () => {
  it('splits clauses on . , ; then tapos, keeping spans; a grocery list stays whole', () => {
    const text = 'kape 120, jeep 13 tapos lunch 150; grocery sa SM 500 — eggs 98, milk 115. bus 40'
    expect(clauses(text).map(([a, b]) => text.slice(a, b))).toEqual(['kape 120', 'jeep 13', 'lunch 150', 'grocery sa SM 500 — eggs 98, milk 115', 'bus 40'])
  })

  it('a bare amount with no clue scores below 0.8; a price that is not money is never one', () => {
    expect(readLine('spent 500 today')[0]!.score).toBeLessThan(0.8)
    expect(readLine('bench 40kg 3x10')[0]!.entry.kind).toBe('lift')
    expect(readLine('500')).toEqual([])
  })

  it('a grocery list with no total adds its Items up', () => {
    expect(readLine('palengke: kamatis 40, sibuyas 60')[0]!.entry).toMatchObject({ amount: 100, category: 'Groceries' })
    expect(readLine('palengke: kamatis 40, sibuyas 60')[0]!.entry).not.toHaveProperty('gap')
  })

  it('the owner’s decisions win, keyed by the span’s text', () => {
    expect(readLine('spent 500 today', ctx, { 'spent 500 today': 'confirmed' })[0]!.status).toBe('confirmed')
    const both = readLine('kape 120, jeep 13', ctx, { 'jeep 13': 'dismissed' })
    expect(both.map((r) => r.status)).toEqual(['auto', 'dismissed'])
  })

  it('corrections win: a category for the merchant or first word, aliases for names', () => {
    const c: EntryContext = { ...ctx, categories: { jollibee: 'Fun', pabango: 'Shopping' }, aliases: { exercise: { 'incline db': 'Incline DB press' }, merchant: { sm: 'SM Megamall' } } }
    expect(readLine('lunch sa jollibee 189', c)[0]!.entry).toMatchObject({ category: 'Fun' })
    expect(readLine('pabango 300', c)[0]!).toMatchObject({ status: 'auto', entry: { category: 'Shopping' } })
    expect(readLine('incline db 12kg x 12', c)[0]!.entry).toMatchObject({ name: 'Incline DB press' })
    expect(readLine('grocery sa sm 900', c)[0]!.entry).toMatchObject({ merchant: 'SM Megamall' })
    expect(readLine('grocery sa sm 900', c)[0]!.key).toBe('sm')
  })

  it('a stored choice of Groceries reads as Food › Groceries', async () => {
    const { categoryLabel, topCategory } = await import('@/entries/categories')
    expect([categoryLabel('Groceries'), topCategory('Groceries'), categoryLabel('Transport')]).toEqual(['Food › Groceries', 'Food', 'Transport'])
  })

  it('a money, tick or lift Reading counts for the Entry’s day; an event keeps its own date', () => {
    const r = read({ text: 'P85 jeep', day: '2026-10-01', createdAt: at }, ctx)
    expect(r[0]!.entry).toMatchObject({ day: '2026-10-01' })
  })
})

describe('no marker to type', () => {
  const habits: EntryContext = { ...ctx, ticks: ['water', 'gym'] }
  it('a habit’s name is a tick: "water 3", "nag-gym", "did gym", "gym done"', () => {
    expect(readLine('water 3', habits)[0]).toMatchObject({ status: 'auto', entry: { kind: 'tick', name: 'water', count: 3 } })
    for (const line of ['nag-gym', 'did gym', 'gym done', 'Gym']) expect(readLine(line, habits)[0]?.entry).toMatchObject({ kind: 'tick', name: 'gym' })
    expect(readLine('water the plants', habits)).toEqual([])
  })

  it('a time is an event: counted with a day today or later, asked without one', () => {
    expect(readLine('dentist fri 2pm')[0]).toMatchObject({ status: 'auto', entry: { kind: 'event', text: 'dentist', when: { day: '2026-10-09', time: '14:00' } } })
    expect(readLine('meeting bukas 3pm !30m')[0]).toMatchObject({ status: 'auto', entry: { kind: 'event', text: 'meeting', remind: 30 } })
    expect(readLine('meeting 3pm')[0]).toMatchObject({ status: 'suggested', entry: { kind: 'event' } })
    expect(readLine('lunch 150 at 1pm')[0]!.entry.kind).toBe('money')
    expect(readLine('slept 8 hours')).toEqual([])
  })
})

describe('money in, money moved, reminders', () => {
  it('income words make money in, with or without the +', () => {
    expect(readLine('sweldo 8000 bank')[0]).toMatchObject({ status: 'auto', entry: { kind: 'money', flow: 'in', amount: 8000, account: 'bank' } })
    expect(readLine('baon 500')[0]!.entry).toMatchObject({ flow: 'in', amount: 500 })
    expect(readLine('P8000 sweldo')[0]!.entry).toMatchObject({ flow: 'in', amount: 8000 })
    expect(readLine('P8000 sweldo')[0]!.entry).not.toHaveProperty('category')
    expect(readLine('lunch 150')[0]!.entry).toMatchObject({ flow: 'out' })
  })

  it('two accounts and a moving word make a transfer', () => {
    expect(readLine('gcash to cash 500')[0]).toMatchObject({ status: 'auto', entry: { kind: 'money', flow: 'move', amount: 500, account: 'gcash', to: 'cash' } })
    expect(readLine('transfer 1,000 bank gcash')[0]!.entry).toMatchObject({ flow: 'move', amount: 1000, account: 'bank', to: 'gcash' })
    expect(readLine('lunch 150 gcash')[0]!.entry).toMatchObject({ flow: 'out', account: 'gcash' })
  })

  it('"remind me to" is an event that reminds, today when no day is said', () => {
    expect(readLine('remind me to call mom fri 3pm')[0]).toMatchObject({ status: 'auto', entry: { kind: 'event', text: 'call mom', remind: 0, when: { day: '2026-10-09', time: '15:00' } } })
    expect(readLine('paalala: pay meralco 1420 bukas !1d')[0]!.entry).toMatchObject({ kind: 'event', remind: 1440, when: { day: '2026-10-09' } })
    expect(readLine('remind me to buy eggs')[0]!.entry).toMatchObject({ kind: 'event', text: 'buy eggs', remind: 0, when: { day: DAY } })
  })
})

describe('the day a line counts for', () => {
  it('moves back with a day word when it holds an expense, tick or lift', () => {
    expect(entryDay('lunch 150 kahapon', DAY, ctx)).toBe('2026-10-07')
    expect(entryDay('P85 jeep yesterday', DAY, ctx)).toBe('2026-10-07')
    expect(entryDay('✓ water kahapon', DAY, ctx)).toBe('2026-10-07')
  })

  it('stays for events, plain words and days ahead', () => {
    expect(entryDay('@ fri 2pm dentist', DAY, ctx)).toBe(DAY)
    expect(entryDay('exam fri', DAY, ctx)).toBe(DAY)
    expect(entryDay('P500 tuition bukas', DAY, ctx)).toBe(DAY)
  })
})
