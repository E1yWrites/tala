import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Check, ChevronRight, Clock, ListTodo, Repeat, Search, Wallet } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useNoteStore } from '@/store/noteStore'
import { toggleTask } from '@/library/tasks'
import { markDone } from '@/library/agenda'
import { askNotifications, notificationState } from '@/library/reminders'
import { agenda } from '@/entries/agenda'
import type { Occurrence } from '@/entries/agenda'
import { formatDay, formatPeso, formatTime } from '@/entries/parse'
import { safeToSpend } from '@/entries/money'
import { EMPTY_LOG, habitLogs, habitStatus } from '@/entries/habits'
import { useMoneyStore } from '@/library/money'
import { useHabitStore } from '@/library/habits'
import { useEntries } from '@/components/Agenda/useAgenda'
import { PlannerView } from '@/components/Planner/PlannerView'
import { QuickCapture } from '@/components/QuickCapture'
import { DayEntries } from '@/components/Isip/DayEntries'
import { ISIP } from '@/isip/copy'
import { displayTitle } from '@/utils/noteFilters'
import { timeOfDayGreeting } from '@/utils/dates'
import { useUIStore } from '@/store/uiStore'
import type { ViewKind } from '@/types/models'
import { useSettingsStore } from '@/store/settingsStore'
import { useTick } from '@/hooks/useTick'
import { dayKey } from '@/coach/study'
import { Bituin } from '@/coach/Bituin'
import { BituinNudge } from '@/coach/BituinNudge'
import { BITUIN } from '@/coach/copy'
import { Runway } from './MoneyPage'
import { DoneButton } from './HabitsPage'
import { cn } from '@/utils/cn'

/**
 * Today (the Home view, the hub of Isip): the day's lines as a thread with
 * Bituin saying what it read, the capture box docked at the foot, and four
 * tiles for the day at a glance (next up, money, habits, to do), each acting
 * in place: a row above the thread while narrow, a column beside it once wide.
 */
export function HomePage(): React.ReactNode {
  useTick(60_000) // keep the greeting, "next up" and "in 20 min" fresh
  // The day the thread shows, and the box below writes for; null follows today past midnight
  const today = dayKey(Date.now())
  const [picked, setPicked] = useState<string | null>(null)
  const day = picked ?? today
  const setDay = useCallback((d: string) => setPicked(d === dayKey(Date.now()) ? null : d), [])
  const openModal = useUIStore((s) => s.openModal)
  const firstName = useSettingsStore((s) => s.settings.profile.name.split(/\s+/)[0] ?? '')
  const t = useToday()
  const left = t.upcoming.length + t.todo.length + t.habits.filter((x) => x.s.due).length

  return (
    <PlannerView
      label="Today"
      large
      asideFirst
      title={`${timeOfDayGreeting()}${firstName ? `, ${firstName}` : ''}`}
      note={left > 0 ? BITUIN.home.left(left) : BITUIN.home.line}
      lead={<Bituin size={44} motion="wave" blink />}
      trailing={
        <button
          type="button"
          onClick={() => openModal({ kind: 'search' })}
          aria-label="Search notes"
          className="hidden size-10 shrink-0 place-items-center rounded-control border border-lineSoft bg-panel text-muted transition-colors hover:border-line hover:text-ink md:grid [@media(pointer:coarse)]:size-11"
        >
          <Search size={17} />
        </button>
      }
      footer={<QuickCapture docked again day={day === today ? undefined : day} />}
      aside={
        <div>
          <div className="today-tiles">
            <NextTile t={t} />
            <MoneyTile t={t} />
            <HabitsTile t={t} />
            <TodoTile t={t} />
          </div>
          <AlertsOffer refs={t.refs} />
        </div>
      }
    >
      <BituinNudge placement="card" className="" />
      <DayEntries day={day} onDay={setDay} />
    </PlannerView>
  )
}

/** "14:05" → minutes since midnight. */
const minutes = (hm: string): number => {
  const [h, m] = hm.split(':').map(Number)
  return h! * 60 + (m ?? 0)
}

