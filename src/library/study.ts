import { create } from 'zustand'
import { db } from '@/database/db'
import { usePageStore } from '@/store/pageStore'
import { useNoteStore } from '@/store/noteStore'
import {
  DEFAULT_WEEKLY_GOAL,
  MAX_WEEKLY_GOAL,
  SESSION_IDLE_MS,
  creditFor,
  dayKey,
  makeWrapup,
  type Wrapup,
} from '@/coach/study'
import { displayTitle } from '@/utils/noteFilters'
import { listTasks } from './tasks'

/* ---------------------------------------------------------------------------
   Writing time, Study days and Sessions. Seconds of writing per calendar day
   live in the `meta` table (so the weekly goal's history travels in a backup);
   the Session and its wrap-up are in memory only.
--------------------------------------------------------------------------- */

const DAY_PREFIX = 'study:'
const GOAL_KEY = 'coach:weeklyGoal'
const SAVE_EVERY_MS = 10_000

interface StudyState {
  /** Seconds of writing per local day (`YYYY-MM-DD`). */
  seconds: Record<string, number>
  goal: number
  /** Bituin's summary of the last Session, until it is dismissed. */
  wrapup: Wrapup | null
}

export const useStudyStore = create<StudyState>(() => ({ seconds: {}, goal: DEFAULT_WEEKLY_GOAL, wrapup: null }))

const clampGoal = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) ? Math.min(MAX_WEEKLY_GOAL, Math.max(1, Math.round(n))) : DEFAULT_WEEKLY_GOAL

/** Reads the study rows into the store (boot, and after a restore). */
export async function loadStudy(): Promise<void> {
  const rows = await db.meta.toArray()
  const seconds: Record<string, number> = {}
  for (const r of rows) {
    if (r.key.startsWith(DAY_PREFIX) && typeof r.value === 'number' && r.value > 0) seconds[r.key.slice(DAY_PREFIX.length)] = r.value
  }
  const goal = rows.find((r) => r.key === GOAL_KEY)?.value
  useStudyStore.setState({ seconds, goal: clampGoal(goal) })
}

export function setWeeklyGoal(n: number): void {
  const goal = clampGoal(n)
  useStudyStore.setState({ goal })
  void db.meta.put({ key: GOAL_KEY, value: goal }).catch((err) => console.error('[tala] could not save the weekly goal', err))
}

export function dismissWrapup(): void {
  useStudyStore.setState({ wrapup: null })
}

/* -------------------------------- Activity --------------------------------- */

interface Session {
  noteId: string
  activeMs: number
  pagesAtStart: number
  idleTimer: number | null
}

let session: Session | null = null
let lastEventAt: number | null = null
const dirtyDays = new Set<string>()
let saveTimer: number | null = null

async function persistDays(): Promise<void> {
  saveTimer = null
  const { seconds } = useStudyStore.getState()
  const keys = [...dirtyDays]
  dirtyDays.clear()
  try {
    await db.meta.bulkPut(keys.map((k) => ({ key: DAY_PREFIX + k, value: seconds[k] ?? 0 })))
  } catch (err) {
    console.error('[tala] could not save study time', err)
    keys.forEach((k) => dirtyDays.add(k))
  }
}

if (typeof window !== 'undefined') {
  const flushNow = (): void => {
    if (saveTimer !== null) window.clearTimeout(saveTimer)
    if (dirtyDays.size > 0) void persistDays()
  }
  window.addEventListener('pagehide', flushNow)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushNow())
}

/** Call whenever the owner writes: a stroke lands, typed text changes. */
export function noteWriting(now = Date.now()): void {
  const credit = creditFor(lastEventAt, now)
  lastEventAt = now

  const key = dayKey(now)
  useStudyStore.setState((s) => ({ seconds: { ...s.seconds, [key]: (s.seconds[key] ?? 0) + credit / 1000 } }))
  dirtyDays.add(key)
  saveTimer ??= window.setTimeout(() => void persistDays(), SAVE_EVERY_MS)

  if (session) {
    session.activeMs += credit
    if (session.idleTimer !== null) window.clearTimeout(session.idleTimer)
    session.idleTimer = window.setTimeout(() => endSession(), SESSION_IDLE_MS)
  }
}

/* --------------------------------- Sessions -------------------------------- */

/** The editor opened a note. */
export function openSession(noteId: string): void {
  endSession()
  session = { noteId, activeMs: 0, pagesAtStart: usePageStore.getState().pagesByNote[noteId]?.length ?? 0, idleTimer: null }
}

/** The note was closed, or ten idle minutes passed: wrap the Session up for Bituin. */
export function endSession(now = Date.now()): void {
  const s = session
  session = null
  if (!s) return
  if (s.idleTimer !== null) window.clearTimeout(s.idleTimer)
  const note = useNoteStore.getState().notes.find((n) => n.id === s.noteId)
  if (!note || note.isDeleted) return
  const pages = usePageStore.getState().pagesByNote
  const wrapup = makeWrapup({
    noteId: s.noteId,
    title: displayTitle(note),
    activeMs: s.activeMs,
    pagesAtStart: s.pagesAtStart,
    pagesNow: pages[s.noteId]?.length ?? 0,
    tasksLeft: listTasks([note], pages).filter((t) => !t.checked).length,
    now,
  })
  if (wrapup) useStudyStore.setState({ wrapup })
}
