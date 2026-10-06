import type { CoachPrefs } from '@/store/prefsStore'
import type { CoachEnv } from './env'

/*
  Pure rules: library and device state in, at most one suggestion out. No
  clocks, no DOM, no stores, so every rule is testable with plain objects.
*/

export const DAY = 86_400_000
export const BACKUP_EVERY_DAYS = 7
export const BACKUP_SNOOZE_DAYS = 3
export const INSTALL_SNOOZE_DAYS = 7
/** After this many "Not now" taps the install prompt stops appearing by itself. */
export const INSTALL_MAX_DISMISSALS = 3

export type Suggestion =
  | { id: 'install'; variant: 'ios' | 'android' | 'android-menu' }
  | { id: 'backup'; daysSince: number }

export interface CoachState {
  now: number
  /** Notes that exist for real: not trashed, not scratch cards. */
  liveNotes: number
  coach: CoachPrefs
  env: CoachEnv
  /** The browser is holding an install prompt we can fire (Chromium). */
  canPromptInstall: boolean
  quietMode: boolean
}

export function nextSuggestion(s: CoachState): Suggestion | null {
  // Quiet mode silences reminders; nothing is suggested without notes to protect
  if (s.quietMode || s.liveNotes < 1) return null

  // Protected storage first: an evicted library can't be backed up
  const wantsInstall =
    (s.env.platform === 'ios' || s.env.platform === 'android') &&
    !s.env.standalone &&
    s.coach.installDismissals < INSTALL_MAX_DISMISSALS &&
    s.now >= s.coach.installSnoozeUntil
  if (wantsInstall) {
    if (s.env.platform === 'ios') return { id: 'install', variant: 'ios' }
    return { id: 'install', variant: s.canPromptInstall ? 'android' : 'android-menu' }
  }

  // The weekly clock runs from the last backup, or from the first launch
  const since = s.coach.lastBackupAt ?? s.coach.firstSeenAt
  if (since !== null && s.now >= s.coach.backupSnoozeUntil) {
    const days = Math.floor((s.now - since) / DAY)
    if (days >= BACKUP_EVERY_DAYS) return { id: 'backup', daysSince: days }
  }
  return null
}
