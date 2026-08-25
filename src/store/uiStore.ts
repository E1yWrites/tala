import { create } from 'zustand'
import type { ModalIntent, ViewRef } from '@/types/models'
import type { InkEraserMode, InkPointerMode } from '@/types/ink'
import { PEN_SIZES } from '@/types/ink'

const SIDEBAR_KEY = 'notely:sidebar-collapsed'
const SIDEBAR_WIDTH_KEY = 'notely:sidebar-width'
const READING_LAYOUT_KEY = 'notely:reading-layout'
const INK_PREFS_KEY = 'notely:ink-prefs'

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

export interface InkPrefs {
  /** Last active pen tool (what re-selects when entering pen mode). */
  tool: Exclude<InkPointerMode, 'select'>
  color: string
  /** Index into the thickness presets (see PEN_SIZES / HIGHLIGHTER_SIZES) */
  sizeIdx: number
  eraserMode: InkEraserMode
}

const INK_TOOLS: InkPrefs['tool'][] = ['pen', 'pencil', 'highlighter', 'eraser']

export const DEFAULT_INK_PREFS: InkPrefs = {
  tool: 'pen',
  color: '#2563eb',
  sizeIdx: 1,
  eraserMode: 'stroke',
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

  setView: (view: ViewRef) => void
  selectNote: (id: string | null) => void
  toggleSidebar: () => void
  setSidebarWidth: (px: number) => void
  commitSidebarWidth: () => void
  setSidebarResizing: (dragging: boolean) => void
  toggleReadingLayout: () => void
  setSidebarDrawer: (open: boolean) => void
  toggleFocusMode: () => void
  setInkPrefs: (patch: Partial<InkPrefs>) => void
  openModal: (intent: ModalIntent) => void
  closeModal: () => void
  closeAllModals: () => void
  pushLocalOverlay: () => void
  popLocalOverlay: () => void
  setSearchQuery: (q: string) => void
  toggleFilterTag: (tagId: string) => void
  toggleFilterFavorites: () => void
  clearFilters: () => void
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

  setView(view) {
    set({ activeView: view, selectedNoteId: null, searchQuery: '', filterTagIds: [], filterFavoritesOnly: false })
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
    const next = { ...get().inkPrefs, ...patch }
    set({ inkPrefs: next })
    try {
      localStorage.setItem(INK_PREFS_KEY, JSON.stringify(next))
    } catch { /* ignore */ }
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
}))

