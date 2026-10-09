import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useNoteStore } from '@/store/noteStore'
import { toggleTask } from '@/library/tasks'
import { askNotifications, notificationState } from '@/library/reminders'
import { agenda } from '@/entries/agenda'
import { formatDay } from '@/entries/parse'
import { AgendaList } from '@/components/Agenda/AgendaList'
import { useEntries } from '@/components/Agenda/useAgenda'
import { displayTitle } from '@/utils/noteFilters'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { timeOfDayGreeting } from '@/utils/dates'
import { useTick } from '@/hooks/useTick'
import { Bituin } from '@/coach/Bituin'
import { BituinNudge } from '@/coach/BituinNudge'
import { BITUIN } from '@/coach/copy'
import { SidebarToggle } from '@/components/layout/SidebarToggle'
import { QuickCapture } from '@/components/QuickCapture'
import { safeToSpend } from '@/entries/money'
import { useMoneyStore } from '@/library/money'
import { SafeCard } from './MoneyPage'

/**
 * Today (the Home view): a greeting from Bituin, a line for today's journal,
 * any nudge, what the pages put on today, and undated tasks still open. The
 * rail shows the week; the editor pane beside it shows the notes to pick up again.
 */
export function HomePage(): React.ReactNode {
  useTick(60_000) // keep greeting + relative times fresh
  const hasNotes = useNoteStore((s) => s.notes.some((n) => !n.isDeleted && !n.isArchived))
  const openModal = useUIStore((s) => s.openModal)
  const firstName = useSettingsStore((s) => s.settings.profile.name.split(/\s+/)[0] ?? '')

  return (
    <section aria-label="Today" className="h-full overflow-y-auto bg-shelf">
      <div className="px-3 pt-4 empty:hidden">
        <SidebarToggle />
      </div>
      <div className="mx-auto flex max-w-[560px] flex-col gap-6 px-5 py-8 animate-slide-up">
        <header className="flex items-center gap-3">
          <Bituin size={48} motion="wave" blink />
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-bold leading-tight tracking-[-0.025em]">
              {timeOfDayGreeting()}
              {firstName ? `, ${firstName}` : ''}
            </h1>
            <p className="text-sm text-muted">{BITUIN.home.line}</p>
          </div>
          <button
            type="button"
            onClick={() => openModal({ kind: 'search' })}
            aria-label="Search notes"
            className="grid size-10 shrink-0 place-items-center rounded-control border border-lineSoft bg-panel text-muted transition-colors hover:border-line hover:text-ink [@media(pointer:coarse)]:size-11"
          >
            <Search size={17} />
          </button>
        </header>

        <QuickCapture />

        <BituinNudge placement="card" className="" />

        <TodayAgenda />

        <TodayMoney />

        {hasNotes && <OpenTasks />}
      </div>
    </section>
  )
}

/** What the pages put on today: classes, appointments, bills, tasks planned or due, due-again items. */
function TodayAgenda(): React.ReactNode {
  const { refs, today } = useEntries()
  const setView = useUIStore((s) => s.setView)
  const items = useMemo(() => agenda(refs, today, 1, today), [refs, today])
  const [alerts, setAlerts] = useState(notificationState)
  const hasReminders = refs.some((r) => (r.entry.kind === 'event' || r.entry.kind === 'task') && r.entry.remind !== undefined)

  return (
    <section aria-labelledby="home-today">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 id="home-today" className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
          Today · {formatDay(today)}
        </h2>
        <button type="button" onClick={() => setView({ kind: 'agenda' })} className="text-xs font-medium text-accent hover:underline">
          Upcoming
        </button>
      </div>
      {items.length > 0 ? (
        <AgendaList items={items} />
      ) : (
        <p className="rounded-card border border-dashed border-lineSoft px-4 py-3 text-sm text-muted">
          Nothing planned. Write “@ 2pm dentist” or “[ ] essay fri” in any note.
        </p>
      )}
      {hasReminders && alerts === 'default' && (
        <button
          type="button"
          onClick={() => void askNotifications().then(setAlerts)}
          className="mt-2 px-1 text-xs font-medium text-accent hover:underline"
        >
          Allow reminder alerts while Tala is open in the background
        </button>
      )}
    </section>
  )
}

/** Safe to spend, once any ₱ line exists: opens Money. */
function TodayMoney(): React.ReactNode {
  const { refs, today } = useEntries()
  const { accounts, keep } = useMoneyStore()
  const setView = useUIStore((s) => s.setView)
  const tracking = refs.some((r) => r.entry.kind === 'money') || accounts.some((a) => a.adjust !== 0)
  const safe = useMemo(() => (tracking ? safeToSpend(refs, accounts, keep, today) : null), [tracking, refs, accounts, keep, today])
  if (!safe) return null
  return (
    <section aria-labelledby="home-money">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 id="home-money" className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
          Money
        </h2>
        <button type="button" onClick={() => setView({ kind: 'money' })} className="text-xs font-medium text-accent hover:underline">
          Accounts
        </button>
      </div>
      <SafeCard safe={safe} keep={keep} compact />
    </section>
  )
}

/** Open tasks with no date (dated ones are on Today or Upcoming): tick them here or jump to the note. */
function OpenTasks(): React.ReactNode {
  const notes = useNoteStore((s) => s.notes)
  const { refs } = useEntries()
  const selectNote = useUIStore((s) => s.selectNote)
  const setView = useUIStore((s) => s.setView)
  const open = useMemo(
    () =>
      refs.filter(
        (r) => r.entry.kind === 'task' && r.task && !r.task.checked && !r.archived && !r.ink && !r.entry.when && !r.entry.due,
      ),
    [refs],
  )
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes])
  if (open.length === 0) return null
  return (
    <section aria-labelledby="home-tasks">
      <div className="mb-2 flex items-baseline justify-between px-1">
        <h2 id="home-tasks" className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
          Still to do
        </h2>
        <button type="button" onClick={() => setView({ kind: 'tasks' })} className="text-xs font-medium text-accent hover:underline">
          All tasks
        </button>
      </div>
      <ul className="overflow-hidden rounded-card border border-lineSoft bg-panel">
        {open.slice(0, 5).map((t) => (
          <li key={`${t.pageId}:${t.path.join('.')}`} className="flex items-start gap-3 border-b border-lineSoft px-3.5 py-2.5 last:border-b-0">
            <button
              type="button"
              onClick={() => void toggleTask({ ...t, checked: false })}
              aria-label={`Tick “${t.text}”`}
              className="mt-0.5 size-[18px] shrink-0 rounded-[5px] border-[1.5px] border-line transition-colors hover:border-ink"
            />
            <button type="button" onClick={() => selectNote(t.noteId, t.pageId)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[14px]">{t.text || 'Untitled task'}</span>
              {!byId.get(t.noteId)?.journal && <span className="block truncate text-xs text-faint">{displayTitle(byId.get(t.noteId)!)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
