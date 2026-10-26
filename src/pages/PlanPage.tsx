import { useMemo } from 'react'
import { CalendarDays, ChevronRight, Dumbbell, ListChecks, Repeat, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { agenda } from '@/entries/agenda'
import { formatDay, formatPeso, formatTime } from '@/entries/parse'
import { useEntries } from '@/components/Agenda/useAgenda'
import { CARD, PRESS, PlannerSection, PlannerView } from '@/components/Planner/PlannerView'
import { ISIP } from '@/isip/copy'
import { useUIStore } from '@/store/uiStore'
import type { ViewKind } from '@/types/models'
import { cn } from '@/utils/cn'
import { useToday } from './HomePage'

/**
 * Plan: the phone's way into Upcoming, Tasks, Money, Habits and Workouts (the
 * rail does this job where it is docked). Each row says where that view stands,
 * read from the same lines the views read.
 */
export function PlanPage(): React.ReactNode {
  const t = useToday()
  const { refs, today } = useEntries()
  const week = useMemo(() => agenda(refs, today, 7, today).filter((o) => o.kind === 'event'), [refs, today])
  const lastLift = useMemo(
    () => refs.filter((r) => r.entry.kind === 'lift').reduce<(typeof refs)[number] | undefined>((a, r) => (!a || r.at >= a.at ? r : a), undefined),
    [refs],
  )
  const P = ISIP.plan

  const next = week[0]
  const upcoming = next
    ? `${next.title} · ${formatDay(next.day)}${next.time ? ` ${formatTime(next.time)}` : ''}${week.length > 1 ? ` · ${P.more(week.length - 1)}` : ''}`
    : ISIP.tiles.tryNext
  const safe = t.safe
  const money = !safe
    ? ISIP.tiles.noMoney
    : safe.perDay <= 0
      ? `${formatPeso(Math.round(safe.spentToday))} ${ISIP.money.spentOnly}`
      : `${formatPeso(Math.round(Math.abs(safe.leftToday)))} ${safe.leftToday < 0 ? ISIP.money.over : ISIP.money.toSpend}`
  const done = t.habits.filter((x) => x.s.done).length
  const lift = lastLift?.entry.kind === 'lift' ? lastLift.entry : undefined

  return (
    <PlannerView label="Plan" title={P.title} note={P.note}>
      <PlannerSection id="plan-coming" title={P.coming}>
        <ul className={CARD}>
          <Row icon={CalendarDays} view="agenda" name="Upcoming" says={upcoming} />
          <Row icon={ListChecks} view="tasks" name="Tasks" says={t.todo.length ? P.toDo(t.todo.length) : ISIP.tiles.nothingToDo} />
        </ul>
      </PlannerSection>
      <PlannerSection id="plan-trackers" title={P.trackers}>
        <ul className={CARD}>
          <Row icon={Wallet} view="money" name="Money" says={money} />
          <Row icon={Repeat} view="habits" name="Habits" says={t.habits.length ? ISIP.tiles.habitsDone(done, t.habits.length) : ISIP.tiles.noHabits} />
          <Row icon={Dumbbell} view="workouts" name="Workouts" says={lift ? P.lastLift(lift.name, formatDay(lastLift!.at)) : P.tryLift} />
        </ul>
      </PlannerSection>
    </PlannerView>
  )
}

/** Two lines, so a long sentence or a large text size never clips: the name, then where it stands. */
function Row({ icon: Icon, view, name, says }: { icon: LucideIcon; view: ViewKind; name: string; says: string }): React.ReactNode {
  const setView = useUIStore((s) => s.setView)
  return (
    <li className="border-b border-lineSoft last:border-b-0">
      <button
        type="button"
        onClick={() => setView({ kind: view })}
        className={cn('flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-raise', PRESS)}
      >
        <Icon size={20} className="shrink-0 text-accent" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold tracking-[-0.005em]">{name}</span>
          <span className="block text-[13px] leading-snug text-muted">{says}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden="true" />
      </button>
    </li>
  )
}
