import { describe, expect, it } from 'vitest'
import { DEFAULT_COACH_PREFS, type CoachPrefs } from '@/store/prefsStore'
import { DAY, INSTALL_MAX_DISMISSALS, RESURFACE_AFTER_DAYS, WRAPUP_FRESH_MS, nextSuggestion, type CoachState } from './rules'

const NOW = 1_000 * DAY

const state = (patch: Omit<Partial<CoachState>, 'coach'> & { coach?: Partial<CoachPrefs> } = {}): CoachState => ({
  now: NOW,
  liveNotes: 5,
  env: { platform: 'desktop', standalone: false },
  canPromptInstall: false,
  quietMode: false,
  wrapup: null,
  week: { key: '2026-10-05', studyDays: 0, goal: 4 },
  staleNote: null,
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

describe('the coach loop', () => {
  const wrapup = { noteId: 'n', title: 'Enzymes', minutes: 14, pagesAdded: 2, tasksLeft: 3, at: NOW - 60_000 }

  it('wraps up a session first, ahead of reminders', () => {
    const coach = { firstSeenAt: NOW - 30 * DAY } // a backup is also due
    expect(nextSuggestion(state({ wrapup, coach }))).toEqual({ id: 'wrapup', ...wrapup })
  })
  it('lets a stale wrap-up go', () => {
    expect(nextSuggestion(state({ wrapup: { ...wrapup, at: NOW - WRAPUP_FRESH_MS - 1 } }))).toBeNull()
  })

  it('cheers the weekly goal once per week', () => {
    const week = { key: '2026-10-05', studyDays: 4, goal: 4 }
    expect(nextSuggestion(state({ week }))).toEqual({ id: 'goal', days: 4, goal: 4, week: '2026-10-05' })
    expect(nextSuggestion(state({ week: { ...week, studyDays: 3 } }))).toBeNull()
    expect(nextSuggestion(state({ week, coach: { goalCheeredWeek: '2026-10-05' } }))).toBeNull()
    // next week it can cheer again
    expect(nextSuggestion(state({ week: { ...week, key: '2026-10-12' }, coach: { goalCheeredWeek: '2026-10-05' } }))?.id).toBe('goal')
  })

  it('missing days never produces a guilt message', () => {
    expect(nextSuggestion(state({ week: { key: '2026-10-05', studyDays: 0, goal: 4 } }))).toBeNull()
  })

  it('brings back a note untouched for a week, then rests', () => {
    const staleNote = { id: 'old', title: 'Organic Chemistry', updatedAt: NOW - 9 * DAY }
    expect(nextSuggestion(state({ staleNote }))).toEqual({ id: 'resurface', noteId: 'old', title: 'Organic Chemistry', days: 9 })
    expect(nextSuggestion(state({ staleNote: { ...staleNote, updatedAt: NOW - (RESURFACE_AFTER_DAYS - 1) * DAY } }))).toBeNull()
    expect(nextSuggestion(state({ staleNote, coach: { resurfaceSnoozeUntil: NOW + DAY } }))).toBeNull()
  })

  it('keeps reminders ahead of the old-note nudge, and Quiet mode silences all of it', () => {
    const staleNote = { id: 'old', title: 'Old', updatedAt: NOW - 20 * DAY }
    expect(nextSuggestion(state({ staleNote, coach: { firstSeenAt: NOW - 30 * DAY } }))?.id).toBe('backup')
    expect(nextSuggestion(state({ staleNote, wrapup, quietMode: true }))).toBeNull()
  })
})

