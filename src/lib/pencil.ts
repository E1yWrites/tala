import { useSyncExternalStore } from 'react'

/* ---------------------------------------------------------------------------
   Apple Pencil (and other styluses) — what the platform actually exposes.

   The web gives us pressure, tilt and (on iPadOS 16.1+ with a hover-capable
   Pencil) hover through Pointer Events. It does NOT surface Apple Pencil's
   double-tap or Pencil Pro's squeeze; those only reach a native shell
   (UIPencilInteraction). This module is the single seam for both worlds:

     • `tiltFromEvent`      — normalises tilt from whichever fields exist
     • `notePenSample`      — cheap flag-setting from the ink layer so the UI
                              can say truthfully which inputs were detected
     • `PENCIL_GESTURE_EVENT` — contract a native bridge dispatches on
                              `window` for double-tap / squeeze. Absent
                              bridge = feature reported as unavailable, never
                              faked.
--------------------------------------------------------------------------- */

export type PencilGestureKind = 'double-tap' | 'squeeze'

/** Dispatched on `window` by a native bridge: `new CustomEvent(PENCIL_GESTURE_EVENT, { detail: { kind } })`. */
export const PENCIL_GESTURE_EVENT = 'tala:pencil-gesture'

/** A native shell sets this before dispatching gesture events. */
const BRIDGE_FLAG = '__TALA_PENCIL_BRIDGE__'

export interface PencilGestureDetail {
  kind: PencilGestureKind
}

/** What a stylus gesture may trigger — chosen by the user per gesture. */
export type PencilAction =
  | 'eraser-toggle'
  | 'previous-tool'
  | 'palette'
  | 'undo'
  | 'none'

export const PENCIL_ACTION_LABELS: Record<PencilAction, string> = {
  'eraser-toggle': 'Switch to eraser / back',
  'previous-tool': 'Previous tool',
  palette: 'Show tool palette',
  undo: 'Undo',
  none: 'Off',
}

export const PENCIL_ACTIONS = Object.keys(PENCIL_ACTION_LABELS) as PencilAction[]

export function isPencilAction(v: unknown): v is PencilAction {
  return typeof v === 'string' && v in PENCIL_ACTION_LABELS
}

/** Subscribe to native stylus gestures. Returns the unsubscribe function. */
export function onPencilGesture(handler: (kind: PencilGestureKind) => void): () => void {
  const listener = (e: Event): void => {
    const kind = (e as CustomEvent<PencilGestureDetail>).detail?.kind
    if (kind === 'double-tap' || kind === 'squeeze') handler(kind)
  }
  window.addEventListener(PENCIL_GESTURE_EVENT, listener)
  return () => window.removeEventListener(PENCIL_GESTURE_EVENT, listener)
}

/** Fields a pointer event may carry — all optional across browsers. */
export interface TiltSource {
  tiltX?: number
  tiltY?: number
  altitudeAngle?: number
}

/**
 * Tilt as 0..1 (0 = perpendicular, 1 = lying flat). Prefers altitudeAngle
 * (Chrome, Safari 16.4+), falls back to tiltX/tiltY degrees. Quantised to
 * 0.05 so recorded strokes stay small.
 */
export function tiltFromEvent(e: TiltSource): number | undefined {
  let t: number | undefined
  if (typeof e.altitudeAngle === 'number' && Number.isFinite(e.altitudeAngle)) {
    t = 1 - Math.max(0, Math.min(Math.PI / 2, e.altitudeAngle)) / (Math.PI / 2)
  } else if (typeof e.tiltX === 'number' && typeof e.tiltY === 'number') {
    const mag = Math.hypot(e.tiltX, e.tiltY)
    if (mag === 0) return undefined
    t = Math.min(1, mag / 90)
  }
  if (t === undefined || t < 0.05) return undefined
  return Math.round(t * 20) / 20
}

/* ------------------------- Observed capabilities -------------------------- */

export interface PencilCapabilities {
  /** A pen-type pointer has touched the canvas on this device. */
  stylusSeen: boolean
  /** Pen samples carried non-zero pressure. */
  pressure: boolean
  /** Pen samples carried tilt. */
  tilt: boolean
  /** The pen reported movement while lifted (hover). */
  hover: boolean
  /** A native shell is bridging double-tap / squeeze. */
  gestureBridge: boolean
}

const STYLUS_KEY = 'tala:stylus-seen'

function readStylusSeen(): boolean {
  try {
    return localStorage.getItem(STYLUS_KEY) === '1'
  } catch {
    return false
  }
}

let caps: PencilCapabilities = {
  stylusSeen: readStylusSeen(),
  pressure: false,
  tilt: false,
  hover: false,
  gestureBridge: typeof window !== 'undefined' && BRIDGE_FLAG in window,
}

const listeners = new Set<() => void>()

function publish(next: Partial<PencilCapabilities>): void {
  let changed = false
  for (const k of Object.keys(next) as (keyof PencilCapabilities)[]) {
    if (caps[k] !== next[k]) changed = true
  }
  if (!changed) return
  caps = { ...caps, ...next }
  if (next.stylusSeen) {
    try {
      localStorage.setItem(STYLUS_KEY, '1')
    } catch {
      /* ignore */
    }
  }
  for (const l of listeners) l()
}

/** Minimal pointer shape so the ink layer can pass native events untouched. */
export interface PenSample extends TiltSource {
  pointerType: string
  pressure: number
  buttons?: number
}

/**
 * Called from the ink layer's pointer handlers. Flag checks only — no
 * allocation, safe on every coalesced sample.
 */
export function notePenSample(e: PenSample): void {
  if (e.pointerType !== 'pen') return
  const patch: Partial<PencilCapabilities> = {}
  if (!caps.stylusSeen) patch.stylusSeen = true
  if (!caps.pressure && e.pressure > 0 && e.pressure !== 0.5) patch.pressure = true
  if (!caps.tilt && tiltFromEvent(e) !== undefined) patch.tilt = true
  if (!caps.hover && e.buttons === 0) patch.hover = true
  if (Object.keys(patch).length > 0) publish(patch)
}

/** Lets a native shell announce itself after the page loaded. */
export function registerPencilBridge(): void {
  publish({ gestureBridge: true })
}

export function getPencilCapabilities(): PencilCapabilities {
  return caps
}

export function usePencilCapabilities(): PencilCapabilities {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => caps,
    () => caps,
  )
}

// A bridge that loads after the app can still flip the flag.
if (typeof window !== 'undefined') {
  window.addEventListener('tala:pencil-bridge-ready', registerPencilBridge)
}
