import { describe, expect, it } from 'vitest'
import { DEFAULT_COACH_PREFS, type CoachPrefs } from '@/store/prefsStore'
import { DAY, INSTALL_MAX_DISMISSALS, nextSuggestion, type CoachState } from './rules'

const NOW = 1_000 * DAY

const state = (patch: Omit<Partial<CoachState>, 'coach'> & { coach?: Partial<CoachPrefs> } = {}): CoachState => ({
  now: NOW,
  liveNotes: 5,
  env: { platform: 'desktop', standalone: false },
  canPromptInstall: false,
  quietMode: false,
  ...patch,
  coach: { ...DEFAULT_COACH_PREFS, firstSeenAt: NOW - 2 * DAY, ...patch.coach },
})

describe('nextSuggestion', () => {
  it('says nothing to a fresh install', () => {
    expect(nextSuggestion(state())).toBeNull()
  })

  it('says nothing with no notes to protect, or in Quiet mode', () => {
    const old = { firstSeenAt: NOW - 30 * DAY }
    expect(nextSuggestion(state({ liveNotes: 0, coach: old }))).toBeNull()
    expect(nextSuggestion(state({ quietMode: true, coach: old }))).toBeNull()
  })

  it('nudges a backup after a week, counted from first launch when none was made', () => {
    expect(nextSuggestion(state({ coach: { firstSeenAt: NOW - 6 * DAY } }))).toBeNull()
    expect(nextSuggestion(state({ coach: { firstSeenAt: NOW - 9 * DAY } }))).toEqual({ id: 'backup', daysSince: 9 })
  })

  it('counts from the last backup once there is one', () => {
    const coach = { firstSeenAt: NOW - 60 * DAY, lastBackupAt: NOW - 2 * DAY }
    expect(nextSuggestion(state({ coach }))).toBeNull()
    expect(nextSuggestion(state({ coach: { ...coach, lastBackupAt: NOW - 8 * DAY } }))).toEqual({ id: 'backup', daysSince: 8 })
  })

  it('honours a snooze', () => {
    const coach = { firstSeenAt: NOW - 30 * DAY, backupSnoozeUntil: NOW + DAY }
    expect(nextSuggestion(state({ coach }))).toBeNull()
    expect(nextSuggestion(state({ coach: { ...coach, backupSnoozeUntil: NOW - 1 } }))).toMatchObject({ id: 'backup' })
  })

  it('asks iPad Safari tabs to install, with the strongest wording', () => {
    const ios = state({ env: { platform: 'ios', standalone: false } })
    expect(nextSuggestion(ios)).toEqual({ id: 'install', variant: 'ios' })
    expect(nextSuggestion({ ...ios, env: { platform: 'ios', standalone: true } })).toBeNull()
  })

  it('offers the real install prompt on Chromium, else menu steps', () => {
    const android = state({ env: { platform: 'android', standalone: false } })
    expect(nextSuggestion(android)).toEqual({ id: 'install', variant: 'android-menu' })
    expect(nextSuggestion({ ...android, canPromptInstall: true })).toEqual({ id: 'install', variant: 'android' })
  })

  it('never asks desktop browsers or the Tauri shell to install', () => {
    expect(nextSuggestion(state({ env: { platform: 'desktop', standalone: false } }))).toBeNull()
    expect(nextSuggestion(state({ env: { platform: 'tauri', standalone: true } }))).toBeNull()
  })

  it('stops asking to install after repeated "Not now", and while snoozed', () => {
    const ios = { platform: 'ios', standalone: false } as const
    expect(nextSuggestion(state({ env: ios, coach: { installSnoozeUntil: NOW + DAY } }))).toBeNull()
    expect(nextSuggestion(state({ env: ios, coach: { installDismissals: INSTALL_MAX_DISMISSALS } }))).toBeNull()
  })

  it('puts protected storage before the backup reminder', () => {
    const s = state({ env: { platform: 'ios', standalone: false }, coach: { firstSeenAt: NOW - 30 * DAY } })
    expect(nextSuggestion(s)).toMatchObject({ id: 'install' })
    // once installed the backup nudge is next
    expect(nextSuggestion({ ...s, env: { platform: 'ios', standalone: true } })).toMatchObject({ id: 'backup' })
  })
})
