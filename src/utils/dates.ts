import { format, formatDistanceToNowStrict } from 'date-fns'

/** "Edited 10 min ago" style label. */
export function formatRelative(timestamp: number): string {
  const diff = Date.now() - timestamp
  if (diff >= 0 && diff < 45_000) return 'Just now'
  return formatDistanceToNowStrict(timestamp, { addSuffix: false })
    .replace(/ minutes?/, ' min')
    .replace(/ hours?/, ' hr')
    .concat(' ago')
}

/** "Aug 22, 2026 · 14:30" — used in tooltips and the editor header. */
export function formatFull(timestamp: number): string {
  return format(timestamp, 'MMM d, yyyy · HH:mm')
}

export function isToday(timestamp: number): boolean {
  return format(timestamp, 'yyyy-MM-dd') === format(Date.now(), 'yyyy-MM-dd')
}

export function timeOfDayGreeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Still thinking?'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