/** Everything the tiles read, worked out once per render of Today. */
export function useToday() {
  const { refs, today } = useEntries()
  const habitList = useHabitStore((s) => s.habits)
  const { accounts, keep } = useMoneyStore()
  const now = new Date()
  const clock = now.getHours() * 60 + now.getMinutes()

  const items = useMemo(() => agenda(refs, today, 1, today), [refs, today])
  // Events not over yet (an untimed one lasts the day), soonest first as agenda() orders them
  const upcoming = useMemo(
    () => items.filter((o) => o.kind === 'event' && (!o.time || minutes(o.end ?? o.time) >= clock)),
    [items, clock],
  )
  // Due or planned today first, then the open tasks with no date at all
  const todo = useMemo(() => {
    const dated: Todo[] = items.filter((o) => o.kind !== 'event').map((o) => ({ key: o.key, o }))
    const undated: Todo[] = refs.flatMap((r) =>
      r.task && !r.task.checked && !r.task.archived && r.entry.kind === 'task' && !r.entry.when && !r.entry.due
        ? [{ key: `${r.task.pageId}:${r.task.path.join('.')}`, task: r.task }]
        : [],
    )
    return [...dated, ...undated]
  }, [items, refs])
  const habits = useMemo(() => {
    const logs = habitLogs(refs)
    return habitList
      .map((h) => ({ h, s: habitStatus(h, logs.get(h.name.toLowerCase()) ?? EMPTY_LOG, today) }))
      .filter((x) => x.s.due || x.s.done)
  }, [refs, habitList, today])
  const tracking = refs.some((r) => r.entry.kind === 'money') || accounts.some((a) => a.adjust !== 0)
  const safe = useMemo(() => (tracking ? safeToSpend(refs, accounts, keep, today) : null), [tracking, refs, accounts, keep, today])

  return { refs, clock, upcoming, todo, habits, haveHabits: habitList.length > 0, safe }
}

type Today = ReturnType<typeof useToday>
type TaskRef = NonNullable<Today['refs'][number]['task']>
/** A to-do: an agenda occurrence (a dated task, a due-again item) or an undated task in a note. */
type Todo = { key: string; o?: Occurrence; task?: TaskRef }

/** A tile: a header that opens the view it summarises, what matters, a one-line foot. */
function Tile({
  id,
  icon: Icon,
  title,
  count,
  view,
  foot,
  children,
}: {
  id: string
  icon: LucideIcon
  title: string
  count?: string
  view: ViewKind
  foot?: React.ReactNode
  children: React.ReactNode
}): React.ReactNode {
  const setView = useUIStore((s) => s.setView)
  return (
    <section aria-labelledby={id} className="flex min-w-0 flex-col rounded-surface border border-lineSoft bg-panel px-3.5 pb-3 pt-2.5">
      <button
        type="button"
        onClick={() => setView({ kind: view })}
        className="group -mx-1.5 flex min-h-8 items-center gap-1.5 rounded-control px-1.5 text-left text-[13px] font-semibold text-muted transition-[background-color,color,transform] duration-150 ease-out hover:bg-raise hover:text-ink active:scale-[0.98] [@media(pointer:coarse)]:min-h-11"
      >
        <Icon size={15} className="shrink-0 text-accent" aria-hidden="true" />
        <h2 id={id} className="min-w-0 truncate">
          {title}
          {count && <span className="font-medium tabular-nums text-faint"> · {count}</span>}
        </h2>
        <ChevronRight size={14} className="ml-auto shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
      </button>
      <div className="mt-2 flex min-h-0 flex-1 flex-col">{children}</div>
      {foot && <p className="mt-2 truncate text-xs tabular-nums text-faint">{foot}</p>}
    </section>
  )
}

const BIG = 'text-[26px] font-bold leading-none tracking-[-0.025em] tabular-nums'
const TRY = 'text-[13.5px] font-semibold text-muted'

