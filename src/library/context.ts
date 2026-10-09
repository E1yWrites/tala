import { setEntryContext } from '@/entries/parse'
import { useMoneyStore } from './money'

/** Keeps the parser's default context (account words and names) in step with the Library. */
function sync(): void {
  const { accounts } = useMoneyStore.getState()
  setEntryContext({
    accounts: accounts.map((a) => a.tag),
    names: Object.fromEntries(accounts.map((a) => [a.tag, a.name])),
    ticks: [],
  })
}

useMoneyStore.subscribe(sync)
sync()
