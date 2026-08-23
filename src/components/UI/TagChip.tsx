import type { ReactNode } from 'react'
import { TAG_COLORS } from '@/data/defaults'
import type { Tag } from '@/types/models'
import { cn } from '@/utils/cn'

interface TagChipProps {
  tag: Tag
  size?: 'xs' | 'sm'
  onClick?: () => void
  onRemove?: () => void
  className?: string
}

/** Small colored tag pill. */
export function TagChip({
  tag,
  size = 'xs',
  onClick,
  onRemove,
  className,
}: TagChipProps): ReactNode {
  const palette = TAG_COLORS[tag.color] ?? TAG_COLORS.iris
  return (
    <span
      className={cn(
        'inline-flex max-w-[140px] items-center gap-1 rounded-wobbly-sm border border-dashed font-medium transition-colors',
        palette.chip,
        size === 'xs' ? 'h-5 px-1.5 text-[11px]' : 'h-6 px-2 text-xs',
        onClick && 'cursor-pointer hover:brightness-95',
        className,
      )}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation()
              onClick()
            }
          : undefined
      }
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.stopPropagation()
                onClick()
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <span className={cn('size-1.5 shrink-0 rounded-full', palette.dot)} aria-hidden="true" />
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove tag ${tag.name}`}
          className="-mr-0.5 ml-0.5 grid size-3.5 place-items-center rounded-sm opacity-60 transition-opacity hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
        >
          ×
        </button>
      )}
    </span>
  )
}
