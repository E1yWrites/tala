import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { toggleTask } from '@/library/tasks'
import { askNotifications, notificationState } from '@/library/reminders'
import { agenda } from '@/entries/agenda'
import { formatDay } from '@/entries/parse'
import { safeToSpend } from '@/entries/money'
import { EMPTY_LOG, habitLogs, habitRule, habitStatus } from '@/entries/habits'
import { useMoneyStore } from '@/library/money'
import { useHabitStore } from '@/library/habits'
import { AgendaList } from '@/components/Agenda/AgendaList'
import { useEntries } from '@/components/Agenda/useAgenda'
import { CARD, PlannerSection, PlannerView } from '@/components/Planner/PlannerView'
import { StartList } from '@/components/NoteEditor/EditorPlaceholder'
import { QuickCapture } from '@/components/QuickCapture'
import { displayTitle } from '@/utils/noteFilters'
import { catalogNumbers, formatCatalog } from '@/utils/catalog'
import { pagesText, textPreview } from '@/utils/doc'
import { formatRelative, timeOfDayGreeting } from '@/utils/dates'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useTick } from '@/hooks/useTick'
import { Bituin } from '@/coach/Bituin'
import { BituinNudge } from '@/coach/BituinNudge'
import { BITUIN } from '@/coach/copy'
import { SafeCard } from './MoneyPage'
import { DoneButton } from './HabitsPage'

/**
 * Today (the Home view, the hub of the planner): a line for today's journal,
 * what the pages put on today, then the habits still to do, today's money and
 * the tasks with no date. With the whole pane, those sit in a side column
 * beside today's lines, with the notes to pick up again.
 */
export function HomePage(): React.ReactNode {
  useTick(60_000) // keep greeting + relative times fresh
  const hasNotes = useNoteStore((s) => s.notes.some((n) => !n.isDeleted && !n.isArchived))
  const hydrated = useNoteStore((s) => s.hydrated)
  const openModal = useUIStore((s) => s.openModal)
  const firstName = useSettingsStore((s) => s.settings.profile.name.split(/\s+/)[0] ?? '')

  return (
    <PlannerView
      label="Today"
      large
      title={`${timeOfDayGreeting()}${firstName ? `, ${firstName}` : ''}`}
      note={BITUIN.home.line}
      lead={<Bituin size={44} motion="wave" blink />}
      trailing={
        <button
          type="button"
          onClick={() => openModal({ kind: 'search' })}
          aria-label="Search notes"
          className="grid size-10 shrink-0 place-items-center rounded-control border border-lineSoft bg-panel text-muted transition-colors hover:border-line hover:text-ink [@media(pointer:coarse)]:size-11"
        >
          <Search size={17} />
        </button>
      }
      aside={
        <>
          <TodayHabits />
          <TodayMoney />
          {hasNotes && <OpenTasks />}
          {hasNotes ? <RecentNotes /> : hydrated && <StartList heading={false} />}
        </>
      }
    >
      <QuickCapture />
      <BituinNudge placement="card" className="" />
      <TodayAgenda />
    </PlannerView>
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
    <PlannerSection id="home-today" title={`Today · ${formatDay(today)}`} action={{ label: 'Upcoming', onClick: () => setView({ kind: 'agenda' }) }}>
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
    </PlannerSection>
  )
}

/** The habits still to do today, each with its Done button; opens Habits. */
function TodayHabits(): React.ReactNode {
  const { refs, today } = useEntries()
  const habits = useHabitStore((s) => s.habits)
  const setView = useUIStore((s) => s.setView)
  const due = useMemo(() => {
    const logs = habitLogs(refs)
    return habits.map((h) => ({ h, s: habitStatus(h, logs.get(h.name.toLowerCase()) ?? EMPTY_LOG, today) })).filter((x) => x.s.due)
  }, [refs, habits, today])
  if (habits.length === 0) return null
  return (
    <PlannerSection id="home-habits" title="Habits" action={{ label: 'All habits', onClick: () => setView({ kind: 'habits' }) }}>
      {due.length > 0 ? (
        <ul className={CARD}>
          {due.map(({ h, s }) => (
            <li key={h.id} className="flex min-h-14 items-center gap-3 border-b border-lineSoft px-3.5 py-2 last:border-b-0">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-medium">{h.name}</span>
                <span className="block truncate text-xs tabular-nums text-faint">
                  {h.days < 7 ? `${s.week} of ${h.days} this week` : habitRule(h)}
                </span>
              </span>
              <DoneButton habit={h} status={s} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-card border border-dashed border-lineSoft px-4 py-3 text-sm text-muted">All done for today.</p>
      )}
    </PlannerSection>
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
    <PlannerSection id="home-money" title="Money" action={{ label: 'Accounts', onClick: () => setView({ kind: 'money' }) }}>
      <SafeCard safe={safe} keep={keep} compact />
    </PlannerSection>
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
    <PlannerSection id="home-tasks" title="Still to do" action={{ label: 'All tasks', onClick: () => setView({ kind: 'tasks' }) }}>
      <ul className={CARD}>
        {open.slice(0, 5).map((t) => (
          <li key={`${t.pageId}:${t.path.join('.')}`} className="flex items-start gap-3 border-b border-lineSoft px-3.5 py-2.5 last:border-b-0">
            <button
              type="button"
              role="checkbox"
              aria-checked={false}
              onClick={() => void toggleTask({ ...t, checked: false })}
              aria-label={`Tick “${t.text}”`}
              className="mt-0.5 size-[18px] shrink-0 rounded-[5px] border-[1.5px] border-line transition-[border-color,transform] duration-150 hover:border-ink active:scale-[0.9]"
            />
            <button type="button" onClick={() => selectNote(t.noteId, t.pageId)} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[14px]">{t.text || 'Untitled task'}</span>
              {!byId.get(t.noteId)?.journal && <span className="block truncate text-xs text-faint">{displayTitle(byId.get(t.noteId)!)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </PlannerSection>
  )
}

/** With the whole pane, the notes to pick up again (the editor pane shows these when Today sits beside it). */
function RecentNotes(): React.ReactNode {
  const notes = useNoteStore((s) => s.notes)
  const pagesByNote = usePageStore((s) => s.pagesByNote)
  const selectNote = useUIStore((s) => s.selectNote)
  const setView = useUIStore((s) => s.setView)
  const catalog = catalogNumbers(notes)
  const recent = useMemo(
    () =>
      notes
        .filter((n) => !n.isDeleted && !n.isArchived && !n.journal)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 4),
    [notes],
  )
  if (recent.length === 0) return null
  return (
    <PlannerSection id="home-recent" title="Pick up again" className="planner-wide" action={{ label: 'All notes', onClick: () => setView({ kind: 'all' }) }}>
      <ul className={CARD}>
        {recent.map((note) => (
          <li key={note.id} className="border-b border-lineSoft last:border-b-0">
            <button
              type="button"
              onClick={() => selectNote(note.id)}
              className="flex w-full items-baseline gap-3 px-3.5 py-2.5 text-left transition-colors hover:bg-raise/60"
            >
              <span className="w-11 shrink-0 text-[11.5px] font-medium tabular-nums text-faint">{formatCatalog(catalog.get(note.id) ?? 0)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold">{displayTitle(note)}</span>
                <span className="block truncate text-xs text-muted">{textPreview(pagesText(pagesByNote[note.id] ?? []), 80) || 'No text yet'}</span>
              </span>
              <time className="shrink-0 text-xs tabular-nums text-faint">{formatRelative(note.updatedAt)}</time>
            </button>
          </li>
        ))}
      </ul>
    </PlannerSection>
  )
}
