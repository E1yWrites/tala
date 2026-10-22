import { toDate } from '@/entries/dates'
import type { DayKey } from '@/entries/dates'
import type { EntryRef } from '@/entries/scan'
import { useIsipStore } from '@/store/isipStore'
import { addEntries, editEntry } from './isip'

/*
  Agenda actions write lines, because the text is the record: skipping one
  class appends "skip oct 14" to its Entry; finishing a due-again item adds a
  "✓ haircut" Entry.
*/

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
/** A day the parser reads back exactly: "oct 14" (the year when it isn't the line's own). */
function spoken(day: DayKey, at: DayKey): string {
  const d = toDate(day)
  const year = day.slice(0, 4) !== at.slice(0, 4) ? ` ${d.getFullYear()}` : ''
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${year}`
}

/** Leaves one day out of a repeating event. */
export function skipOccurrence(ref: EntryRef, day: DayKey): void {
  const entry = useIsipStore.getState().entries.find((e) => e.id === ref.isip)
  if (entry) editEntry(entry.id, { text: `${entry.text} skip ${spoken(day, ref.at)}` })
}

/** A due-again item done today: a "✓ name" Entry. */
export function markDone(name: string): void {
  addEntries(`✓ ${name}`)
}
