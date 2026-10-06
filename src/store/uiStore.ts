import { create } from 'zustand'
import type { ModalIntent, ViewRef } from '@/types/models'

/** Fixed sidebar width when expanded (px). */
export const SIDEBAR_WIDTH = 260

interface UIState {
  activeView: ViewRef
  selectedNoteId: string | null
  /** Page to show when the next note opens (set by Tasks); NoteEditor consumes it. */
  pendingPageId: string | null
  /** Mobile/tablet slide-in sidebar */
  sidebarDrawerOpen: boolean
  /** Distraction-free mode: hides sidebar + list to focus on the editor */
  focusMode: boolean
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
  selectNote: (id: string | null, pageId?: string) => void
  clearPendingPage: () => void
  setSidebarDrawer: (open: boolean) => void
  toggleFocusMode: () => void
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
  pendingPageId: null,
  sidebarDrawerOpen: false,
  focusMode: false,
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

  selectNote(id, pageId) {
    set({ selectedNoteId: id, pendingPageId: pageId ?? null })
  },

  clearPendingPage() {
    set({ pendingPageId: null })
  },

  setSidebarDrawer(open) {
    set({ sidebarDrawerOpen: open })
  },

  toggleFocusMode() {
    set((s) => ({ focusMode: !s.focusMode, sidebarDrawerOpen: false }))
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