/** The next thing on today's calendar, how soon, and what follows it. */
function NextTile({ t }: { t: Today }): React.ReactNode {
  const openEntry = useUIStore((s) => s.openEntry)
  const [next, after] = t.upcoming
  const soon = next?.time ? ISIP.tiles.inMinutes(minutes(next.time) - t.clock) : ''
  const then = after ? (after.time ? ISIP.tiles.then(formatTime(after.time), after.title) : ISIP.tiles.more(t.upcoming.length - 1)) : ''
  return (
    <Tile id="home-next" icon={Clock} title={ISIP.tiles.next} view="agenda" foot={next ? [soon, then].filter(Boolean).join(' · ') : ISIP.tiles.tryNext}>
      {next ? (
        <button type="button" onClick={() => next.ref.isip && openEntry(next.ref.isip)} className="-m-1 flex flex-col items-start rounded-control p-1 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-raise active:scale-[0.98]">
          {next.time && <span className={BIG}>{formatTime(next.time)}</span>}
          <span className="mt-2 flex w-full min-w-0 items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold">{next.title || 'Untitled'}</span>
            {next.remind !== undefined && <Bell size={12} className="shrink-0 text-faint" aria-label="reminder set" />}
          </span>
        </button>
      ) : (
        <p className={TRY}>{ISIP.tiles.nothingNext}</p>
      )}
    </Tile>
  )
}

/** Safe to spend today, the days it has to last, and the daily share. */
function MoneyTile({ t }: { t: Today }): React.ReactNode {
  const safe = t.safe
  if (!safe) {
    return (
      <Tile id="home-money" icon={Wallet} title={ISIP.tiles.money} view="money" foot={ISIP.tiles.tryMoney}>
        <p className={TRY}>{ISIP.tiles.noMoney}</p>
      </Tile>
    )
  }
  // Nothing to spread yet (no income, balance or keep): the day's spending is not "over" anything
  const noShare = safe.perDay <= 0
  const over = !noShare && safe.leftToday < 0
  return (
    <Tile id="home-money" icon={Wallet} title={ISIP.tiles.money} view="money" foot={noShare ? undefined : ISIP.money.perDay(formatPeso(Math.round(Math.max(0, safe.perDay))), formatDay(safe.until))}>
      <p className={BIG}>{formatPeso(Math.round(noShare ? safe.spentToday : Math.abs(safe.leftToday)))}</p>
      <p className="mt-1.5 text-[13.5px] font-semibold text-muted">{noShare ? ISIP.money.spentOnly : over ? ISIP.money.over : ISIP.money.toSpend}</p>
      <Runway days={Math.min(safe.days, 7)} over={over} />
    </Tile>
  )
}

