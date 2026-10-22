import { studyDaysThisWeek, weekDays, STUDY_DAY_SECONDS } from '@/coach/study'
import { useStudyStore } from '@/library/study'
import { BITUIN } from '@/coach/copy'
import { cn } from '@/utils/cn'

/** Fixed sky positions for Monday..Sunday, in a 182×64 viewBox. */
const SKY: ReadonlyArray<readonly [number, number]> = [
  [13, 46], [39, 18], [65, 40], [91, 26], [117, 12], [143, 36], [169, 50],
]
const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S']
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

/** Five-point star path centred on (cx, cy) with outer radius r. */
export function starPath(cx: number, cy: number, r: number): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    pts.push(`${(cx + rad * Math.cos(a)).toFixed(1)} ${(cy + rad * Math.sin(a)).toFixed(1)}`)
  }
  return `M${pts.join('L')}Z`
}

/**
 * The week as a constellation: each Study day lights a gold star (bigger for
 * longer writing), lit days join with lines in order, today waits as a dashed
 * ring. Unlit days are faint points, never red: missing a day costs nothing.
 * `tone` picks the colours for the green rail or a light surface.
 */
export function WeekConstellation({ tone = 'rail', className }: { tone?: 'rail' | 'surface'; className?: string }): React.ReactNode {
  const seconds = useStudyStore((s) => s.seconds)
  const goal = useStudyStore((s) => s.goal)
  const now = Date.now()
  const days = weekDays(seconds, now)
  const done = studyDaysThisWeek(seconds, now)
  const lit = days.map((d, i) => ({ ...d, i })).filter((d) => d.studied)
  const reached = done >= goal

  const onRail = tone === 'rail'
  const faint = onRail ? 'rgb(var(--c-rail-muted))' : 'rgb(var(--c-line))'
  const label =
    `${BITUIN.week.summary(done, goal)} this week. ` +
    (lit.length ? `Studied ${lit.map((d) => DAY_NAMES[d.i]).join(', ')}.` : 'No study days yet.')

  return (
    <section
      aria-label={BITUIN.week.title}
      className={cn('rounded-card px-3 pb-2.5 pt-3', onRail ? 'bg-rail-well' : 'border border-lineSoft bg-panel', className)}
    >
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <p className={cn('font-semibold tabular-nums', onRail ? 'text-rail-fg' : 'text-ink')}>
          {BITUIN.week.summary(done, goal)}
        </p>
        <p className={onRail ? 'text-rail-muted' : 'text-faint'}>{reached ? 'Goal reached' : 'this week'}</p>
      </div>
      <svg viewBox="0 0 182 64" className="mt-1.5 block h-auto w-full" role="img" aria-label={label}>
        {lit.length > 1 && (
          <polyline
            points={lit.map((d) => SKY[d.i]!.join(',')).join(' ')}
            fill="none"
            stroke="rgb(var(--c-gold))"
            strokeOpacity={reached ? 0.95 : 0.6}
            strokeWidth={1}
          />
        )}
        {days.map((d, i) => {
          const [x, y] = SKY[i]!
          if (d.studied) {
            const r = 5 + Math.min(3, (d.seconds - STUDY_DAY_SECONDS) / 900)
            return <path key={d.key} d={starPath(x, y, r)} fill="rgb(var(--c-gold))" />
          }
          if (d.today) {
            return <circle key={d.key} cx={x} cy={y} r={3.6} fill="none" stroke="rgb(var(--c-gold))" strokeWidth={1.2} strokeDasharray="2 2" />
          }
          return <circle key={d.key} cx={x} cy={y} r={2} fill="none" stroke={faint} strokeWidth={1.1} />
        })}
      </svg>
      <ol className="grid grid-cols-7 text-center text-[10px] font-semibold" aria-hidden="true">
        {days.map((d, i) => (
          <li key={d.key} className={d.today ? (onRail ? 'text-rail-fg' : 'text-ink') : onRail ? 'text-rail-muted' : 'text-faint'}>
            {LETTERS[i]}
          </li>
        ))}
      </ol>
    </section>
  )
}
