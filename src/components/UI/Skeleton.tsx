import type { ReactNode } from 'react'
import { cn } from '@/utils/cn'

/** Shimmer placeholder block for loading states. */
export function Skeleton({
  className,
}: {
  className?: string
}): ReactNode {
  return <div aria-hidden="true" className={cn('skeleton', className)} />
}

export function SkeletonText({ lines = 3 }: { lines?: number }): ReactNode {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  )
}
