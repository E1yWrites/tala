import { X } from 'lucide-react'
import { downloadBackup } from '@/utils/exportImport'
import { useUIStore } from '@/store/uiStore'
import { usePrefsStore } from '@/store/prefsStore'
import { cn } from '@/utils/cn'
import { Bituin } from './Bituin'
import { BITUIN } from './copy'
import { promptInstall } from './env'
import type { Suggestion } from './rules'
import { snoozeSuggestion, useSuggestion } from './useSuggestion'
import { useWritingPause } from './useWritingPause'

function wording(s: Suggestion): { title: string; body: string; action: string; later: string } {
  if (s.id === 'wrapup') {
    const c = BITUIN.nudge.wrapup
    return {
      title: c.title,
      body: c.body(s.minutes, s.pagesAdded, s.tasksLeft),
      action: s.tasksLeft > 0 ? c.actionTasks : c.actionDone,
      later: c.later,
    }
  }
  if (s.id === 'goal') {
    const c = BITUIN.nudge.goal
    return { title: c.title, body: c.body(s.days), action: c.action, later: c.later }
  }
  if (s.id === 'resurface') {
    const c = BITUIN.nudge.resurface
    return { title: c.title, body: c.body(s.title, s.days), action: c.action, later: c.later }
  }
  if (s.id === 'backup') {
    const c = BITUIN.nudge.backup
    return { title: c.title, body: c.body(s.daysSince), action: c.action, later: c.later }
  }
  const c = s.variant === 'ios' ? BITUIN.nudge.installIos : BITUIN.nudge.installAndroid
  return { ...c }
}

function run(s: Suggestion): void {
  if (s.id === 'wrapup') {
    // the task list is where unticked items live; with nothing left, "Thanks!" just closes the card
    if (s.tasksLeft > 0) useUIStore.getState().setView({ kind: 'tasks' })
    snoozeSuggestion(s)
  } else if (s.id === 'goal') snoozeSuggestion(s)
  else if (s.id === 'resurface') {
    const ui = useUIStore.getState()
    ui.setView({ kind: 'all' })
    ui.selectNote(s.noteId)
    snoozeSuggestion(s)
  } else if (s.id === 'backup') void downloadBackup()
  else if (s.variant === 'android') void promptInstall()
  else useUIStore.getState().openModal({ kind: 'install-guide' })
}

/**
 * Bituin's one-at-a-time suggestion (backup reminder, install guide).
 * `card` sits inline at the top of a list or the home screen. `corner` is the
 * small chip for the full-screen editor: it appears only after the pen has
 * rested for a couple of seconds, never takes focus, and steps aside the
 * moment writing resumes.
 */
export function BituinNudge({
  placement,
  className,
}: {
  placement: 'card' | 'corner'
  /** Card margins; defaults suit a list pane. */
  className?: string
}): React.ReactNode {
  const suggestion = useSuggestion()
  const resting = useWritingPause(placement === 'corner')
  const leftHanded = usePrefsStore((s) => s.leftHanded)
  if (!suggestion) return null
  const w = wording(suggestion)

  if (placement === 'card') {
    return (
      <div
        className={cn(
          'flex items-start gap-3 rounded-card border border-gold/40 bg-gold-soft p-3 text-gold-ink animate-fade-in',
          className ?? 'mx-4 mb-2',
        )}
      >
        <Bituin size={44} motion="bob" blink />
        <div className="min-w-0 flex-1">
          <p className="font-hand text-[18px] leading-tight">{w.title}</p>
          <p className="mt-0.5 text-[13px] leading-snug">{w.body}</p>
          <div className="mt-2 flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => run(suggestion)}
              className="btn-primary h-9 rounded-control px-3 text-[13px] font-medium"
            >
              {w.action}
            </button>
            <button
              type="button"
              onClick={() => snoozeSuggestion(suggestion)}
              className="h-9 rounded-control px-2.5 text-[13px] font-medium hover:bg-gold/25"
            >
              {w.later}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!resting) return null
  return (
    <div
      role="status"
      className={cn(
        'pointer-events-none fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] z-30',
        leftHanded ? 'left-4' : 'right-4',
      )}
    >
      <div className="pointer-events-auto flex max-w-[300px] items-center gap-2 rounded-surface border border-gold/50 bg-gold-soft py-2 pl-2 pr-1 text-gold-ink shadow-raise animate-slide-up">
        <Bituin size={36} />
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-tight">{w.title}</p>
          <button
            type="button"
            onClick={() => run(suggestion)}
            className="mt-0.5 text-[13px] font-medium underline underline-offset-2"
          >
            {w.action}
          </button>
        </div>
        <button
          type="button"
          onClick={() => snoozeSuggestion(suggestion)}
          aria-label={w.later}
          className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-gold/25"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
