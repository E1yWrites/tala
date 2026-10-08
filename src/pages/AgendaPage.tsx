import { useMemo, useState } from 'react'
import { addDays } from '@/entries/dates'
import { agenda, trackers } from '@/entries/agenda'
import type { Occurrence } from '@/entries/agenda'
import { formatLongDay } from '@/entries/parse'
import { AgendaList } from '@/components/Agenda/AgendaList'
import { useEntries } from '@/components/Agenda/useAgenda'
import { EmptyState } from '@/components/UI/EmptyState'
import { SidebarToggle } from '@/components/layout/SidebarToggle'

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
    <section aria-label="Upcoming" className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <SidebarToggle className="-ml-1" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-snug tracking-[-0.02em]">Upcoming</h1>
          <p className="text-xs text-faint">The next {span} days, from every note</p>
        </div>
      </header>

      {items.length === 0 && due.length === 0 ? (
        <EmptyState
          title="Nothing coming up"
          description={'Write a line with a date in any note: "@ fri 2pm dentist", "@ MWF 9-10:30 Calc 1", "[ ] essay due fri".'}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24">
          {days.map(([day, list]) => (
            <div key={day} className="mt-3">
              <h2 className="mb-1.5 px-1 text-xs font-semibold text-muted">{label(day)}</h2>
              <AgendaList items={list} canSkip />
            </div>
          ))}
          {items.length === 0 && <p className="px-1 py-4 text-sm text-muted">Nothing dated in the next {span} days.</p>}
          <button
            type="button"
            onClick={() => setSpan((s) => s + STEP_DAYS)}
            className="mt-3 min-h-10 w-full rounded-control text-sm font-medium text-accent hover:bg-raise"
          >
            Show 2 more weeks
          </button>

          {due.length > 0 && (
            <div className="mt-5">
              <h2 className="mb-1.5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">Due again</h2>
              <AgendaList items={due} />
            </div>
          )}
        </div>
      )}
    </section>
  )
}
