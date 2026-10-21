import { create } from 'zustand'
import { entryLabel } from '@/entries/parse'
import type { Entry } from '@/entries/parse'
import { liftNote } from '@/entries/workouts'
import type { Lift } from '@/entries/workouts'
import { libraryRefs } from './isip'
import { notify } from './reminders'

/*
  Workouts beside Isip: the "last time" hint on a lift, and the rest
  timer. On the web the timer alerts while Tala is open (a background tab may
  run it late); the iOS app will hand it to a local notification.
*/

/** "PR", or what you lifted last time, for the chip beside a lift line. */
export const liftHint = (l: Lift): string => liftNote(libraryRefs(), l)

/** What a Reading's chip says: its label, and for a lift "PR" or last time. */
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
