import { useEffect, useRef, useState } from 'react'

const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])

/**
 * True once the user has stopped writing for `ms` (no pen or finger down, no
 * typing), false the moment they start again. Bituin only speaks in the gaps.
 */
export function useWritingPause(enabled = true, ms = 2000): boolean {
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)

  useEffect(() => {
    if (!enabled) return
    let timer = 0
    let down = false
    const set = (v: boolean): void => {
      if (pausedRef.current === v) return
      pausedRef.current = v
      setPaused(v)
    }
    const rest = (): void => {
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        if (!down) set(true)
      }, ms)
    }
    const writing = (): void => {
      set(false)
      rest()
    }
    const onDown = (): void => {
      down = true
      writing()
    }
    const onMove = (e: PointerEvent): void => {
      if (down || e.buttons > 0) writing()
    }
    const onUp = (): void => {
      down = false
      rest()
    }
    const onKey = (e: KeyboardEvent): void => {
      if (!MODIFIERS.has(e.key)) writing()
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    window.addEventListener('keydown', onKey, true)
    rest()
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [enabled, ms])

  return paused
}