/** Today's habits as round checks you tap: done fills green, a counted one steps up "5/8". */
function HabitsTile({ t }: { t: Today }): React.ReactNode {
  const done = t.habits.filter((x) => x.s.done).length
  const shown = t.habits.slice(0, 3)
  const foot = !t.haveHabits ? ISIP.tiles.tryHabits : t.habits.length > shown.length ? ISIP.tiles.moreTasks(t.habits.length - shown.length) : t.habits.length ? ISIP.tiles.habitsDone(done, t.habits.length) : ''
  return (
    <Tile id="home-habits" icon={Repeat} title={ISIP.tiles.habits} count={t.habits.length ? `${done} of ${t.habits.length}` : undefined} view="habits" foot={foot}>
      {t.habits.length > 0 ? (
        <ul className="flex gap-2.5">
          {shown.map(({ h, s }) => (
            <li key={h.id} className="flex w-12 flex-col items-center gap-1">
              <DoneButton habit={h} status={s} ring />
              <span className="w-full truncate text-center text-[11.5px] font-medium text-muted">{h.name}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={TRY}>{t.haveHabits ? ISIP.tiles.habitsDone(0, 0) : ISIP.tiles.noHabits}</p>
      )}
    </Tile>
  )
}

/** The first two things to do today, ticked in place; the rest wait in Tasks. */
function TodoTile({ t }: { t: Today }): React.ReactNode {
  const shown = t.todo.slice(0, 2)
  return (
    <Tile
      id="home-tasks"
      icon={ListTodo}
      title={ISIP.tiles.todo}
      count={t.todo.length ? String(t.todo.length) : undefined}
      view="tasks"
      foot={t.todo.length > shown.length ? ISIP.tiles.moreTasks(t.todo.length - shown.length) : t.todo.length ? undefined : ISIP.tiles.tryTodo}
    >
      {shown.length > 0 ? (
        <ul className="flex flex-col">
          {shown.map((x) => (
            <TodoRow key={x.key} item={x} />
          ))}
        </ul>
      ) : (
        <p className={TRY}>{ISIP.tiles.nothingToDo}</p>
      )}
    </Tile>
  )
}

function TodoRow({ item: { o, task: undated } }: { item: Todo }): React.ReactNode {
  const task = o ? o.ref.task : undated
  const note = useNoteStore((s) => (task ? s.notes.find((n) => n.id === task.noteId) : undefined))
  const selectNote = useUIStore((s) => s.selectNote)
  const openEntry = useUIStore((s) => s.openEntry)
  const title = (o ? o.title : task?.text) || 'Untitled task'
  const meta = o?.overdue !== undefined ? (o.overdue === 0 ? 'due today' : `${o.overdue} day${o.overdue === 1 ? '' : 's'} overdue`) : note ? displayTitle(note) : ''
  const again = o?.kind === 'again'
  const { done, leaving, tick } = useTickThenWrite(task)
  return (
    <li className={cn('flex items-center gap-2.5 border-b border-lineSoft py-1 transition-opacity duration-[180ms] ease-out last:border-b-0', leaving && 'opacity-0')}>
      {task ? (
        <button
          type="button"
          role="checkbox"
          aria-checked={done}
          aria-label={`Mark done: ${title}`}
          onClick={tick}
          className="grid size-9 shrink-0 place-items-center [@media(pointer:coarse)]:size-11"
        >
          <span
            className={cn(
              'grid size-[22px] place-items-center rounded-md border-[1.5px] transition-[background-color,border-color,transform] duration-150 ease-out active:scale-90',
              done ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-panel hover:border-ink',
            )}
          >
            {done && <Check size={14} strokeWidth={2.8} aria-hidden="true" className="tick-draw" />}
          </span>
        </button>
      ) : again ? (
        <button
          type="button"
          onClick={() => markDone(o!.title)}
          aria-label={`Done today: ${title}`}
          className="grid size-9 shrink-0 place-items-center text-muted hover:text-accent [@media(pointer:coarse)]:size-11"
        >
          <span className="grid size-[22px] place-items-center rounded-full border-[1.5px] border-current">
            <Check size={12} strokeWidth={2.6} aria-hidden="true" />
          </span>
        </button>
      ) : (
        <span className="grid size-9 shrink-0 place-items-center" aria-hidden="true">
          <span className="size-2 rounded-full bg-line" />
        </span>
      )}
      <button
        type="button"
        onClick={() => (task ? selectNote(task.noteId, task.pageId) : o?.ref.isip && openEntry(o.ref.isip))}
        className="-mx-1 min-w-0 flex-1 rounded-control px-1 py-0.5 text-left transition-[background-color,transform] duration-150 ease-out hover:bg-raise active:scale-[0.98]"
      >
        <span className="block truncate text-[13.5px] font-semibold leading-snug">{title}</span>
        {meta && <span className={cn('block truncate text-xs text-faint', o?.overdue && 'text-danger')}>{meta}</span>}
      </button>
    </li>
  )
}

/**
 * Ticking from the tile: the box fills and its check draws, the row fades, then
 * the task is written (it leaves the list as soon as it is). A row unmounted
 * mid-way still writes; reduced motion writes at once.
 */
function useTickThenWrite(task: TaskRef | undefined): { done: boolean; leaving: boolean; tick: () => void } {
  const [done, setDone] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const pending = useRef<TaskRef | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const write = (): void => {
    const t = pending.current
    pending.current = null
    if (t) void toggleTask(t)
  }
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      write()
    },
    [],
  )
  const tick = (): void => {
    if (!task || pending.current) return
    pending.current = task
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return write()
    setDone(true)
    timer.current = setTimeout(() => {
      setLeaving(true)
      timer.current = setTimeout(write, 180)
    }, 250)
  }
  return { done, leaving, tick }
}

/** Once a line sets a reminder, offer the browser's alerts (they only fire while Tala is open). */
function AlertsOffer({ refs }: { refs: Today['refs'] }): React.ReactNode {
  const [alerts, setAlerts] = useState(notificationState)
  const hasReminders = refs.some((r) => (r.entry.kind === 'event' || r.entry.kind === 'task') && r.entry.remind !== undefined)
  if (!hasReminders || alerts !== 'default') return null
  return (
    <button type="button" onClick={() => void askNotifications().then(setAlerts)} className="mt-2 px-1 text-xs font-medium text-accent hover:underline">
      Allow reminder alerts while Tala is open in the background
    </button>
  )
}
