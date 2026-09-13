import { create } from 'zustand'
import type { ModalIntent, ViewRef } from '@/types/models'
import type { InkEraserMode, InkPreset, InkPointerMode } from '@/types/ink'
import { OPACITY_RANGE, PEN_SIZES } from '@/types/ink'
import { isPencilAction, type PencilAction } from '@/lib/pencil'

const SIDEBAR_KEY = 'tala:sidebar-collapsed'
const SIDEBAR_WIDTH_KEY = 'tala:sidebar-width'
const READING_LAYOUT_KEY = 'tala:reading-layout'
const INK_PREFS_KEY = 'tala:ink-prefs'

/** Resizable dock width bounds (px) and the reset default. */
export const SIDEBAR_MIN_WIDTH = 72
export const SIDEBAR_MAX_WIDTH = 360
export const SIDEBAR_DEFAULT_WIDTH = 260
/** Below this while dragging, the rail snaps closed instead of truncating labels. */
export const SIDEBAR_SNAP_COLLAPSE_AT = 96

function readSidebarCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === '1'
  } catch {
    return false
  }
}

function clampWidth(px: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(px)))
}

function readSidebarWidth(): number {
  try {
    const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY))
    return Number.isFinite(raw) && raw > 0 ? clampWidth(raw) : SIDEBAR_DEFAULT_WIDTH
  } catch {
    return SIDEBAR_DEFAULT_WIDTH
  }
}

function readReadingLayout(): boolean {
  try {
    return localStorage.getItem(READING_LAYOUT_KEY) === '1'
  } catch {
    return false
  }
}

/* ------------------------------ Pen preferences --------------------------- */

/** Stylus behaviour — one place, surfaced only in the Draw popover. */
export interface PencilSettings {
  /** Apple Pencil double-tap (needs a native bridge, see lib/pencil.ts). */
  doubleTap: PencilAction
  /** Apple Pencil Pro squeeze (needs a native bridge). */
  squeeze: PencilAction
  /** Ring preview under a hovering pen tip. */
  hoverPreview: boolean
  /** Record pressure into strokes (pen + pencil). */
  pressure: boolean
  /** Tilt widens pencil marks. */
  tilt: boolean
  /** Finger touches draw (true) or scroll the page (false). */
  touchDraws: boolean
}

/** One remembered tool/colour/size combination that was actually written with. */
export interface InkRecent {
  tool: Exclude<InkPointerMode, 'select' | 'eraser'>
  preset: InkPreset
  color: string
  sizeIdx: number
  opacity?: number
}

export const MAX_RECENTS = 6

export interface InkPrefs {
  /** Last active pen tool (what re-selects when entering pen mode). */
  tool: Exclude<InkPointerMode, 'select'>
  color: string
  /** Index into the thickness presets (see PEN_SIZES / HIGHLIGHTER_SIZES) */
  sizeIdx: number
  eraserMode: InkEraserMode
  /** Named preset — drives the toolbar label and default sizes. */
  preset: InkPreset
  /** Highlighter opacity (OPACITY_RANGE.highlighter). */
  hlOpacity: number
  /** Pencil opacity (OPACITY_RANGE.pencil). */
  pencilOpacity: number
  recents: InkRecent[]
  pencil: PencilSettings
}

const INK_TOOLS: InkPrefs['tool'][] = ['pen', 'pencil', 'highlighter', 'eraser']

const VALID_PRESETS = new Set<string>([
  'marker', 'pencil', 'brush-pen', 'fine-pencil', 'highlighter', 'ballpoint',
])

export const DEFAULT_PENCIL_SETTINGS: PencilSettings = {
  doubleTap: 'eraser-toggle',
  squeeze: 'palette',
  hoverPreview: true,
  pressure: true,
  tilt: true,
  touchDraws: true,
}

export const DEFAULT_INK_PREFS: InkPrefs = {
  tool: 'pen',
  color: '#2563eb',
  sizeIdx: 3,
  eraserMode: 'stroke',
  preset: 'marker',
  hlOpacity: 0.35,
  pencilOpacity: 0.82,
  recents: [],
  pencil: DEFAULT_PENCIL_SETTINGS,
}

const isHex = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)

function clampOpacity(v: unknown, tool: 'highlighter' | 'pencil', fallback: number): number {
  const range = OPACITY_RANGE[tool]!
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(range.max, Math.max(range.min, v))
    : fallback
}

function readRecents(raw: unknown): InkRecent[] {
  if (!Array.isArray(raw)) return []
  const out: InkRecent[] = []
  for (const r of raw) {
    if (!r || typeof r !== 'object') continue
    const rec = r as Partial<InkRecent>
    if (rec.tool !== 'pen' && rec.tool !== 'pencil' && rec.tool !== 'highlighter') continue
    if (typeof rec.preset !== 'string' || !VALID_PRESETS.has(rec.preset)) continue
    if (!isHex(rec.color)) continue
    if (typeof rec.sizeIdx !== 'number' || !Number.isFinite(rec.sizeIdx)) continue
    out.push({
      tool: rec.tool,
      preset: rec.preset as InkPreset,
      color: rec.color,
      sizeIdx: Math.min(Math.max(Math.round(rec.sizeIdx), 0), PEN_SIZES.length - 1),
      ...(typeof rec.opacity === 'number' ? { opacity: rec.opacity } : {}),
    })
    if (out.length >= MAX_RECENTS) break
  }
  return out
}

