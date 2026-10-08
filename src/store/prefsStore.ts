import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import type { InkEraserMode, InkPreset, InkPointerMode } from '@/types/ink'
import { PEN_SIZES } from '@/types/ink'

/*
  Device-local preferences, persisted to localStorage by zustand. Anything that
  belongs in a backup (study goals, streaks, ...) goes in a Dexie table instead:
  a backup restored on another device must not depend on this browser.
*/

export type PencilAction = 'eraser' | 'pen' | 'undo' | 'palette' | 'none'

export interface PencilShortcuts {
  /** What a native Apple Pencil double-tap does (PencilKit gesture). */
  doubleTap: PencilAction
  /** What a native Apple Pencil squeeze does. */
  squeeze: PencilAction
  /** Show a tip ring when an Apple Pencil hovers the canvas in pen mode. */
  hover: boolean
}

export const DEFAULT_PENCIL_SHORTCUTS: PencilShortcuts = {
  doubleTap: 'eraser',
  squeeze: 'palette',
  hover: true,
}

export const PENCIL_ACTIONS: PencilAction[] = ['eraser', 'pen', 'undo', 'palette', 'none']

export interface InkPrefs {
  /** Last active pen tool (what re-selects when entering pen mode). */
  tool: Exclude<InkPointerMode, 'select'>
  color: string
  /** Index into the thickness presets (see PEN_SIZES / HIGHLIGHTER_SIZES) */
  sizeIdx: number
  eraserMode: InkEraserMode
  /** Named preset — drives the toolbar label and default sizes. */
  preset: InkPreset
  /** Apple Pencil shortcut/preview behaviour (configured from the pen palette). */
  pencil: PencilShortcuts
}

const INK_TOOLS: InkPrefs['tool'][] = ['pen', 'pencil', 'highlighter', 'eraser']

const VALID_PRESETS = new Set<string>([
  'marker', 'pencil', 'brush-pen', 'fine-pencil', 'highlighter', 'ballpoint',
])

export const DEFAULT_INK_PREFS: InkPrefs = {
  tool: 'pen',
  color: '#2563eb',
  sizeIdx: 3,
  eraserMode: 'stroke',
  preset: 'marker',
  pencil: DEFAULT_PENCIL_SHORTCUTS,
}

/** Coerces stored pen prefs: anything missing or of the wrong type falls back to the default. */
export function sanitizeInkPrefs(raw: unknown): InkPrefs {
  if (!isObj(raw)) return DEFAULT_INK_PREFS
  const parsed = raw as Partial<InkPrefs>
  return {
      tool: INK_TOOLS.includes(parsed.tool as InkPrefs['tool'])
        ? (parsed.tool as InkPrefs['tool'])
        : DEFAULT_INK_PREFS.tool,
      color:
        typeof parsed.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(parsed.color)
          ? parsed.color
          : DEFAULT_INK_PREFS.color,
      sizeIdx:
        typeof parsed.sizeIdx === 'number' && Number.isFinite(parsed.sizeIdx)
          ? // Clamp rather than reject: presets grew from 3 to 6 slots, and an
            // old stored index must survive the upgrade (and any future change).
            Math.min(Math.max(Math.round(parsed.sizeIdx), 0), PEN_SIZES.length - 1)
          : DEFAULT_INK_PREFS.sizeIdx,
      eraserMode:
        parsed.eraserMode === 'pixel' || parsed.eraserMode === 'stroke'
          ? parsed.eraserMode
          : DEFAULT_INK_PREFS.eraserMode,
      preset:
        typeof parsed.preset === 'string' && VALID_PRESETS.has(parsed.preset)
          ? (parsed.preset as InkPreset)
          : DEFAULT_INK_PREFS.preset,
      pencil: readPencilShortcuts(parsed.pencil),
  }
}

function readPencilShortcuts(raw: unknown): PencilShortcuts {
  const d = DEFAULT_PENCIL_SHORTCUTS
  const r = isObj(raw) ? (raw as Record<string, unknown>) : {}
  const act = (v: unknown, fallback: PencilAction): PencilAction =>
    typeof v === 'string' && (PENCIL_ACTIONS as string[]).includes(v)
      ? (v as PencilAction)
      : fallback
  return {
    doubleTap: act(r.doubleTap, d.doubleTap),
    squeeze: act(r.squeeze, d.squeeze),
    hover: typeof r.hover === 'boolean' ? r.hover : d.hover,
  }
}

function isObj(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/** Device-local facts the coach needs. Nothing here belongs in a backup. */
export interface CoachPrefs {
  /** First launch on this device; the weekly backup clock starts here. */
  firstSeenAt: number | null
  /** Last time a backup was exported from this device. */
  lastBackupAt: number | null
  backupSnoozeUntil: number
  installSnoozeUntil: number
  installDismissals: number
  /** Bituin's "remember this note?" rests until then. */
  resurfaceSnoozeUntil: number
  /** Week (see coach/study.ts weekKey) whose goal has already been cheered. */
  goalCheeredWeek: string | null
}

export const DEFAULT_COACH_PREFS: CoachPrefs = {
  firstSeenAt: null,
  lastBackupAt: null,
  backupSnoozeUntil: 0,
  installSnoozeUntil: 0,
  installDismissals: 0,
  resurfaceSnoozeUntil: 0,
  goalCheeredWeek: null,
}

function sanitizeCoachPrefs(raw: unknown): CoachPrefs {
  const r = isObj(raw) ? (raw as Record<string, unknown>) : {}
  const time = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null)
  const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0)
  return {
    firstSeenAt: time(r.firstSeenAt),
    lastBackupAt: time(r.lastBackupAt),
    backupSnoozeUntil: time(r.backupSnoozeUntil) ?? 0,
    installSnoozeUntil: time(r.installSnoozeUntil) ?? 0,
    installDismissals: count(r.installDismissals),
    resurfaceSnoozeUntil: time(r.resurfaceSnoozeUntil) ?? 0,
    goalCheeredWeek: typeof r.goalCheeredWeek === 'string' && r.goalCheeredWeek ? r.goalCheeredWeek : null,
  }
}

