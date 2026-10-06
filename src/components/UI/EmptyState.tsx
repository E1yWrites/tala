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
        <Bituin size={96} motion="bob" blink className="mb-2" />
      ) : (
        Icon && (
          <div className="mb-4 grid size-14 place-items-center rounded-card bg-selected text-selected-ink">
            <Icon size={24} strokeWidth={2.25} aria-hidden="true" />
          </div>
        )
      )}
      <p className="font-display text-xl leading-snug">{title}</p>
      {description && (
        <p className="mt-0.5 max-w-[280px] text-sm leading-relaxed text-muted">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
