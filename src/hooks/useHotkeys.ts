import { useEffect } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'

const IS_DEV = import.meta.env.DEV

/** True while the user is typing in a text field (used to gate '/' etc.). */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

export const FORCE_SAVE_EVENT = 'notely:force-save'
export const FOCUS_SEARCH_EVENT = 'notely:focus-search'

/**
 * Global keyboard shortcuts:
 *   Esc            close topmost modal → close drawer → exit focus mode
 *   Ctrl/⌘ N       new note picker (some browsers reserve this — Alt+N also works)
 *   Alt N          new note picker
 *   Ctrl/⌘ K       search notes
 *   Ctrl/⌘ ⇧ F     search notes
 *   Ctrl/⌘ ⇧ P     command palette
 *   Ctrl/⌘ ⇧ D     toggle dark mode
 *   Ctrl/⌘ S       force-save the open note
 *   Ctrl/⌘ ,       settings
 *   /              focus list search (outside inputs)
 *
 * Navigation shortcuts (N/K/F/P/, and '/') are suppressed while a modal is
 * open so shortcuts never stack spotlights on top of an existing dialog.
 */
export function useHotkeys(): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // ---- Escape chain -----------------------------------------------------
      // Standalone overlays (local confirms, link dialog) close themselves via
      // their own capture handler — stay out of the way. Lower layers (drawer
      // in AppShell, pen mode in NoteEditor, ink selection in InkLayer) each
      // check the same stack and stay out of the way.
      if (e.key === 'Escape' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const ui = useUIStore.getState()
        if (ui.localOverlays > 0) {
          // handled by the overlay itself
        } else if (ui.modalStack.length > 0) {
          e.preventDefault()
          ui.closeModal()
        } else if (ui.sidebarDrawerOpen) {
          ui.setSidebarDrawer(false)
        } else if (ui.multiSelectMode) {
          ui.exitMultiSelectMode()
        } else if (ui.focusMode) {
          ui.toggleFocusMode()
        }
        return
      }

      const ui = useUIStore.getState()
      const blocked =
        ui.localOverlays > 0 || ui.modalStack.length > 0

      // ---- '/' focuses the list search when not typing ----------------------
      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (!isTypingTarget(e.target) && !blocked) {
          e.preventDefault()
          window.dispatchEvent(new CustomEvent(FOCUS_SEARCH_EVENT))
        }
        return
      }

      // ---- Alt+N — new note picker ------------------------------------------
      // (Ctrl+N is reserved by some browsers; e.code survives macOS dead keys
      // and non-US layouts where Option+N produces 'ñ' instead of 'n')
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyN') {
        if (isTypingTarget(e.target) || blocked) return
        e.preventDefault()
        ui.openModal({ kind: 'new-note' })
        return
      }

      const mod = e.ctrlKey || e.metaKey
      if (!mod) return

      // Plain-mod combos
      switch (e.key.toLowerCase()) {
        case 'n': {
          if (blocked) return
          e.preventDefault()
          ui.openModal({ kind: 'new-note' })
          return
        }
        case 'k': {
          if (blocked) return
          e.preventDefault()
          ui.openModal({ kind: 'search' })
          return
        }
        case 's': {
          // Browser "save page" is useless here — force-save instead
          e.preventDefault()
          window.dispatchEvent(new Event(FORCE_SAVE_EVENT))
          return
        }
        case ',': {
          if (blocked) return
          e.preventDefault()
          ui.setView({ kind: 'settings' })
          return
        }
      }

      // Shift-mod combos
      if (!e.shiftKey) return
      switch (e.key.toLowerCase()) {
        case 'f': {
          if (blocked) return
          e.preventDefault()
          ui.openModal({ kind: 'search' })
          return
        }
        case 'p': {
          if (blocked) return
          e.preventDefault()
          ui.openModal({ kind: 'palette' })
          return
        }
        case 'd': {
          e.preventDefault()
          const { settings, setTheme } = useSettingsStore.getState()
          const dark =
            settings.theme === 'dark' ||
            (settings.theme === 'system' &&
              window.matchMedia('(prefers-color-scheme: dark)').matches)
          setTheme(dark ? 'light' : 'dark')
          return
        }
        case 'r': {
          if (IS_DEV && e.ctrlKey) {
            e.preventDefault()
            useSettingsStore.getState().update({ setupCompleted: false })
            window.location.reload()
          }
          return
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
