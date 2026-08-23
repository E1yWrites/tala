import { db } from '../db'
import { DEFAULT_SETTINGS } from '@/data/defaults'
import type { AppSettings } from '@/types/models'

const SETTINGS_KEY = 'app' as const

export const settingsRepository = {
  async get(): Promise<AppSettings> {
    const stored = await db.settings.get(SETTINGS_KEY)
    if (!stored) return DEFAULT_SETTINGS
    // Merge forward so new settings keys appear after app updates
    return { ...DEFAULT_SETTINGS, ...stored, profile: { ...DEFAULT_SETTINGS.profile, ...stored.profile } }
  },
  async put(settings: AppSettings): Promise<void> {
    await db.settings.put({ ...settings, key: SETTINGS_KEY })
  },
}
