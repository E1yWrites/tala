import { useMemo, useState } from 'react'
import { addDays } from '@/entries/dates'
import { agenda, trackers } from '@/entries/agenda'
import type { Occurrence } from '@/entries/agenda'
import { formatLongDay } from '@/entries/parse'
import { AgendaList } from '@/components/Agenda/AgendaList'
import { useEntries } from '@/components/Agenda/useAgenda'
import { EmptyState } from '@/components/UI/EmptyState'
import { QuickCapture } from '@/components/QuickCapture'
import { PlannerSection, PlannerView } from '@/components/Planner/PlannerView'

const STEP_DAYS = 14

/** The days ahead, as the lines on your pages planned them, then every due-again item. */
export function AgendaPage(): React.ReactNode {
  const { refs, today } = useEntries()
  const [span, setSpan] = useState(STEP_DAYS)
  // Due-again items get their own list below, not a slot on a day
  const items = useMemo(() => agenda(refs, today, span, today).filter((o) => o.kind !== 'again'), [refs, today, span])
  const due = useMemo(() => trackers(refs, today), [refs, today])
  const days = useMemo(() => {
    const byDay = new Map<string, Occurrence[]>()
    for (const o of items) byDay.set(o.day, [...(byDay.get(o.day) ?? []), o])
    return [...byDay]
  }, [items])
  const label = (day: string): string => (day === today ? 'Today' : day === addDays(today, 1) ? 'Tomorrow' : formatLongDay(day))

  return (
    <PlannerView
      label="Upcoming"
      title="Upcoming"
      note={`The next ${span} days, from every note`}
      aside={
        due.length > 0 && (
          <PlannerSection id="upcoming-again" title="Due again">
            <AgendaList items={due} />
          </PlannerSection>
        )
      }
    >
      <QuickCapture />
      {items.length === 0 && due.length === 0 ? (
        <EmptyState
          title="Nothing coming up"
          description={'Write a line with a date in any note: "@ fri 2pm dentist", "@ MWF 9-10:30 Calc 1", "[ ] essay due fri".'}
        />
      ) : (
        <>
          {days.map(([day, list]) => (
            <PlannerSection key={day} id={`upcoming-${day}`} title={label(day)}>
              <AgendaList items={list} canSkip />
            </PlannerSection>
          ))}
          {items.length === 0 && <p className="px-1 text-sm text-muted">Nothing dated in the next {span} days.</p>}
          <button
            type="button"
            onClick={() => setSpan((s) => s + STEP_DAYS)}
            className="min-h-10 w-full rounded-control border border-dashed border-lineSoft text-sm font-medium text-accent transition-colors hover:border-line hover:bg-raise/60"
          >
            Show 2 more weeks
          </button>
        </>
      )}
    </PlannerView>
  )
}
