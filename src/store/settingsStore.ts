import { create } from 'zustand'
import { useSyncExternalStore } from 'react'
import { settingsRepository } from '@/database/repositories/settingsRepository'
import { DEFAULT_SETTINGS } from '@/data/defaults'
import type { AppSettings, ThemeMode } from '@/types/models'

interface SettingsState {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  setTheme: (mode: ThemeMode) => void
}

const systemDarkQuery =
  typeof window !== 'undefined'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return systemDarkQuery?.matches ?? false
}

/** Reactively tracks the OS theme so "System (…)" labels never go stale. */
export function useSystemDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      systemDarkQuery?.addEventListener('change', onChange)
      return () => systemDarkQuery?.removeEventListener('change', onChange)
    },
    () => systemDarkQuery?.matches ?? false,
  )
}

/** Applies the theme class to <html> and caches the preference for the splash script. */
export function applyThemeToDom(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', resolveDark(mode))
  try {
    localStorage.setItem('tala:theme', mode)
  } catch {
    /* private browsing */
  }
}

export const useSettingsStore = create<SettingsState>()((set, get) => ({
  settings: DEFAULT_SETTINGS,

  /** Optimistic settings update with persistence. Theme changes apply to the DOM. */
  update(patch) {
    const prev = get().settings
    const next = { ...prev, ...patch }
    if (patch.theme) applyThemeToDom(patch.theme)
    set({ settings: next })
    void settingsRepository.put(next).catch((err) => {
      console.error('[tala] failed to persist settings', err)
      // Re-read the CURRENT state to only roll back this specific failed write
      const current = get().settings
      if (patch.theme && current.theme !== next.theme) applyThemeToDom(current.theme)
      // If the current in-memory state still holds our failed value, revert
      // to the previous settings (not defaults).
      if (current === next) {
        set({ settings: prev })
        applyThemeToDom(prev.theme)
      }
    })
  },

  setTheme(mode) {
    get().update({ theme: mode })
  },
}))

/* Keep <html> in sync when the OS theme changes while in "system" mode. */
let mediaCleanup: (() => void) | null = null
function wireSystemTheme() {
  mediaCleanup?.()
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    const mode = useSettingsStore.getState().settings.theme
    if (mode === 'system') applyThemeToDom('system')
  }
  mq.addEventListener('change', handler)
  mediaCleanup = () => mq.removeEventListener('change', handler)
}
if (typeof window !== 'undefined') wireSystemTheme()
if (import.meta.hot) {
  import.meta.hot.dispose(() => mediaCleanup?.())
}
