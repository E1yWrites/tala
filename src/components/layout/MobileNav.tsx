import { CalendarCheck, Compass, NotebookText, PenLine, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { PLAN_SUBVIEWS, useUIStore } from '@/store/uiStore'
import { usePrefsStore } from '@/store/prefsStore'
import { cn } from '@/utils/cn'
import { ISIP } from '@/isip/copy'

/** Height of the bar itself; the page above reserves this plus the safe area. */
export const MOBILE_NAV_HEIGHT = '3.75rem'

/**
 * Phone bottom bar on the green rail: Today, Plan (Upcoming, Tasks, Money, Habits
 * and Workouts inside), the gold Write (a line in Isip, the first thing to do),
 * Notes and Search. New note sits in the Notes header; Settings, Quiet mode and
 * backup under the profile picture in each header. Left-handed mode mirrors it.
 */
export function MobileNav(): React.ReactNode {
  const activeView = useUIStore((s) => s.activeView)
  const planOrigin = useUIStore((s) => s.planOrigin)
  const setView = useUIStore((s) => s.setView)
  const openModal = useUIStore((s) => s.openModal)
  const searching = useUIStore((s) => s.modalStack.some((m) => m.intent.kind === 'search'))
  const leftHanded = usePrefsStore((s) => s.leftHanded)

  // A planner view lights the tab it was opened from (a Today tile, or the Plan list)
  const kind = activeView.kind
  const sub = PLAN_SUBVIEWS.has(kind)
  const todayOn = kind === 'home' || (sub && planOrigin === 'home')
  const planOn = kind === 'plan' || (sub && planOrigin === 'plan')
  const notesOn = !todayOn && !planOn && kind !== 'settings'

  // On Today the box is already on screen: Write just puts the cursor in it. Elsewhere it opens the capture sheet.
  const write = (): void => {
    const box = kind === 'home' ? document.querySelector<HTMLInputElement>('.capture-docked') : null
    if (box) box.focus()
    else openModal({ kind: 'capture' })
  }

  return (
    <nav
      aria-label="Primary"
      style={{ height: `calc(${MOBILE_NAV_HEIGHT} + env(safe-area-inset-bottom))` }}
      className={cn(
        'fixed inset-x-0 bottom-0 z-30 flex items-stretch border-t border-rail-line bg-rail pb-[env(safe-area-inset-bottom)] text-rail-fg md:hidden',
        leftHanded && 'flex-row-reverse',
      )}
    >
      <NavTab label="Today" icon={CalendarCheck} active={todayOn && !searching} onClick={() => setView({ kind: 'home' })} />
      <NavTab label="Plan" icon={Compass} active={planOn && !searching} onClick={() => setView({ kind: 'plan' })} />

      <div className="flex flex-1 flex-col items-center">
        <button
          type="button"
          onClick={write}
          aria-label={ISIP.capture.label}
          className="-mt-5 grid size-14 place-items-center rounded-full bg-gold text-gold-fg shadow-raise ring-4 ring-rail transition-transform duration-150 ease-out active:scale-95"
        >
          <PenLine size={24} strokeWidth={2.4} aria-hidden="true" />
        </button>
        <span aria-hidden="true" className="mt-0.5 text-[11px] font-semibold">
          Write
        </span>
      </div>

      <NavTab label="Notes" icon={NotebookText} active={notesOn && !searching} onClick={() => setView({ kind: 'all' })} />
      <NavTab label="Search" icon={Search} active={searching} onClick={() => openModal({ kind: 'search' })} />
    </nav>
  )
}

/** The active tab has a shape (a pill behind the icon) and weight as well as colour. */
function NavTab({ label, icon: Icon, active, onClick }: { label: string; icon: LucideIcon; active: boolean; onClick: () => void }): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 transition-colors',
        active ? 'text-rail-fg' : 'text-rail-muted hover:text-rail-fg',
      )}
    >
      <span className={cn('grid h-[30px] w-[52px] place-items-center rounded-full transition-colors duration-150', active && 'bg-rail-active')}>
        <Icon size={20} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" className={active ? 'text-gold' : undefined} />
      </span>
      <span className={cn('text-[11px] font-medium', active && 'font-semibold')}>{label}</span>
    </button>
  )
}
