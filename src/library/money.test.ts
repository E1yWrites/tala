import Dexie from 'dexie'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/database/db'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { useIsipStore } from '@/store/isipStore'

const toast = vi.hoisted(() => Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn(), message: vi.fn() }))
vi.mock('sonner', () => ({ toast }))

const { flush, markOnDisk } = await import('./notes')
const { addEntries, libraryRefs } = await import('./isip')
const { addAccount, loadMoney, setBalance, useMoneyStore } = await import('./money')
const { balances } = await import('@/entries/money')
const { entryContext, parseLine } = await import('@/entries/parse')
await import('./context')

const at = (d: string): number => new Date(`${d}T09:00:00`).getTime()
const balanceOf = (id: string) =>
  balances(libraryRefs(), useMoneyStore.getState().accounts).get(id)

beforeEach(async () => {
  await flush()
  db.close()
  await Dexie.delete('tala')
  await db.open()
  useNoteStore.setState({ notes: [], inkDocs: {}, hydrated: false })
  usePageStore.setState({ pagesByNote: {}, hydrated: false })
  useIsipStore.setState({ entries: [] })
  markOnDisk([])
  await loadMoney()
  toast.message.mockClear()
})

describe('money settings', () => {
  it('"set balance" keeps later lines counting', async () => {
    addEntries('P150 lunch gcash', at('2026-10-08'))
    setBalance('gcash', 1250)
    expect(balanceOf('gcash')).toBe(1250)
    addEntries('P50 kape gcash', at('2026-10-08'))
    expect(balanceOf('gcash')).toBe(1200)
  })

  it('a new account is a word the parser knows, and it survives a reload', async () => {
    expect(addAccount('BPI Savings')).toBe(true)
    expect(addAccount('bpi')).toBe(false) // word taken
    expect(entryContext().accounts).toContain('bpi')
    expect(parseLine('P500 bpi>cash', '2026-10-08')).toMatchObject({ flow: 'move', account: 'bpi', to: 'cash' })
    addEntries('P120 lunch bpi', at('2026-10-08'))
    const bpi = useMoneyStore.getState().accounts.find((a) => a.tag === 'bpi')!
    expect(balanceOf(bpi.id)).toBe(-120) // the roll-ups read the same words, not the defaults
    await new Promise((r) => setTimeout(r, 20)) // meta write lands
    useMoneyStore.setState({ accounts: [] })
    await loadMoney()
    expect(useMoneyStore.getState().accounts.map((a) => a.name)).toContain('BPI Savings')
  })
})
