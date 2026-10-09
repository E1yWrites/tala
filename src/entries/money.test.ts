import { describe, expect, it } from 'vitest'
import { DEFAULT_ACCOUNTS, balances, categoryOf, monthSummary, safeToSpend } from './money'
import { DEFAULT_CONTEXT, parseLine } from './parse'
import type { EntryRef } from './scan'

const TODAY = '2026-10-08' // a Thursday
let n = 0
function line(text: string, at = TODAY): EntryRef {
  return { noteId: 'n', pageId: 'p', pageNumber: 1, path: [n++], text, at, archived: false, entry: parseLine(text, at, DEFAULT_CONTEXT)! }
}
const accounts = DEFAULT_ACCOUNTS.map((a) => (a.id === 'gcash' ? { ...a, adjust: 1000 } : a))

describe('balances', () => {
  it('adds every line for an account to its adjustment; no account means the first one', () => {
    const b = balances([line('P150 lunch gcash'), line('+P500 baon'), line('P200 gcash>cash'), line('P85 jeep')], accounts)
    expect(Object.fromEntries(b)).toEqual({ cash: 500 - 85 + 200, gcash: 1000 - 150 - 200, maya: 0, bank: 0 })
  })
})

describe('categories', () => {
  it('guesses from the first word, and your choice wins', () => {
    expect(categoryOf('jeep pauwi', {})).toBe('Transport')
    expect(categoryOf('Lunch with org', {})).toBe('Food')
    expect(categoryOf('pabango', {})).toBe('Other')
    expect(categoryOf('pabango', { pabango: 'Shopping' })).toBe('Shopping')
  })

  it('sums the month by category, newest line first', () => {
    const m = monthSummary([line('P150 lunch', '2026-10-01'), line('P85 jeep', '2026-10-07'), line('P60 kape', '2026-10-07'), line('+P500 baon'), line('P99 lunch', '2026-09-30')], '2026-10', {})
    expect(m).toMatchObject({ spent: 295, income: 500, byCategory: [['Food', 210], ['Transport', 85]] })
    expect(m.lines.map((l) => l.text)[0]).toBe('+P500 baon')
  })
})

describe('safe to spend', () => {
  it('spreads what you have, less bills and what you keep, over the days to your next income', () => {
    const refs = [
      line('@ tuwing kinsenas at katapusan +P8000 sweldo'),
      line('@ every 12th P1299 globe'),
      line('P100 lunch'), // today
    ]
    const s = safeToSpend(refs, accounts, 200, TODAY)
    // until the 15th: 7 days (8th..14th). Have 1000 - 100 = 900; at the start of today 1000; less 200 kept, 1299 bill
    expect(s).toMatchObject({ until: '2026-10-15', incomeName: 'sweldo', days: 7, bills: 1299, spentToday: 100, total: 900 })
    expect(s.perDay).toBeCloseTo((1000 - 200 - 1299) / 7)
    expect(s.leftToday).toBeCloseTo(s.perDay - 100)
  })

  it('uses the month end when no income line exists, and a daily baon means today alone', () => {
    expect(safeToSpend([line('+P3100 baon')], DEFAULT_ACCOUNTS, 0, TODAY)).toMatchObject({ until: '2026-11-01', days: 24, perDay: 3100 / 24 })
    expect(safeToSpend([line('@ daily +P200 baon'), line('+P200 baon')], DEFAULT_ACCOUNTS, 0, TODAY)).toMatchObject({ until: '2026-10-09', days: 1, perDay: 200 })
  })
})
