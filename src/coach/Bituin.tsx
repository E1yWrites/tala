import { usePrefsStore } from '@/store/prefsStore'
import { cn } from '@/utils/cn'
import open64 from '@/assets/bituin/bituin-64.png'
import open192 from '@/assets/bituin/bituin-192.png'
import open512 from '@/assets/bituin/bituin-512.png'
import shut64 from '@/assets/bituin/bituin-blink-64.png'
import shut192 from '@/assets/bituin/bituin-blink-192.png'
import shut512 from '@/assets/bituin/bituin-blink-512.png'

export type BituinMotion = 'still' | 'bob' | 'wave' | 'cheer'

/** Smallest source that stays sharp at `size` CSS px (and 2x screens up to 96). */
function sources(size: number): { open: string; shut: string } {
  if (size <= 32) return { open: open64, shut: shut64 }
  if (size <= 96) return { open: open192, shut: shut192 }
  return { open: open512, shut: shut512 }
}

interface BituinProps {
  /** CSS pixels, width and height. */
  size?: number
  motion?: BituinMotion
  /** Occasional blink. Off for tiny uses (toast icons). */
  blink?: boolean
  /** Describe it when it carries meaning on its own; omit when words sit beside it. */
  label?: string
  className?: string
}

/**
 * The star mascot. Quiet mode freezes it (art stays, motion goes); the
 * stylesheet also freezes it in pen mode and under prefers-reduced-motion.
 */
export function Bituin({ size = 96, motion = 'still', blink = false, label, className }: BituinProps): React.ReactNode {
  const quiet = usePrefsStore((s) => s.quietMode)
  const { open, shut } = sources(size)
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }
  return (
    <span
      className={cn('bituin', className)}
      style={{ width: size, height: size }}
      data-motion={quiet ? 'still' : motion}
      data-blink={!quiet && blink ? '' : undefined}
      {...a11y}
    >
      <span className="bituin-body block size-full">
        <img src={open} alt="" width={size} height={size} draggable={false} />
        <img src={shut} alt="" width={size} height={size} draggable={false} className="bituin-eyes-shut" />
      </span>
    </span>
  )
}