function readPencil(raw: unknown): PencilSettings {
  const d = DEFAULT_PENCIL_SETTINGS
  if (!raw || typeof raw !== 'object') return d
  const p = raw as Partial<PencilSettings>
  const bool = (v: unknown, fb: boolean): boolean => (typeof v === 'boolean' ? v : fb)
  return {
    doubleTap: isPencilAction(p.doubleTap) ? p.doubleTap : d.doubleTap,
    squeeze: isPencilAction(p.squeeze) ? p.squeeze : d.squeeze,
    hoverPreview: bool(p.hoverPreview, d.hoverPreview),
    pressure: bool(p.pressure, d.pressure),
    tilt: bool(p.tilt, d.tilt),
    touchDraws: bool(p.touchDraws, d.touchDraws),
  }
}

function readInkPrefs(): InkPrefs {
  try {
    const raw = localStorage.getItem(INK_PREFS_KEY)
    if (!raw) return DEFAULT_INK_PREFS
    const parsed = JSON.parse(raw) as Partial<InkPrefs>
    return {
      tool: INK_TOOLS.includes(parsed.tool as InkPrefs['tool'])
        ? (parsed.tool as InkPrefs['tool'])
        : DEFAULT_INK_PREFS.tool,
      color: isHex(parsed.color) ? parsed.color : DEFAULT_INK_PREFS.color,
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
      hlOpacity: clampOpacity(parsed.hlOpacity, 'highlighter', DEFAULT_INK_PREFS.hlOpacity),
      pencilOpacity: clampOpacity(parsed.pencilOpacity, 'pencil', DEFAULT_INK_PREFS.pencilOpacity),
      recents: readRecents(parsed.recents),
      pencil: readPencil(parsed.pencil),
    }
  } catch {
    return DEFAULT_INK_PREFS
  }
}

interface UIState {
  activeView: ViewRef
  selectedNoteId: string | null
  sidebarCollapsed: boolean
  /** Docked sidebar width in px (72–360). Persisted to localStorage. */
  sidebarWidth: number
  /** True while the user is dragging the resize handle (disables width transitions). */
  sidebarResizing: boolean
  /** Structured "Reading layout" for the note editor (cards + collapsible sections). */
  readingLayout: boolean
  /** Mobile/tablet slide-in sidebar */
  sidebarDrawerOpen: boolean
  /** Distraction-free mode: hides sidebar + list to focus on the editor */
  focusMode: boolean
  /** Pen mode prefs — last tool/color/thickness, persisted to localStorage. */
  inkPrefs: InkPrefs
  /** Stack so Esc always closes the topmost modal. Entries carry stable ids. */
  modalStack: { id: number; intent: ModalIntent }[]
  /**
   * Count of standalone <Modal standalone> overlays mounted outside the store
   * stack (local confirm dialogs, link dialog). They handle their own Escape;
   * global shortcuts must treat them like stacked modals.
   */
  localOverlays: number
  searchQuery: string
  filterTagIds: string[]
  filterFavoritesOnly: boolean

  /** Multi-select mode for batch operations on notes. */
  multiSelectMode: boolean
  /** IDs of notes selected in multi-select mode. */
  selectedNoteIds: string[]

  setView: (view: ViewRef) => void
  selectNote: (id: string | null) => void
  toggleSidebar: () => void
  setSidebarWidth: (px: number) => void
  commitSidebarWidth: () => void
  setSidebarResizing: (dragging: boolean) => void
  toggleReadingLayout: () => void
  setSidebarDrawer: (open: boolean) => void
  toggleFocusMode: () => void
  setInkPrefs: (
    patch: Partial<Omit<InkPrefs, 'pencil'>> & { pencil?: Partial<PencilSettings> },
  ) => void
  pushInkRecent: (recent: InkRecent) => void
  openModal: (intent: ModalIntent) => void
  closeModal: () => void
  closeAllModals: () => void
  pushLocalOverlay: () => void
  popLocalOverlay: () => void
  setSearchQuery: (q: string) => void
  toggleFilterTag: (tagId: string) => void
  toggleFilterFavorites: () => void
  clearFilters: () => void

  enterMultiSelectMode: () => void
  exitMultiSelectMode: () => void
  toggleNoteSelection: (id: string) => void
  selectAllNotes: (ids: string[]) => void
  deselectAllNotes: () => void
}

/** Monotonic id source for stable modal keys across stack shifts. */
let modalIdSeq = 0

