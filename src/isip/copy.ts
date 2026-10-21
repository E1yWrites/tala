/*
  Every Isip line in one place, so the owner can review the English and the
  Filipino together (as with coach/copy.ts). Describe, never judge; nothing
  about how often you write.
*/

export const ISIP = {
  capture: {
    label: 'Write a line in Isip',
    placeholder: 'Write it down…  P150 lunch · @ 2pm dentist · bench 60x5x3',
    placeholderShort: 'Write it down…  P150 lunch · @ 2pm',
    saved: (n: number): string => (n === 1 ? 'Saved' : `${n} lines saved`),
    palette: (line: string): string => `Write in Isip: “${line}”`,
  },
  day: {
    title: 'Written',
    empty: 'Nothing written this day.',
    emptyToday: 'Lines you write above land here: “P150 lunch gcash”, “@ fri 2pm dentist”, “✓ water”.',
    prev: 'Day before',
    next: 'Day after',
    today: 'Today',
    pick: 'Pick a day',
  },
  entry: {
    edit: (text: string): string => `Edit: ${text}`,
    text: 'Line',
    day: 'Day it counts for',
    save: 'Save',
    cancel: 'Cancel',
    delete: 'Delete',
    deleted: 'Line deleted',
  },
  undo: 'Undo',
} as const
