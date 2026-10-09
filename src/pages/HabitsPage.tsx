import { useMemo, useState } from 'react'
import { Check, ChevronRight, Plus } from 'lucide-react'
import { EMPTY_LOG, habitLogs, habitRule, habitStatus, studyHabit } from '@/entries/habits'
import type { DayState, Habit, HabitLog, HabitStatus } from '@/entries/habits'
import { formatTime } from '@/entries/parse'
import { addHabit, habitNameProblem, removeHabit, skipHabit, tickHabit, updateHabit, useHabitStore } from '@/library/habits'
import type { HabitInput } from '@/library/habits'
import { setWeeklyGoal, useStudyStore } from '@/library/study'
import { useEntries } from '@/components/Agenda/useAgenda'
import { QuickCapture } from '@/components/QuickCapture'
import { SidebarToggle } from '@/components/layout/SidebarToggle'
import { cn } from '@/utils/cn'

const label = 'text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint'
const card = 'overflow-hidden rounded-card border border-lineSoft bg-panel'
const field = 'h-9 min-w-0 flex-1 rounded-control border border-lineSoft bg-canvas px-2.5 text-sm text-ink'
const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const STATE_WORDS: Record<DayState, string> = { done: 'done', part: 'started', off: 'day off', none: 'not done', later: 'to come' }

/** Each habit with its week and strength, from the ✓ lines; Study (from writing time) comes first. */
export function HabitsPage(): React.ReactNode {
  const { refs, today } = useEntries()
  const habits = useHabitStore((s) => s.habits)
  const seconds = useStudyStore((s) => s.seconds)
  const goal = useStudyStore((s) => s.goal)
  const logs = useMemo(() => habitLogs(refs), [refs])
  const [study, studyLog] = useMemo(() => studyHabit(seconds, goal, today), [seconds, goal, today])

  return (
    <section aria-label="Habits" className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex items-center gap-2 px-4 pb-2 pt-4">
        <SidebarToggle className="-ml-1" />
        <div className="min-w-0">
          <h1 className="text-xl font-bold leading-snug tracking-[-0.02em]">Habits</h1>
          <p className="text-xs text-faint">From every ✓ line in your notes</p>
        </div>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 pb-24 pt-2">
        <QuickCapture />

        <section aria-labelledby="habits-list">
          <h2 id="habits-list" className={cn(label, 'mb-1.5 px-1')}>
            This week
          </h2>
          <ul className={card}>
            <HabitRow habit={study} log={studyLog} today={today} study />
            {habits.map((h) => (
              <HabitRow key={h.id} habit={h} log={logs.get(h.name.toLowerCase()) ?? EMPTY_LOG} today={today} />
            ))}
            <AddHabit />
          </ul>
          <p className="mt-2 px-1 text-xs text-muted">
            Tick from any page: “✓ water 3”, “✓ gym kahapon”, or a day off, “✓ gym skip”. Strength grows as you keep it; a missed day dents it and
            nothing resets it.
          </p>
        </section>
      </div>
    </section>
  )
}

function HabitRow({ habit, log, today, study = false }: { habit: Habit; log: HabitLog; today: string; study?: boolean }): React.ReactNode {
  const s = useMemo(() => habitStatus(habit, log, today), [habit, log, today])
  const [open, setOpen] = useState(false)
  const rule = study ? `${habitRule(habit)} · 5 minutes of writing makes a day` : habitRule(habit)
  return (
    <li className="border-b border-lineSoft last:border-b-0">
      <div className="flex items-center gap-2 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`${habit.name}: edit`}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight size={14} className={cn('shrink-0 text-faint transition-transform', open && 'rotate-90')} aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[14px] font-medium">{habit.name}</span>
            <span className="block truncate text-xs text-faint">
              {rule}
              {habit.remind && ` · ${formatTime(habit.remind)}`}
            </span>
          </span>
        </button>
        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted" title="Strength: how steadily you keep it">
          {Math.round(s.strength * 100)}%
        </span>
        {!study && <DoneButton habit={habit} status={s} />}
      </div>
      <WeekDots days={s.days} name={habit.name} />
      {open && (study ? <StudyForm onDone={() => setOpen(false)} /> : <EditHabit habit={habit} status={s} onDone={() => setOpen(false)} />)}
    </li>
  )
}

/** ✓ for a yes/no habit; +1 (with the count) for a measurable one. Writes into today's journal page. */
export function DoneButton({ habit, status }: { habit: Habit; status: HabitStatus }): React.ReactNode {
  if (habit.target > 1) {
    return (
      <button
        type="button"
        onClick={() => tickHabit(habit.name)}
        aria-label={`${habit.name}: one more (${status.count} of ${habit.target} today)`}
        className={cn(
          'flex h-9 shrink-0 items-center gap-1 rounded-control border px-2.5 text-xs font-semibold tabular-nums',
          status.done ? 'border-accent bg-accent text-accent-fg' : 'border-lineSoft text-ink hover:border-line',
        )}
      >
        {status.count}/{habit.target}
        <Plus size={13} aria-hidden="true" />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => tickHabit(habit.name)}
      disabled={status.done}
      aria-label={status.done ? `${habit.name}: done today` : `${habit.name}: done today?`}
      aria-pressed={status.done}
      className={cn(
        'grid size-9 shrink-0 place-items-center rounded-full border-[1.5px] transition-colors',
        status.done ? 'border-accent bg-accent text-accent-fg' : 'border-line text-faint hover:border-ink hover:text-ink',
      )}
    >
      <Check size={16} strokeWidth={2.4} aria-hidden="true" />
    </button>
  )
}

