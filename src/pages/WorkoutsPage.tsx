import { useMemo, useState } from 'react'
import { Download, Timer } from 'lucide-react'
import { e1rm, exercises, strongCsv } from '@/entries/workouts'
import type { Exercise } from '@/entries/workouts'
import { entryLabel, formatDay } from '@/entries/parse'
import { askNotifications, notificationState } from '@/library/reminders'
import { formatRest, startRest, stopRest, useRestStore } from '@/library/workouts'
import { useEntries } from '@/components/Agenda/useAgenda'
import { QuickCapture } from '@/components/QuickCapture'
import { SidebarToggle } from '@/components/layout/SidebarToggle'
import { useTick } from '@/hooks/useTick'
import { useUIStore } from '@/store/uiStore'
import { downloadBlob } from '@/utils/markdown'
import { cn } from '@/utils/cn'

const label = 'text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint'
const card = 'overflow-hidden rounded-card border border-lineSoft bg-panel'
const REST_CHOICES = [90, 120, 180]

/** Every exercise from the lift lines on journal pages: last time, best, a rest timer, and a Strong export. */
export function WorkoutsPage(): React.ReactNode {
  const { refs, today } = useEntries()
  const list = useMemo(() => exercises(refs), [refs])

  return (
    <section aria-label="Workouts" className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <SidebarToggle className="-ml-1" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-snug tracking-[-0.02em]">Workouts</h1>
          <p className="text-xs text-faint">From the lift lines on your journal pages</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-24 pt-2">
        <QuickCapture />
        <RestTimer />

        <section aria-labelledby="workouts-list">
          <div className="mb-1.5 flex items-baseline justify-between px-1">
            <h2 id="workouts-list" className={label}>
              Exercises
            </h2>
            {list.length > 0 && (
              <button
                type="button"
                onClick={() => downloadBlob(`tala-workouts-${today}.csv`, new Blob([strongCsv(refs)], { type: 'text/csv' }))}
                className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                <Download size={13} aria-hidden="true" />
                Export for Strong (CSV)
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="rounded-card border border-dashed border-lineSoft px-4 py-3 text-sm text-muted">
              No lifts yet. On today’s page, or in the field above, write “bench 60x5x3 @8”: weight × reps × sets, and RPE if you like.
            </p>
          ) : (
            <ul className={card}>
              {list.map((e) => (
                <ExerciseRow key={e.name.toLowerCase()} e={e} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
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
    <div className={card}>
      <div className="flex min-h-14 items-center gap-2 px-3.5 py-2">
        <Timer size={16} className="shrink-0 text-faint" aria-hidden="true" />
        {endsAt ? (
          <>
            <span role="timer" aria-label="Rest left" className="text-[22px] font-bold tabular-nums">
              {formatRest(left)}
            </span>
            <span className="text-xs text-faint">of {formatRest(seconds)}</span>
            <button type="button" onClick={stopRest} className="ml-auto rounded-control border border-lineSoft px-3 py-1.5 text-xs font-medium hover:border-line">
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
                  className={cn('rounded-control border border-lineSoft px-3 py-1.5 text-xs font-semibold tabular-nums hover:border-line')}
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
