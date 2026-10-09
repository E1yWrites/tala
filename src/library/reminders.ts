import { toast } from 'sonner'
import { dayKey } from '@/coach/study'
import { agenda, reminderAt } from '@/entries/agenda'
import type { Occurrence } from '@/entries/agenda'
import { toDate } from '@/entries/dates'
import { EMPTY_LOG, habitLogs, habitStatus } from '@/entries/habits'
import type { Habit, HabitLog } from '@/entries/habits'
import { formatPeso, formatTime } from '@/entries/parse'
import { scanEntries } from '@/entries/scan'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { useHabitStore } from './habits'

/*
  Reminders you set with `!` ("@ thu 2pm dentist !30m"), and a habit's
  reminder time on days it is still to do. On the web they fire
  while Tala is open: a toast, and a system notification when the tab is in
  the background and notifications are allowed. Nothing fires while Tala is
  closed (a web page can't schedule that without a push server); the iOS app
  will hand the same list to local notifications. Bituin never sends any.
*/

/** How far ahead timers are set; re-planned on every edit and every half hour. */
const HORIZON_MS = 36 * 3_600_000
/** Days of agenda read for that: the horizon plus the longest likely `!Nd`. */
const WINDOW_DAYS = 10

interface Due {
  at: number
  title: string
  body: string
}

const timers = new Map<string, ReturnType<typeof setTimeout>>()
const fired = new Set<string>()

export function describe(o: Occurrence): string {
  const parts = [
    o.time ? (o.end ? `${formatTime(o.time)}–${formatTime(o.end)}` : formatTime(o.time)) : o.due ? 'Due today' : 'Today',
    ...(o.amount ? [formatPeso(o.amount)] : []),
  ]
  return parts.join(' · ')
}

/** Reminders due within the horizon, by key. Pure, for tests. */
export function dueReminders(occurrences: Occurrence[], now: number): Map<string, Due> {
  const out = new Map<string, Due>()
  for (const o of occurrences) {
    const at = reminderAt(o)
    if (at === undefined || at <= now || at - now > HORIZON_MS) continue
    out.set(`${o.key}@${at}`, { at, title: o.title || 'Reminder', body: describe(o) })
  }
  return out
}

/** Habits with a reminder time still ahead today and still to do. Pure, for tests. */
export function habitReminders(habits: Habit[], logs: Map<string, HabitLog>, now: number): Map<string, Due> {
  const today = dayKey(now)
  const out = new Map<string, Due>()
  for (const h of habits) {
    if (!h.remind) continue
    const [hh, mm] = h.remind.split(':').map(Number)
    const at = toDate(today).setHours(hh!, mm!, 0, 0)
    const s = habitStatus(h, logs.get(h.name.toLowerCase()) ?? EMPTY_LOG, today)
    if (!s.due || at <= now) continue
    out.set(`habit|${h.id}|${today}@${at}`, { at, title: h.name, body: h.target > 1 ? `${s.count} of ${h.target} today` : 'Still to do today' })
  }
  return out
}

function fire(key: string, due: Due): void {
  timers.delete(key)
  if (fired.has(key)) return
  fired.add(key)
  toast(due.title, { description: due.body, duration: 30_000 })
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted' || document.visibilityState === 'visible') return
  const opts = { body: due.body, tag: key, icon: './app-icon-192.png' }
  // Android Chrome only shows notifications through the service worker
  void navigator.serviceWorker?.getRegistration().then((reg) => {
    if (reg) void reg.showNotification(due.title, opts)
    else new Notification(due.title, opts)
  })
}

/** Sets a timer for every reminder in the next 36 hours and drops the ones whose line changed. */
export function planReminders(now = Date.now()): void {
  const { notes, inkDocs } = useNoteStore.getState()
  const today = dayKey(now)
  const refs = scanEntries(notes, usePageStore.getState().pagesByNote, inkDocs)
  const wanted = new Map([
    ...dueReminders(agenda(refs, today, WINDOW_DAYS, today), now),
    ...habitReminders(useHabitStore.getState().habits, habitLogs(refs), now),
  ])
  for (const [key, t] of timers) {
    if (wanted.has(key)) continue
    clearTimeout(t)
    timers.delete(key)
  }
  for (const [key, due] of wanted) {
    if (!timers.has(key) && !fired.has(key)) timers.set(key, setTimeout(() => fire(key, due), due.at - now))
  }
}

let started = false
/** Keeps reminders planned for the life of the page. */
export function startReminders(): void {
  if (started) return
  started = true
  let debounce: ReturnType<typeof setTimeout> | undefined
  const soon = (): void => {
    clearTimeout(debounce)
    debounce = setTimeout(() => planReminders(), 1500)
  }
  useNoteStore.subscribe((s, prev) => (s.notes !== prev.notes || s.inkDocs !== prev.inkDocs) && soon())
  usePageStore.subscribe((s, prev) => s.pagesByNote !== prev.pagesByNote && soon())
  useHabitStore.subscribe(soon)
  setInterval(() => planReminders(), 30 * 60_000)
  // Background tabs throttle timers: look again when Tala comes back
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && planReminders())
  planReminders()
}

/** Whether system notifications can be asked for here (iOS Safari tabs can't; installed web apps can). */
export const notificationState = (): NotificationPermission | 'unsupported' =>
  typeof Notification === 'undefined' ? 'unsupported' : Notification.permission

export async function askNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.requestPermission()
}
