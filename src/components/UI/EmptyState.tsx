import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { Bituin } from '@/coach/Bituin'

interface EmptyStateProps {
  /** Only used when `mascot` is off. */
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  /** Bituin keeps empty screens company. Turn off for dense or serious contexts. */
  mascot?: boolean
}

/** Friendly empty state: Bituin, a line of explanation and an optional call to action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  mascot = true,
}: EmptyStateProps): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-8 py-16 text-center animate-fade-in">
      {mascot ? (
        <Bituin size={56} blink className="mb-3" />
      ) : (
        Icon && (
          <div className="mb-3 grid size-12 place-items-center rounded-full border border-lineSoft bg-panel text-muted">
            <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
          </div>
        )
      )}
      <p className="text-[17px] font-semibold leading-snug tracking-[-0.01em]">{title}</p>
      {description && (
        <p className="mt-0.5 max-w-[300px] text-sm leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
