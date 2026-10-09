import { useMemo } from 'react'
import { dayKey } from '@/coach/study'
import { scanEntries } from '@/entries/scan'
import type { EntryRef } from '@/entries/scan'
import { useTick } from '@/hooks/useTick'
import { useMoneyStore } from '@/library/money'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'

/** Every entry in the Library and today's date, kept fresh across midnight. */
export function useEntries(): { refs: EntryRef[]; today: string } {
  useTick(60_000)
  const notes = useNoteStore((s) => s.notes)
  const inkDocs = useNoteStore((s) => s.inkDocs)
  const pagesByNote = usePageStore((s) => s.pagesByNote)
  // Account words decide which lines are money, so re-read when they change
  const accounts = useMoneyStore((s) => s.accounts)
  const refs = useMemo(() => scanEntries(notes, pagesByNote, inkDocs), [notes, pagesByNote, inkDocs, accounts])
  return { refs, today: dayKey(Date.now()) }
}
