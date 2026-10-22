import { useMemo, useState } from 'react'
import { Download, Timer } from 'lucide-react'
import { e1rm, exercises, strongCsv } from '@/entries/workouts'
import type { Exercise } from '@/entries/workouts'
import { entryLabel, formatDay } from '@/entries/parse'
import { ISIP } from '@/isip/copy'
import { usualSplit, weeklyTops } from '@/isip/insights'
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

/** Every exercise from the lifts in Isip: last time, best, a rest timer, and a Strong export. */
export function WorkoutsPage(): React.ReactNode {
  const { refs, today } = useEntries()
  const list = useMemo(() => exercises(refs), [refs])
  const split = useMemo(() => usualSplit(refs), [refs])
  const tops = useMemo(() => weeklyTops(refs), [refs])

  return (
    <PlannerView
      label={ISIP.workouts.title}
      title={ISIP.workouts.title}
      note={ISIP.workouts.note}
      aside={
        (split.length > 0 || tops.length > 0) && (
          <>
            {split.length > 0 && (
              <PlannerSection id="workouts-split" title={ISIP.insight.split.title}>
                <ul className={CARD}>
                  {split.map((s) => (
                    <li key={s.weekday} className="border-b border-lineSoft px-3.5 py-2.5 last:border-b-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-[14px] font-medium">{ISIP.insight.split.day(s.weekday)}</span>
                        <span className="text-xs tabular-nums text-faint">{ISIP.insight.split.count(s.workouts)}</span>
                      </span>
                      <span className="block text-[13px] text-muted">{s.exercises.join(' · ')}</span>
                    </li>
                  ))}
                </ul>
              </PlannerSection>
            )}
            {tops.length > 0 && (
              <PlannerSection id="workouts-weekly" title={ISIP.insight.weekly.title}>
                <ul className={CARD}>
                  {tops.map((t) => (
                    <li key={t.name} className="border-b border-lineSoft px-3.5 py-2.5 last:border-b-0">
                      <span className="block text-[14px] font-medium">{t.name}</span>
                      <span className="block text-[13px] tabular-nums text-muted">
                        {t.weeks.map((w) => w.top).join(' → ')} {t.unit ?? 'kg'}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 px-1 text-xs text-faint">{ISIP.insight.weekly.note}</p>
              </PlannerSection>
            )}
          </>
        )
      }
    >
      <QuickCapture />
      <RestTimer />
      <PlannerSection id="workouts-list" title={ISIP.workouts.exercises}>
        {list.length === 0 ? (
          <p className="rounded-card border border-dashed border-lineSoft px-4 py-3 text-sm text-muted">
            {ISIP.workouts.empty}
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
              {ISIP.workouts.export}
            </button>
          </>
        )}
      </PlannerSection>
    </PlannerView>
  )
}

function ExerciseRow({ e }: { e: Exercise }): React.ReactNode {
  const openEntry = useUIStore((s) => s.openEntry)
  const best = e.best.weight ? `${Math.round(e1rm(e.best) * 10) / 10}${e.best.unit ?? 'kg'}` : ISIP.workouts.reps(e.best.reps)
  return (
    <li className="border-b border-lineSoft last:border-b-0">
      <button
        type="button"
        onClick={() => e.last.isip && openEntry(e.last.isip)}
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
          <span className="block text-[10.5px] text-faint">{e.best.weight ? ISIP.workouts.bestE1rm : ISIP.workouts.best}</span>
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
            <span role="timer" aria-label={ISIP.workouts.restLeft} className="text-[21px] font-bold tabular-nums">
              {formatRest(left)}
            </span>
            <span className="text-xs text-faint">{ISIP.workouts.of(formatRest(seconds))}</span>
            <button type="button" onClick={stopRest} className="ml-auto min-h-9 rounded-control border border-lineSoft px-3 text-xs font-medium transition-[border-color,transform] duration-150 ease-out hover:border-line active:scale-[0.97] [@media(pointer:coarse)]:min-h-11">
              {ISIP.workouts.stop}
            </button>
          </>
        ) : (
          <>
            <span className="text-sm text-muted">{ISIP.workouts.rest}</span>
            <div className="ml-auto flex gap-1.5">
              {REST_CHOICES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => startRest(s)}
                  aria-label={ISIP.workouts.restFor(formatRest(s))}
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
          {ISIP.workouts.allowAlert}
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
