import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon: LucideIcon
  title: string
  description?: string
  action?: ReactNode
}

/** Friendly empty state — a tilted sticky note with an optional call-to-action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps): ReactNode {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-8 py-16 text-center animate-fade-in">
      <div className="relative mb-4 grid size-14 -rotate-2 place-items-center rounded-wobbly-sm border-2 border-line bg-postit text-postit-ink shadow-sketch animate-wiggle">
        <Icon size={24} strokeWidth={2.25} aria-hidden="true" />
      </div>
      <p className="font-display text-xl leading-snug">{title}</p>
      {description && (
        <p className="mt-0.5 max-w-[280px] text-sm leading-relaxed text-muted">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