/** Draggable pane widths (px). The list's default is responsive (300, 360 from xl), so null means "default". */
export const PANE_WIDTHS = {
  sidebar: { min: 180, max: 360, default: 232, snapBelow: 140 },
  list: { min: 260, max: 480 },
} as const

function paneWidth(v: unknown, range: { min: number; max: number }): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(range.max, Math.max(range.min, v))) : null
}

interface PrefsState {
  sidebarCollapsed: boolean
  sidebarWidth: number
  listWidth: number | null
  /** Structured "Reading layout" for the note editor (cards + collapsible sections). */
  readingLayout: boolean
  /** Pen mode prefs: last tool/color/thickness. */
  inkPrefs: InkPrefs
  /** Silences Bituin's reactions and reminders everywhere. */
  quietMode: boolean
  /** Mirrors the pen bar, the phone tab bar and Bituin's corner for left-handed writers. */
  leftHanded: boolean
  /** EXPERIMENT: read handwriting in the background so searches can find it. Off unless chosen. */
  handwritingSearch: boolean
  coach: CoachPrefs
  toggleSidebar: () => void
  setSidebarWidth: (w: number) => void
  setListWidth: (w: number | null) => void
  toggleReadingLayout: () => void
  toggleQuietMode: () => void
  setLeftHanded: (on: boolean) => void
  setHandwritingSearch: (on: boolean) => void
  setCoach: (patch: Partial<CoachPrefs>) => void
  setInkPrefs: (patch: Partial<InkPrefs>) => void
}

/** Builds before this store kept each pref under its own key; carry them over once. */
function readLegacyPrefs(): Pick<PrefsState, 'sidebarCollapsed' | 'readingLayout' | 'inkPrefs'> {
  try {
    return {
      sidebarCollapsed: localStorage.getItem('tala:sidebar-collapsed') === '1',
      readingLayout: localStorage.getItem('tala:reading-layout') === '1',
      inkPrefs: sanitizeInkPrefs(JSON.parse(localStorage.getItem('tala:ink-prefs') ?? 'null')),
    }
  } catch {
    return { sidebarCollapsed: false, readingLayout: false, inkPrefs: DEFAULT_INK_PREFS }
  }
}

/** localStorage throws in private mode or when full: prefs then simply don't persist. */
const safeStorage: StateStorage = {
  getItem: (k) => {
    try {
      return localStorage.getItem(k)
    } catch {
      return null
    }
  },
  setItem: (k, v) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* ignore */
    }
  },
  removeItem: (k) => {
    try {
      localStorage.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}

export const usePrefsStore = create<PrefsState>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      sidebarWidth: PANE_WIDTHS.sidebar.default,
      listWidth: null,
      readingLayout: false,
      inkPrefs: DEFAULT_INK_PREFS,
      quietMode: false,
      leftHanded: false,
      handwritingSearch: false,
      coach: DEFAULT_COACH_PREFS,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarWidth: (w) => set({ sidebarWidth: paneWidth(w, PANE_WIDTHS.sidebar) ?? PANE_WIDTHS.sidebar.default }),
      setListWidth: (w) => set({ listWidth: paneWidth(w, PANE_WIDTHS.list) }),
      toggleReadingLayout: () => set((s) => ({ readingLayout: !s.readingLayout })),
      toggleQuietMode: () => set((s) => ({ quietMode: !s.quietMode })),
      setLeftHanded: (on) => set({ leftHanded: on }),
      setHandwritingSearch: (on) => set({ handwritingSearch: on }),
      setCoach: (patch) => set((s) => ({ coach: { ...s.coach, ...patch } })),
      setInkPrefs: (patch) => set((s) => ({ inkPrefs: { ...s.inkPrefs, ...patch } })),
    }),
    {
      name: 'tala:prefs',
      version: 1,
      storage: createJSONStorage(() => safeStorage),
      partialize: ({ sidebarCollapsed, sidebarWidth, listWidth, readingLayout, inkPrefs, quietMode, leftHanded, handwritingSearch, coach }) => ({
        sidebarCollapsed,
        sidebarWidth,
        listWidth,
        readingLayout,
        inkPrefs,
        quietMode,
        leftHanded,
        handwritingSearch,
        coach,
      }),
      // Validate on the way in: a hand-edited or older value must never crash the editor
      merge: (persisted, current) => {
        const p = (persisted ?? readLegacyPrefs()) as Partial<PrefsState>
        return {
          ...current,
          sidebarCollapsed: p.sidebarCollapsed === true,
          sidebarWidth: paneWidth(p.sidebarWidth, PANE_WIDTHS.sidebar) ?? PANE_WIDTHS.sidebar.default,
          listWidth: paneWidth(p.listWidth, PANE_WIDTHS.list),
          readingLayout: p.readingLayout === true,
          inkPrefs: sanitizeInkPrefs(p.inkPrefs),
          quietMode: p.quietMode === true,
          leftHanded: p.leftHanded === true,
          handwritingSearch: p.handwritingSearch === true,
          coach: sanitizeCoachPrefs(p.coach),
        }
      },
    },
  ),
)
