import { useCallback, useEffect, useRef } from 'react'

interface UseLongPressOptions {
  /** Time in ms before long-press fires. Default: 500 */
  delay?: number
  /** Distance in px that cancels the long-press (scroll/jitter). Default: 10 */
  moveThreshold?: number
  onLongPress: (e: React.MouseEvent | React.TouchEvent) => void
}

interface LongPressHandlers {
  onMouseDown: (e: React.MouseEvent) => void
  onMouseUp: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onTouchStart: (e: React.TouchEvent) => void
  onTouchEnd: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
}

/**
 * Detects a long-press gesture on touch or mouse.
 * Distinguishes from scroll (move threshold) and normal click (timer).
 * Does NOT prevent default on mouse events so right-click context menus
 * still work. Prevents text selection on touch during long-press.
 */
export function useLongPress({
  delay = 500,
  moveThreshold = 10,
  onLongPress,
}: UseLongPressOptions): LongPressHandlers {
  const timerRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)
  const firedRef = useRef(false)

  const clear = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    startRef.current = null
    firedRef.current = false
  }, [])

  const start = useCallback(
    (x: number, y: number, e: React.MouseEvent | React.TouchEvent) => {
      clear()
      startRef.current = { x, y }
      firedRef.current = false
      timerRef.current = window.setTimeout(() => {
        firedRef.current = true
        timerRef.current = null
        onLongPress(e)
      }, delay)
    },
    [clear, delay, onLongPress],
  )

  const move = useCallback(
    (x: number, y: number) => {
      if (!startRef.current || firedRef.current) return
      const dx = x - startRef.current.x
      const dy = y - startRef.current.y
      if (Math.sqrt(dx * dx + dy * dy) > moveThreshold) {
        clear()
      }
    },
    [clear, moveThreshold],
  )

  const end = useCallback(
    (_e: React.MouseEvent | React.TouchEvent) => {
      clear()
    },
    [clear],
  )

  // Cleanup timer on unmount to prevent ghost previews
  useEffect(() => () => clear(), [clear])

  return {
    onMouseDown: (e) => {
      if (e.button !== 0) return // only primary button
      start(e.clientX, e.clientY, e)
    },
    onMouseUp: end,
    onMouseMove: (e) => move(e.clientX, e.clientY),
    onTouchStart: (e) => {
      e.preventDefault() // prevent text selection during long-press
      const t = e.touches[0]
      if (t) start(t.clientX, t.clientY, e)
    },
    onTouchEnd: end,
    onTouchMove: (e) => {
      const t = e.touches[0]
      if (t) move(t.clientX, t.clientY)
    },
  }
}
