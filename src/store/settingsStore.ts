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
    localStorage.setItem('notely:theme', mode)
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
      console.error('[notely] failed to persist settings', err)
      // Roll back the optimistic value (and DOM theme) to what was there before
      if (patch.theme && prev.theme !== next.theme) applyThemeToDom(prev.theme)
      set({ settings: prev })
    })
  },

  setTheme(mode) {
    get().update({ theme: mode })
  },
}))

/* Keep <html> in sync when the OS theme changes while in "system" mode. */
if (typeof window !== 'undefined') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const mode = useSettingsStore.getState().settings.theme
    if (mode === 'system') applyThemeToDom('system')
  })
}
