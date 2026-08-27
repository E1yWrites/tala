import { cn } from '@/utils/cn'

interface TalaMarkProps {
  size?: number
  className?: string
  /** Renders the sun disc filled with the accent wash (icon/app-icon contexts). */
  filled?: boolean
}

/**
 * Tala brand mark — a hand-drawn sun with a tiny sparkle.
 * Strokes use currentColor so it inherits ink/accent from the parent;
 * rays vary in length and angle on purpose (sketchbook imperfection).
 */
export function TalaMark({ size = 32, className, filled = false }: TalaMarkProps): React.ReactNode {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0', className)}
    >
      {/* Sun disc — slightly wobbly circle, stroke overshoots like pen on paper */}
      <path
        d="M31.2 13.1C42.2 11.9 50.3 19.6 50.4 30.2C50.5 40.3 42.7 48.3 32.1 48.4C21.6 48.5 13.5 40.5 13.4 30.3C13.3 20.6 20.8 14.2 31.2 13.1Z"
        fill={filled ? 'rgb(var(--c-accent) / 0.35)' : 'none'}
        stroke="currentColor"
        strokeWidth="4.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Rays — uneven lengths, hand-placed */}
      <g stroke="currentColor" strokeWidth="4.4" strokeLinecap="round">
        <path d="M31.4 8.4L30.9 3.4" />
        <path d="M44.6 13.9L47.9 10.1" />
        <path d="M52.6 29.8L57.6 29.4" />
        <path d="M45.9 44.3L49.3 48" />
        <path d="M31.8 53.2L31.5 58.2" />
        <path d="M17.6 44.6L14.2 48.3" />
        <path d="M10.4 30L5.4 29.6" />
        <path d="M17.9 15.2L14.6 11.3" />
      </g>
      {/* Sparkle — four-point star, upper right */}
      <path
        d="M56.2 39.4C56.8 42.2 57.7 43.1 60.6 43.7C57.7 44.3 56.8 45.2 56.2 48C55.6 45.2 54.7 44.3 51.8 43.7C54.7 43.1 55.6 42.2 56.2 39.4Z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="3"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Full lockup — mark above the handwritten wordmark. Used by splash/onboarding. */
export function TalaLockup({
  size = 96,
  className,
}: {
  size?: number
  className?: string
}): React.ReactNode {
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <TalaMark size={size} className="-rotate-3 text-accent" />
      <p className="font-display text-4xl leading-none">
        tala<span className="text-accent">.</span>
      </p>
    </div>
  )
}
