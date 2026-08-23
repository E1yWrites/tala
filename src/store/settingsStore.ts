import { create } from 'zustand'
import { settingsRepository } from '@/database/repositories/settingsRepository'
import { DEFAULT_SETTINGS } from '@/data/defaults'
import type { AppSettings, ThemeMode } from '@/types/models'

interface SettingsState {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  setTheme: (mode: ThemeMode) => void
}

export function resolveDark(mode: ThemeMode): boolean {
  if (mode === 'dark') return true
  if (mode === 'light') return false
  return window.matchMedia('(prefers-color-scheme: dark)').matches
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
    const next = { ...get().settings, ...patch }
    if (patch.theme) applyThemeToDom(patch.theme)
    set({ settings: next })
    void settingsRepository.put(next).catch((err) => {
      console.error('[notely] failed to persist settings', err)
      set({ settings: get().settings })
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
