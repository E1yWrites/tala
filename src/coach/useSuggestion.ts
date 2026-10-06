import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { isEmptyNote } from '@/library/notes'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { usePrefsStore } from '@/store/prefsStore'
import { useTick } from '@/hooks/useTick'
import { canPromptInstall, detectEnv, onInstallAvailabilityChange } from './env'
import { BACKUP_SNOOZE_DAYS, DAY, INSTALL_SNOOZE_DAYS, nextSuggestion, type Suggestion } from './rules'

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

/** What Bituin has to say right now, if anything. One suggestion at a time. */
export function useSuggestion(): Suggestion | null {
  const quietMode = usePrefsStore((s) => s.quietMode)
  const coach = usePrefsStore((s) => s.coach)
  const setCoach = usePrefsStore((s) => s.setCoach)
  const liveNotes = useSyncExternalStore(subscribeNotes, hasRealNotes)
  const canInstall = useSyncExternalStore(onInstallAvailabilityChange, canPromptInstall)
  const env = useMemo(detectEnv, [])
  const tick = useTick(60_000) // snoozes expire without a reload

  // The weekly backup clock starts at first launch
  useEffect(() => {
    if (coach.firstSeenAt === null) setCoach({ firstSeenAt: Date.now() })
  }, [coach.firstSeenAt, setCoach])

  return useMemo(
    () =>
      nextSuggestion({
        now: Date.now(),
        liveNotes: liveNotes ? 1 : 0,
        coach,
        env,
        canPromptInstall: canInstall,
        quietMode,
      }),
    // tick re-evaluates time-based rules
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [liveNotes, coach, env, canInstall, quietMode, tick],
  )
}

/** Snooze helpers shared by every place that shows a suggestion. */
export function snoozeSuggestion(s: Suggestion): void {
  const { coach, setCoach } = usePrefsStore.getState()
  const now = Date.now()
  if (s.id === 'backup') setCoach({ backupSnoozeUntil: now + BACKUP_SNOOZE_DAYS * DAY })
  else setCoach({ installSnoozeUntil: now + INSTALL_SNOOZE_DAYS * DAY, installDismissals: coach.installDismissals + 1 })
}
