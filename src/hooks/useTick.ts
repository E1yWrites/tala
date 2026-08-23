import { useEffect, useState } from 'react'

/**
 * Re-renders the calling component on a fixed interval so time-relative
 * output ("2 minutes ago", greeting headers) stays fresh without waiting
 * for an unrelated state change.
 */
export function useTick(intervalMs = 60_000): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return tick
}
