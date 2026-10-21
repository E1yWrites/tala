import { useMemo } from 'react'
import { dayKey } from '@/coach/study'
import type { EntryRef } from '@/entries/scan'
import { useTick } from '@/hooks/useTick'
import { useHabitStore } from '@/library/habits'
import { libraryRefs } from '@/library/isip'
import { useMoneyStore } from '@/library/money'
import { useIsipStore } from '@/store/isipStore'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'

/** Every Reading (Isip Entries and the Tasks in Notes) and today's date, kept fresh across midnight. */
export function useEntries(): { refs: EntryRef[]; today: string } {
  useTick(60_000)
  const notes = useNoteStore((s) => s.notes)
  const pagesByNote = usePageStore((s) => s.pagesByNote)
  const entries = useIsipStore((s) => s.entries)
  // Account words and habit names decide what some lines are, so re-read when they change
  const accounts = useMoneyStore((s) => s.accounts)
  const habits = useHabitStore((s) => s.habits)
  const refs = useMemo(() => libraryRefs(), [notes, pagesByNote, entries, accounts, habits])
  return { refs, today: dayKey(Date.now()) }
}