export const useUIStore = create<UIState>()((set, get) => ({
  activeView: { kind: 'home' },
  selectedNoteId: null,
  sidebarCollapsed: readSidebarCollapsed(),
  sidebarWidth: readSidebarWidth(),
  sidebarResizing: false,
  readingLayout: readReadingLayout(),
  sidebarDrawerOpen: false,
  focusMode: false,
  inkPrefs: readInkPrefs(),
  modalStack: [],
  localOverlays: 0,
  searchQuery: '',
  filterTagIds: [],
  filterFavoritesOnly: false,
  multiSelectMode: false,
  selectedNoteIds: [],

  setView(view) {
    set({ activeView: view, selectedNoteId: null, searchQuery: '', filterTagIds: [], filterFavoritesOnly: false, multiSelectMode: false, selectedNoteIds: [] })
  },

  selectNote(id) {
    set({ selectedNoteId: id })
  },

  toggleSidebar() {
    const next = !get().sidebarCollapsed
    try {
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0')
    } catch { /* ignore */ }
    set({ sidebarCollapsed: next })
  },

  /** Live width updates while dragging or using the settings slider. */
  setSidebarWidth(px) {
    set({ sidebarWidth: clampWidth(px) })
  },

  /** Persist the current width (called on drag end / slider release). */
  commitSidebarWidth() {
    const width = get().sidebarWidth
    try {
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(width))
    } catch { /* ignore */ }
  },

  setSidebarResizing(dragging) {
    set({ sidebarResizing: dragging })
  },

  toggleReadingLayout() {
    const next = !get().readingLayout
    try {
      localStorage.setItem(READING_LAYOUT_KEY, next ? '1' : '0')
    } catch { /* ignore */ }
    set({ readingLayout: next })
  },

  setSidebarDrawer(open) {
    set({ sidebarDrawerOpen: open })
  },

  toggleFocusMode() {
    set((s) => ({ focusMode: !s.focusMode, sidebarDrawerOpen: false }))
  },

  setInkPrefs(patch) {
    const prev = get().inkPrefs
    const next: InkPrefs = {
      ...prev,
      ...patch,
      pencil: patch.pencil ? { ...prev.pencil, ...patch.pencil } : prev.pencil,
    }
    set({ inkPrefs: next })
    try {
      localStorage.setItem(INK_PREFS_KEY, JSON.stringify(next))
    } catch { /* ignore */ }
  },

  /** Remember a combination the user actually wrote with (most recent first, deduped). */
  pushInkRecent(recent) {
    const key = (r: InkRecent): string =>
      `${r.preset}|${r.color.toLowerCase()}|${r.sizeIdx}|${r.opacity ?? ''}`
    const prev = get().inkPrefs.recents
    const k = key(recent)
    if (prev[0] && key(prev[0]) === k) return
    const recents = [recent, ...prev.filter((r) => key(r) !== k)].slice(0, MAX_RECENTS)
    get().setInkPrefs({ recents })
  },

  openModal(intent) {
    // Never stack duplicates of the same singleton modal
    if (
      (intent.kind === 'palette' || intent.kind === 'search' || intent.kind === 'new-note') &&
      get().modalStack.some((m) => m.intent.kind === intent.kind)
    ) {
      return
    }
    set((s) => ({
      modalStack: [...s.modalStack, { id: ++modalIdSeq, intent }],
    }))
  },

  closeModal() {
    set((s) => ({ modalStack: s.modalStack.slice(0, -1) }))
  },

  closeAllModals() {
    set({ modalStack: [] })
  },

  pushLocalOverlay() {
    set((s) => ({ localOverlays: s.localOverlays + 1 }))
  },

  popLocalOverlay() {
    set((s) => ({ localOverlays: Math.max(0, s.localOverlays - 1) }))
  },

  setSearchQuery(q) {
    set({ searchQuery: q })
  },

  toggleFilterTag(tagId) {
    set((s) => ({
      filterTagIds: s.filterTagIds.includes(tagId)
        ? s.filterTagIds.filter((t) => t !== tagId)
        : [...s.filterTagIds, tagId],
    }))
  },

  toggleFilterFavorites() {
    set((s) => ({ filterFavoritesOnly: !s.filterFavoritesOnly }))
  },

  clearFilters() {
    set({ filterTagIds: [], filterFavoritesOnly: false })
  },

  enterMultiSelectMode() {
    set({ multiSelectMode: true, selectedNoteIds: [], selectedNoteId: null })
  },

  exitMultiSelectMode() {
    set({ multiSelectMode: false, selectedNoteIds: [] })
  },

  toggleNoteSelection(id) {
    set((s) => {
      const has = s.selectedNoteIds.includes(id)
      return {
        selectedNoteIds: has
          ? s.selectedNoteIds.filter((nid) => nid !== id)
          : [...s.selectedNoteIds, id],
      }
    })
  },

  selectAllNotes(ids) {
    set({ selectedNoteIds: ids })
  },

  deselectAllNotes() {
    set({ selectedNoteIds: [] })
  },
}))

