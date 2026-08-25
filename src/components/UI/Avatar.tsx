import { cn } from '@/utils/cn'

interface AvatarProps {
  src: string | null | undefined
  name: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  showEditOverlay?: boolean
}

const SIZE_CLASSES = {
  xs: 'size-6',
  sm: 'size-8',
  md: 'size-10',
  lg: 'size-16',
  xl: 'size-24',
} as const

const TEXT_SIZES = {
  xs: 'text-[10px]',
  sm: 'text-[11px]',
  md: 'text-base',
  lg: 'text-2xl',
  xl: 'text-3xl',
} as const

/**
 * Hand-drawn "mystery scribble" shown when a user has no picture and no name
 * yet. Uses currentColor so it reads correctly in light and dark themes.
 */
function DoodleFace({ className }: { className?: string }): React.ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={cn('size-3/4 -rotate-3', className)}
    >
      <circle cx="12" cy="12" r="9" strokeDasharray="42 5 3 6 40 4" />
      <path d="M8.2 9.9c.55-.75 1.7-.85 2.35-.2" />
      <path d="M13.6 9.7c.6-.7 1.75-.65 2.3.1" />
      <path d="M8.6 14.4c1.05 1.15 2.4 1.5 3.5 1.45 1.1-.05 2.3-.5 3.2-1.55" />
    </svg>
  )
}

export function Avatar({
  src,
  name,
  size = 'md',
  className,
  showEditOverlay = false,
}: AvatarProps): React.ReactNode {
  const initialsStr = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')

  return (
    <div
      className={cn(
        'relative shrink-0 rounded-full border-2 border-line overflow-hidden bg-accent/10 text-accent',
        SIZE_CLASSES[size],
        className,
      )}
    >
      {src ? (
        <img src={src} alt="" aria-hidden="true" className="size-full object-cover" />
      ) : initialsStr ? (
        <span
          className={cn(
            'flex size-full items-center justify-center font-medium',
            TEXT_SIZES[size],
          )}
        >
          {initialsStr}
        </span>
      ) : (
        <span className={cn('flex size-full items-center justify-center', TEXT_SIZES[size])}>
          <DoodleFace />
        </span>
      )}
      {showEditOverlay && (
        <span className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
          <svg
            className="size-1/2 text-white"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="12" r="4" />
          </svg>
        </span>
      )}
    </div>
  )
}