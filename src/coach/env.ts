/** Where Tala is running, as far as data safety cares. */
export type Platform = 'ios' | 'android' | 'desktop' | 'tauri'

export interface CoachEnv {
  platform: Platform
  /** Installed (home-screen app or desktop shell) rather than a browser tab. */
  standalone: boolean
}

interface NavLike {
  userAgent: string
  platform?: string
  maxTouchPoints?: number
}

export function detectPlatform(nav: NavLike, tauri: boolean): Platform {
  if (tauri) return 'tauri'
  if (/iPad|iPhone|iPod/.test(nav.userAgent)) return 'ios'
  // iPadOS 13+ reports itself as a Mac with a touch screen
  if (nav.platform === 'MacIntel' && (nav.maxTouchPoints ?? 0) > 1) return 'ios'
  if (/Android/.test(nav.userAgent)) return 'android'
  return 'desktop'
}

/** Reads the real browser. Safe to call during render; returns a desktop tab outside one. */
export function detectEnv(): CoachEnv {
  if (typeof window === 'undefined') return { platform: 'desktop', standalone: false }
  const platform = detectPlatform(navigator, '__TAURI_INTERNALS__' in window)
  const standalone =
    platform === 'tauri' ||
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as { standalone?: boolean }).standalone === true
  return { platform, standalone }
}

/* ------------------------- Chromium install prompt ------------------------- */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // keep it for our own button
    deferred = e as InstallPromptEvent
    listeners.forEach((l) => l())
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    listeners.forEach((l) => l())
  })
}

export const canPromptInstall = (): boolean => deferred !== null

export function onInstallAvailabilityChange(cb: () => void): () => void {
  listeners.add(cb)
  return () => listeners.delete(cb)
}

export async function promptInstall(): Promise<void> {
  const e = deferred
  deferred = null
  await e?.prompt()
  listeners.forEach((l) => l())
}
