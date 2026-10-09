import { create } from 'zustand'
import { entryLabel } from '@/entries/parse'
import type { Entry } from '@/entries/parse'
import { scanEntries } from '@/entries/scan'
import type { EntryRef } from '@/entries/scan'
import { liftNote } from '@/entries/workouts'
import type { Lift } from '@/entries/workouts'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { notify } from './reminders'

/*
  Workouts beside the page: the "last time" hint on a lift line, and the rest
  timer. On the web the timer alerts while Tala is open (a background tab may
  run it late); the iOS app will hand it to a local notification.
*/

let memo: { notes: unknown; pages: unknown; ink: unknown; refs: EntryRef[] } | null = null

/** Every entry in the Library, re-read only when a note, page or ink doc changed. */
function libraryRefs(): EntryRef[] {
  const { notes, inkDocs } = useNoteStore.getState()
  const pages = usePageStore.getState().pagesByNote
  if (memo?.notes !== notes || memo.pages !== pages || memo.ink !== inkDocs) {
    memo = { notes, pages, ink: inkDocs, refs: scanEntries(notes, pages, inkDocs) }
  }
  return memo.refs
}

/** "PR", or what you lifted last time, for the chip beside a lift line. */
export const liftHint = (l: Lift): string => liftNote(libraryRefs(), l)

/** What a line's chip says: its label, and for a lift line "PR" or last time. */
export function chipLabel(entry: Entry): string {
  return [entryLabel(entry), entry.kind === 'lift' ? liftHint(entry) : ''].filter(Boolean).join(' · ')
}

export const useRestStore = create<{ endsAt: number | null; seconds: number }>(() => ({ endsAt: null, seconds: 0 }))

let timer: ReturnType<typeof setTimeout> | undefined

export const formatRest = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`

/** Starts (or restarts) the rest timer. */
export function startRest(seconds: number, now = Date.now()): void {
  clearTimeout(timer)
  useRestStore.setState({ endsAt: now + seconds * 1000, seconds })
  timer = setTimeout(() => {
    useRestStore.setState({ endsAt: null })
    notify('Rest is over', `${formatRest(seconds)} up. Next set.`, 'tala-rest')
  }, seconds * 1000)
}

export function stopRest(): void {
  clearTimeout(timer)
  useRestStore.setState({ endsAt: null })
}
