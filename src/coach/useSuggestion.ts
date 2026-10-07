import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { isEmptyNote } from '@/library/notes'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { usePrefsStore } from '@/store/prefsStore'
import { useTick } from '@/hooks/useTick'
import { canPromptInstall, detectEnv, onInstallAvailabilityChange } from './env'
import { dismissWrapup, useStudyStore } from '@/library/study'
import { displayTitle } from '@/utils/noteFilters'
import { BACKUP_SNOOZE_DAYS, DAY, INSTALL_SNOOZE_DAYS, RESURFACE_AFTER_DAYS, RESURFACE_SNOOZE_DAYS, nextSuggestion, type CoachState, type Suggestion } from './rules'
import { studyDaysThisWeek, weekKey } from './study'

/** True once at least one note exists for real (not trashed, not an untouched scratch card). */
function hasRealNotes(): boolean {
  const { notes, inkDocs } = useNoteStore.getState()
  const { pagesByNote } = usePageStore.getState()
  return notes.some((n) => !n.isDeleted && !isEmptyNote(n, pagesByNote[n.id] ?? [], inkDocs))
}

function subscribeNotes(cb: () => void): () => void {
  const a = useNoteStore.subscribe(cb)
  const b = usePageStore.subscribe(cb)
  return () => {
    a()
    b()
  }
}

/** The most recently edited live note that has sat untouched for a week, if any. */
function findStaleNote(now: number): CoachState['staleNote'] {
  const { notes, inkDocs } = useNoteStore.getState()
  const { pagesByNote } = usePageStore.getState()
  const cutoff = now - RESURFACE_AFTER_DAYS * DAY
  let best: CoachState['staleNote'] = null
  for (const n of notes) {
    if (n.isDeleted || n.isArchived || n.updatedAt > cutoff) continue
    if (isEmptyNote(n, pagesByNote[n.id] ?? [], inkDocs)) continue
    if (!best || n.updatedAt > best.updatedAt) best = { id: n.id, title: displayTitle(n), updatedAt: n.updatedAt }
  }
  return best
}

/** What Bituin has to say right now, if anything. One suggestion at a time. */
export function useSuggestion(): Suggestion | null {
  const quietMode = usePrefsStore((s) => s.quietMode)
  const coach = usePrefsStore((s) => s.coach)
  const setCoach = usePrefsStore((s) => s.setCoach)
  const liveNotes = useSyncExternalStore(subscribeNotes, hasRealNotes)
  const canInstall = useSyncExternalStore(onInstallAvailabilityChange, canPromptInstall)
  const env = useMemo(detectEnv, [])
  const tick = useTick(60_000) // snoozes expire without a reload
  const wrapup = useStudyStore((s) => s.wrapup)
  const studySeconds = useStudyStore((s) => s.seconds)
  const goal = useStudyStore((s) => s.goal)

  // The weekly backup clock starts at first launch
  useEffect(() => {
    if (coach.firstSeenAt === null) setCoach({ firstSeenAt: Date.now() })
  }, [coach.firstSeenAt, setCoach])

  return useMemo(() => {
      const now = Date.now()
      return nextSuggestion({
        now,
        liveNotes: liveNotes ? 1 : 0,
        coach,
        env,
        canPromptInstall: canInstall,
        quietMode,
        wrapup,
        week: { key: weekKey(now), studyDays: studyDaysThisWeek(studySeconds, now), goal },
        staleNote: liveNotes ? findStaleNote(now) : null,
      })
    },
    // tick re-evaluates time-based rules
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveNotes, coach, env, canInstall, quietMode, wrapup, studySeconds, goal, tick],
  )
}

/** Snooze helpers shared by every place that shows a suggestion. */
export function snoozeSuggestion(s: Suggestion): void {
  const { coach, setCoach } = usePrefsStore.getState()
  const now = Date.now()
  if (s.id === 'wrapup') dismissWrapup()
  else if (s.id === 'goal') setCoach({ goalCheeredWeek: s.week })
  else if (s.id === 'resurface') setCoach({ resurfaceSnoozeUntil: now + RESURFACE_SNOOZE_DAYS * DAY })
  else if (s.id === 'backup') setCoach({ backupSnoozeUntil: now + BACKUP_SNOOZE_DAYS * DAY })
  else setCoach({ installSnoozeUntil: now + INSTALL_SNOOZE_DAYS * DAY, installDismissals: coach.installDismissals + 1 })
}
