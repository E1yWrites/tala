import { useSyncExternalStore } from 'react'
import type { InkStroke } from '@/types/ink'

/* ---------------------------------------------------------------------------
   Tiny cross-component ink session state that must NOT go through React
   props from the editor (which would re-render the editor on every stroke):

     • gesture activity — the floating toolbar fades while the pen is down
     • the stroke clipboard — copy/cut/paste between notes in one session
--------------------------------------------------------------------------- */

let gestureActive = false
const gestureListeners = new Set<() => void>()

export function setInkGestureActive(active: boolean): void {
  if (gestureActive === active) return
  gestureActive = active
  for (const l of gestureListeners) l()
}

export function useInkGestureActive(): boolean {
  return useSyncExternalStore(
    (cb) => {
      gestureListeners.add(cb)
      return () => gestureListeners.delete(cb)
    },
    () => gestureActive,
    () => false,
  )
}

let clipboard: InkStroke[] = []
const clipListeners = new Set<() => void>()

export function setInkClipboard(strokes: InkStroke[]): void {
  clipboard = strokes
  for (const l of clipListeners) l()
}

export function getInkClipboard(): InkStroke[] {
  return clipboard
}

export function useInkClipboardSize(): number {
  return useSyncExternalStore(
    (cb) => {
      clipListeners.add(cb)
      return () => clipListeners.delete(cb)
    },
    () => clipboard.length,
    () => 0,
  )
}
