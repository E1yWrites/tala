import { useMemo, useState } from 'react'
import { Download, Timer } from 'lucide-react'
import { e1rm, exercises, strongCsv } from '@/entries/workouts'
import type { Exercise } from '@/entries/workouts'
import { entryLabel, formatDay } from '@/entries/parse'
import { askNotifications, notificationState } from '@/library/reminders'
import { formatRest, startRest, stopRest, useRestStore } from '@/library/workouts'
import { useEntries } from '@/components/Agenda/useAgenda'
import { QuickCapture } from '@/components/QuickCapture'
import { CARD, PlannerSection, PlannerView } from '@/components/Planner/PlannerView'
import { useTick } from '@/hooks/useTick'
import { useUIStore } from '@/store/uiStore'
import { downloadBlob } from '@/utils/markdown'
import { cn } from '@/utils/cn'

const REST_CHOICES = [90, 120, 180]

/** Every exercise from the lift lines on journal pages: last time, best, a rest timer, and a Strong export. */
export function WorkoutsPage(): React.ReactNode {
  const { refs, today } = useEntries()
  const list = useMemo(() => exercises(refs), [refs])

  return (
    <PlannerView label="Workouts" title="Workouts" note="From the lift lines on your journal pages">
      <QuickCapture />
      <RestTimer />
      <PlannerSection id="workouts-list" title="Exercises">
        {list.length === 0 ? (
          <p className="rounded-card border border-dashed border-lineSoft px-4 py-3 text-sm text-muted">
            No lifts yet. On today’s page, or in the field above, write “bench 60x5x3 @8”: weight × reps × sets, and RPE if you like.
          </p>
        ) : (
          <>
            <ul className={CARD}>
              {list.map((e) => (
                <ExerciseRow key={e.name.toLowerCase()} e={e} />
              ))}
            </ul>
            <button
              type="button"
              onClick={() => downloadBlob(`tala-workouts-${today}.csv`, new Blob([strongCsv(refs)], { type: 'text/csv' }))}
              className="mt-1 flex min-h-9 items-center gap-1.5 px-1 text-xs font-medium text-accent hover:underline [@media(pointer:coarse)]:min-h-11"
            >
              <Download size={13} aria-hidden="true" />
              Export for Strong (CSV)
            </button>
          </>
        )}
      </PlannerSection>
    </PlannerView>
  )
}

function ExerciseRow({ e }: { e: Exercise }): React.ReactNode {
  const selectNote = useUIStore((s) => s.selectNote)
  const best = e.best.weight ? `${Math.round(e1rm(e.best) * 10) / 10}${e.best.unit ?? 'kg'}` : `${e.best.reps} reps`
  return (
    <li className="border-b border-lineSoft last:border-b-0">
      <button
        type="button"
        onClick={() => selectNote(e.last.noteId, e.last.pageId)}
        className="flex min-h-14 w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-raise"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-medium">{e.name}</span>
          <span className="block truncate text-xs text-faint">
            {formatDay(e.lastDay)} · {entryLabel(e.last.entry)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-[14px] font-semibold tabular-nums">{best}</span>
          <span className="block text-[10.5px] text-faint">{e.best.weight ? 'best e1RM' : 'best'}</span>
        </span>
      </button>
    </li>
  )
}

/** Between sets: alerts when the rest is over, also from another tab while Tala is open. */
function RestTimer(): React.ReactNode {
  const { endsAt, seconds } = useRestStore()
  useTick(endsAt ? 1000 : 60_000)
  const [alerts, setAlerts] = useState(notificationState)
  const left = endsAt ? Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)) : 0
  return (
    <div className={cn(CARD, 'relative')}>
      {endsAt && <RestBar key={endsAt} endsAt={endsAt} seconds={seconds} />}
      <div className="flex min-h-14 items-center gap-2 px-3.5 py-2">
        <Timer size={16} className="shrink-0 text-faint" aria-hidden="true" />
        {endsAt ? (
          <>
            <span role="timer" aria-label="Rest left" className="text-[21px] font-bold tabular-nums">
              {formatRest(left)}
            </span>
            <span className="text-xs text-faint">of {formatRest(seconds)}</span>
            <button type="button" onClick={stopRest} className="ml-auto min-h-9 rounded-control border border-lineSoft px-3 text-xs font-medium transition-[border-color,transform] duration-150 ease-out hover:border-line active:scale-[0.97] [@media(pointer:coarse)]:min-h-11">
              Stop
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-muted">Rest</span>
            <div className="ml-auto flex gap-1.5">
              {REST_CHOICES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => startRest(s)}
                  aria-label={`Rest ${formatRest(s)}`}
                  className="min-h-9 rounded-control border border-lineSoft px-3 text-xs font-semibold tabular-nums transition-[border-color,transform] duration-150 ease-out hover:border-line active:scale-[0.97] [@media(pointer:coarse)]:min-h-11"
                >
                  {formatRest(s)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {alerts === 'default' && (
        <button type="button" onClick={() => void askNotifications().then(setAlerts)} className="px-3.5 pb-2.5 text-xs font-medium text-accent hover:underline">
          Allow an alert when the rest is over and Tala is in the background
        </button>
      )}
    </div>
  )
}

/** Drains at a constant rate on the compositor; opened mid-rest, it starts part-drained. */
function RestBar({ endsAt, seconds }: { endsAt: number; seconds: number }): React.ReactNode {
  const [offset] = useState(() => (endsAt - Date.now()) / 1000 - seconds)
  return (
    <span
      aria-hidden="true"
      className="rest-drain absolute inset-x-0 top-0 h-[3px] bg-accent motion-reduce:hidden"
      style={{ animationDuration: `${seconds}s`, animationDelay: `${offset}s` }}
    />
  )
}
