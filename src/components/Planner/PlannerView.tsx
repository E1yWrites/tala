import { useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { ViewKind } from '@/types/models'
import { useUIStore } from '@/store/uiStore'
import { SidebarToggle } from '@/components/layout/SidebarToggle'
import { cn } from '@/utils/cn'

/*
  The planner: Today, Upcoming, Tasks, Money, Habits and Workouts share one
  frame. In the list pane (a note open beside it) or on a phone it is one
  column; given the whole pane (tablet and desktop, no note open) it splits
  into a main column and a side column (index.css, .planner-cols).
*/

const TABS: Array<{ kind: ViewKind; label: string }> = [
  { kind: 'home', label: 'Today' },
  { kind: 'agenda', label: 'Upcoming' },
  { kind: 'tasks', label: 'Tasks' },
  { kind: 'money', label: 'Money' },
  { kind: 'habits', label: 'Habits' },
  { kind: 'workouts', label: 'Workouts' },
]

export const PLANNER_VIEWS: ReadonlySet<ViewKind> = new Set(TABS.map((t) => t.kind))

/** A white list card on the shelf: rows inside divide with seams. */
export const CARD = 'overflow-hidden rounded-card border border-lineSoft bg-panel'

/** Rows and actions inside a card share these. */
export const PRESS = 'transition-transform duration-150 ease-out active:scale-[0.97]'

export function PlannerView({
  label,
  title,
  note,
  lead,
  trailing,
  large = false,
  aside,
  children,
}: {
  /** The section's accessible name ("Money"). */
  label: string
  title: ReactNode
  note?: ReactNode
  /** Before the title (Bituin on Today). */
  lead?: ReactNode
  /** After the title (Today's search button). */
  trailing?: ReactNode
  /** Today's greeting is set a step larger than a pane title. */
  large?: boolean
  /** The side column; stacks under the main one when the pane is narrow. */
  aside?: ReactNode
  children: ReactNode
}): ReactNode {
  return (
    <section aria-label={label} data-split={aside ? '' : undefined} className="planner flex h-full min-h-0 flex-col bg-shelf">
      <header className="px-4 pb-3 pt-4 md:px-6 md:pt-6">
        <div className="planner-frame flex items-center gap-3">
          <SidebarToggle className="-ml-1.5" />
          {lead}
          <div className="min-w-0 flex-1">
            <h1 className={cn('font-bold tracking-[-0.02em]', large ? 'text-[21px] leading-tight md:text-[26px]' : 'text-[21px] leading-snug')}>
              {title}
            </h1>
            {note && <p className="truncate text-[13px] text-muted">{note}</p>}
          </div>
          {trailing}
        </div>
      </header>
      <PlannerTabs />
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-10 pt-2 md:px-6">
        <div className="planner-frame planner-cols">
          <div className="flex min-w-0 flex-col gap-6">{children}</div>
          {aside && <div className="flex min-w-0 flex-col gap-6">{aside}</div>}
        </div>
      </div>
    </section>
  )
}

/** A group of rows under a small-caps label, with an optional link on the right. */
export function PlannerSection({
  id,
  title,
  action,
  className,
  children,
}: {
  id: string
  title: ReactNode
  action?: { label: string; onClick: () => void }
  className?: string
  children: ReactNode
}): ReactNode {
  return (
    <section aria-labelledby={id} className={className}>
      <div className="mb-2 flex min-h-5 items-center justify-between gap-3 px-1">
        <h2 id={id} className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">
          {title}
        </h2>
        {action && (
          <button
            type="button"
            onClick={action.onClick}
            className="-my-2 inline-flex min-h-9 shrink-0 items-center text-xs font-medium text-accent hover:underline [@media(pointer:coarse)]:-my-3 [@media(pointer:coarse)]:-mr-2 [@media(pointer:coarse)]:min-h-11 [@media(pointer:coarse)]:px-2"
          >
            {action.label}
          </button>
        )}
      </div>
      {children}
    </section>
  )
}

/**
 * One tap between the planner's views where the rail is not docked (phones and
 * portrait tablets). Switching is frequent, so it only changes colour.
 */
function PlannerTabs(): ReactNode {
  const active = useUIStore((s) => s.activeView.kind)
  const setView = useUIStore((s) => s.setView)
  const strip = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState<'start' | 'end' | 'both' | undefined>()
  const measure = (): void => {
    const el = strip.current
    if (!el) return
    const start = el.scrollLeft > 1
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    setFade(start && end ? 'both' : start ? 'start' : end ? 'end' : undefined)
  }

  // Keep the current view's tab in sight (Workouts sits past the edge on a phone)
  useLayoutEffect(() => {
    strip.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    measure()
  }, [active])

  return (
    <nav aria-label="Planner" className="px-3 pb-2 md:px-5 lg:hidden">
      <div ref={strip} onScroll={measure} data-fade={fade} className="planner-tabs planner-frame no-scrollbar flex gap-1 overflow-x-auto">
        {TABS.map((t) => {
          const on = active === t.kind
          return (
            <button
              key={t.kind}
              type="button"
              onClick={() => setView({ kind: t.kind })}
              aria-current={on ? 'page' : undefined}
              className={cn(
                'h-9 shrink-0 rounded-full px-3.5 text-[13.5px] font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97] [@media(pointer:coarse)]:h-10',
                on ? 'bg-accent text-accent-fg' : 'text-muted hover:bg-raise hover:text-ink',
              )}
            >
              {t.label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