function WeekDots({ days, name }: { days: HabitStatus['days']; name: string }): React.ReactNode {
  return (
    <ol aria-label={`${name} this week`} className="flex gap-1.5 px-3.5 pb-3 pl-[38px]">
      {days.map((d, i) => (
        <li key={d.day} className="flex flex-col items-center gap-0.5">
          <span
            aria-label={`${DAY_LETTERS[i]}: ${STATE_WORDS[d.state]}`}
            className={cn(
              'size-3.5 rounded-full border-[1.5px]',
              d.state === 'done' && 'border-accent bg-accent',
              d.state === 'part' && 'border-accent bg-accent/30',
              d.state === 'off' && 'border-dashed border-line',
              d.state === 'none' && 'border-line',
              d.state === 'later' && 'border-lineSoft',
            )}
          />
          <span className="text-[9.5px] text-faint" aria-hidden="true">
            {DAY_LETTERS[i]}
          </span>
        </li>
      ))}
    </ol>
  )
}

function HabitFields({ value, onChange }: { value: HabitInput; onChange: (v: HabitInput) => void }): React.ReactNode {
  return (
    <>
      <label className="flex items-center gap-2 text-xs text-muted">
        <span className="w-20 shrink-0">Name</span>
        <input value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} aria-label="Habit name" placeholder="water, gym, read" className={field} />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted">
        <span className="w-20 shrink-0">How often</span>
        <DaysSelect value={value.days} onChange={(days) => onChange({ ...value, days })} />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted">
        <span className="w-20 shrink-0">A day’s goal</span>
        <input
          inputMode="numeric"
          value={value.target === 1 ? '' : String(value.target)}
          onChange={(e) => onChange({ ...value, target: Number(e.target.value.replace(/\D/g, '')) || 1 })}
          placeholder="1 (just done or not)"
          aria-label="How many make a day done"
          className={field}
        />
      </label>
      <label className="flex items-center gap-2 text-xs text-muted">
        <span className="w-20 shrink-0">Remind me</span>
        <input type="time" value={value.remind ?? ''} onChange={(e) => onChange({ ...value, remind: e.target.value || undefined })} aria-label="Reminder time" className={field} />
      </label>
    </>
  )
}

function DaysSelect({ value, onChange, ariaLabel = 'Days a week' }: { value: number; onChange: (n: number) => void; ariaLabel?: string }): React.ReactNode {
  return (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))} aria-label={ariaLabel} className={field}>
      {[7, 6, 5, 4, 3, 2, 1].map((n) => (
        <option key={n} value={n}>
          {habitRule({ days: n, target: 1 })}
        </option>
      ))}
    </select>
  )
}

function EditHabit({ habit, status, onDone }: { habit: Habit; status: HabitStatus; onDone: () => void }): React.ReactNode {
  const [value, setValue] = useState<HabitInput>(habit)
  const [error, setError] = useState('')
  return (
    <form
      className="space-y-2 px-3.5 pb-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!updateHabit(habit.id, value)) return setError(habitNameProblem(value.name, habit.id) ?? '')
        onDone()
      }}
    >
      <HabitFields value={value} onChange={setValue} />
      <p className="text-xs text-faint">Renaming keeps old ✓ lines under the old name.</p>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => removeHabit(habit.id)} className="text-xs font-medium text-danger hover:underline">
          Remove
        </button>
        {status.due && (
          <button type="button" onClick={() => (skipHabit(habit.name), onDone())} className="text-xs font-medium text-muted hover:text-ink hover:underline">
            Day off today
          </button>
        )}
        <button type="submit" className="ml-auto rounded-control bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg">
          Save
        </button>
      </div>
    </form>
  )
}

function StudyForm({ onDone }: { onDone: () => void }): React.ReactNode {
  const goal = useStudyStore((s) => s.goal)
  return (
    <div className="space-y-2 px-3.5 pb-3">
      <label className="flex items-center gap-2 text-xs text-muted">
        <span className="w-20 shrink-0">How often</span>
        <DaysSelect value={goal} onChange={(n) => (setWeeklyGoal(n), onDone())} ariaLabel="Study days a week" />
      </label>
      <p className="text-xs text-faint">Study ticks itself: Bituin counts the days with 5 minutes of writing. This is the weekly goal in Settings.</p>
    </div>
  )
}

function AddHabit(): React.ReactNode {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<HabitInput>({ name: '', days: 7, target: 1 })
  const [error, setError] = useState('')
  if (!open) {
    return (
      <li>
        <button type="button" onClick={() => setOpen(true)} className="flex min-h-12 w-full items-center gap-2 px-3.5 text-left text-sm text-faint hover:bg-raise hover:text-ink">
          <Plus size={14} aria-hidden="true" />
          Add a habit
        </button>
      </li>
    )
  }
  return (
    <li>
      <form
        className="space-y-2 px-3.5 py-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!addHabit(value)) return setError(habitNameProblem(value.name) ?? '')
          setValue({ name: '', days: 7, target: 1 })
          setError('')
          setOpen(false)
        }}
      >
        <HabitFields value={value} onChange={setValue} />
        {error && <p className="text-xs text-danger">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => setOpen(false)} className="text-xs font-medium text-muted hover:text-ink">
            Cancel
          </button>
          <button type="submit" className="rounded-control bg-accent px-3 py-1.5 text-xs font-semibold text-accent-fg">
            Add habit
          </button>
        </div>
      </form>
    </li>
  )
}
