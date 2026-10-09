import { create } from 'zustand'
import { db } from '@/database/db'
import { balances, DEFAULT_ACCOUNTS } from '@/entries/money'
import type { Account } from '@/entries/money'
import { scanEntries } from '@/entries/scan'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { createId } from '@/utils/id'

/*
  The Library's money settings, in `meta` so a backup carries them: the
  accounts (and their balance adjustments), what to keep aside, and the
  category you chose for a word. The amounts themselves are lines on pages.
*/

const ACCOUNTS_KEY = 'money:accounts'
const KEEP_KEY = 'money:keep'
const CATEGORIES_KEY = 'money:categories'

interface MoneyState {
  accounts: Account[]
  keep: number
  categories: Record<string, string>
}

export const useMoneyStore = create<MoneyState>(() => ({ accounts: DEFAULT_ACCOUNTS, keep: 0, categories: {} }))

const isAccount = (a: unknown): a is Account => {
  const x = a as Account
  return !!x && typeof x.id === 'string' && typeof x.name === 'string' && /^[a-z0-9]+$/.test(x.tag) && Number.isFinite(x.adjust)
}

/** Reads the money rows into the store (boot, and after a restore). */
export async function loadMoney(): Promise<void> {
  const [accounts, keep, categories] = await Promise.all([ACCOUNTS_KEY, KEEP_KEY, CATEGORIES_KEY].map((k) => db.meta.get(k)))
  const list = Array.isArray(accounts?.value) ? accounts.value.filter(isAccount) : []
  const cats = categories?.value && typeof categories.value === 'object' ? (categories.value as Record<string, unknown>) : {}
  useMoneyStore.setState({
    accounts: list.length ? list : DEFAULT_ACCOUNTS,
    keep: typeof keep?.value === 'number' && keep.value >= 0 ? keep.value : 0,
    categories: Object.fromEntries(Object.entries(cats).filter((e): e is [string, string] => typeof e[1] === 'string')),
  })
}

function save(key: string, value: unknown): void {
  void db.meta.put({ key, value }).catch((err) => console.error(`[tala] could not save ${key}`, err))
}

function setAccounts(accounts: Account[]): void {
  useMoneyStore.setState({ accounts })
  save(ACCOUNTS_KEY, accounts)
}

/** The word to type for an account: lowercase letters and digits of its first word ("BPI Savings" → "bpi"). */
export const tagFor = (name: string): string => (name.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

/** "I have ₱1,250 in GCash": stores the difference from what the lines add up to, so later lines still count. */
export function setBalance(id: string, actual: number): void {
  const { notes, inkDocs } = useNoteStore.getState()
  const { accounts } = useMoneyStore.getState()
  const now = balances(scanEntries(notes, usePageStore.getState().pagesByNote, inkDocs), accounts).get(id) ?? 0
  setAccounts(accounts.map((a) => (a.id === id ? { ...a, adjust: a.adjust + actual - now } : a)))
}

/** Adds an account; false when its word is empty or already taken. */
export function addAccount(name: string): boolean {
  const tag = tagFor(name)
  const { accounts } = useMoneyStore.getState()
  if (!tag || accounts.some((a) => a.tag === tag)) return false
  setAccounts([...accounts, { id: createId(), name: name.trim(), tag, adjust: 0 }])
  return true
}

export function renameAccount(id: string, name: string): boolean {
  const tag = tagFor(name)
  const { accounts } = useMoneyStore.getState()
  if (!tag || accounts.some((a) => a.tag === tag && a.id !== id)) return false
  setAccounts(accounts.map((a) => (a.id === id ? { ...a, name: name.trim(), tag } : a)))
  return true
}

/** Removes an account (never the last). Its lines then count toward the first account. */
export function removeAccount(id: string): void {
  const { accounts } = useMoneyStore.getState()
  if (accounts.length > 1) setAccounts(accounts.filter((a) => a.id !== id))
}

export function setKeep(n: number): void {
  const keep = Number.isFinite(n) && n > 0 ? n : 0
  useMoneyStore.setState({ keep })
  save(KEEP_KEY, keep)
}

/** Files a word ("pabango") under a category from now on. */
export function setCategory(word: string, category: string): void {
  const categories = { ...useMoneyStore.getState().categories, [word.toLowerCase()]: category }
  useMoneyStore.setState({ categories })
  save(CATEGORIES_KEY, categories)
}
