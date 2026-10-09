import { setEntryContext } from '@/entries/parse'
import { useHabitStore } from './habits'
import { useMoneyStore } from './money'

/** Keeps the parser's default context (account words and names, habit names) in step with the Library. */
function sync(): void {
  const { accounts } = useMoneyStore.getState()
  setEntryContext({
    accounts: accounts.map((a) => a.tag),
    names: Object.fromEntries(accounts.map((a) => [a.tag, a.name])),
    ticks: useHabitStore.getState().habits.map((h) => h.name),
  })
}

useMoneyStore.subscribe(sync)
useHabitStore.subscribe(sync)
sync()
