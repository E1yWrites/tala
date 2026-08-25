import { useEffect, useRef } from 'react'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useMediaQuery, BREAKPOINTS } from '@/hooks/useMediaQuery'
import { useHotkeys } from '@/hooks/useHotkeys'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { SidebarResizeHandle } from '@/components/Sidebar/SidebarResizeHandle'
import { MobileNav } from './MobileNav'
import { ModalHost } from '@/components/Modals/ModalHost'
import { NoteListPanel } from '@/components/NoteList/NoteListPanel'
import { NoteEditor } from '@/components/NoteEditor/NoteEditor'
import { EditorPlaceholder } from '@/components/NoteEditor/EditorPlaceholder'
import { HomePage } from '@/pages/HomePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { OnboardingPage } from '@/components/Onboarding/OnboardingPage'
import { cn } from '@/utils/cn'

/** Collapsed rail width (px) — matches the sidebar minimum so nothing breaks. */
const SIDEBAR_COLLAPSED_WIDTH = 72

/**
 * Responsive three-pane shell.
 *
 * ≥1024px : sidebar · list · editor (sidebar collapsible)
 *  768–1023: drawer sidebar · list · editor
 *      <768: single pane + bottom nav; editor becomes full-screen
 */
export function AppShell(): React.ReactNode {
  const activeView = useUIStore((s) => s.activeView)
  const selectedNoteId = useUIStore((s) => s.selectedNoteId)
  const focusMode = useUIStore((s) => s.focusMode)
  const sidebarDrawerOpen = useUIStore((s) => s.sidebarDrawerOpen)
  const setSidebarDrawer = useUIStore((s) => s.setSidebarDrawer)

  const isDesktop = useMediaQuery(BREAKPOINTS.desktop)
  const isMobile = useMediaQuery(BREAKPOINTS.mobile)
  const sidebarCollapsed = useUIStore((s) => s.sidebarCollapsed)
  const sidebarWidth = useUIStore((s) => s.sidebarWidth)
  const sidebarResizing = useUIStore((s) => s.sidebarResizing)

  // Global keyboard shortcuts
  useHotkeys()

  // The drawer declares aria-modal — move focus in and keep Tab inside.
  const drawerRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!sidebarDrawerOpen || isDesktop) return
    const root = drawerRef.current
    if (!root) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const focusables = (): HTMLElement[] =>
      Array.from(
        root.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => el.offsetParent !== null)
    focusables()[0]?.focus()
    const onTab = (e: KeyboardEvent): void => {
      if (e.key !== 'Tab' || useUIStore.getState().modalStack.length > 0) return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (!root.contains(document.activeElement)) {
        e.preventDefault()
        first.focus()
      } else if (document.activeElement === last && !e.shiftKey) {
        e.preventDefault()
        first.focus()
      } else if (document.activeElement === first && e.shiftKey) {
        e.preventDefault()
        last.focus()
      }
    }
    window.addEventListener('keydown', onTab, true)
    return () => {
      window.removeEventListener('keydown', onTab, true)
      previouslyFocused?.focus?.()
    }
  }, [sidebarDrawerOpen, isDesktop])

  const openDrawer = (): void => setSidebarDrawer(true)

  /* ------------------------------ View content ----------------------------- */

  const setupCompleted = useSettingsStore((s) => s.settings.setupCompleted)

  // Show onboarding if setup is not completed
  if (!setupCompleted) {
    return <OnboardingPage />
  }

  let viewContent: React.ReactNode
  if (activeView.kind === 'home') {
    viewContent = <HomePage />
  } else if (activeView.kind === 'settings') {
    viewContent = <SettingsPage />
  } else {
    viewContent = (
      <NoteListPanel
        view={activeView}
        onOpenSidebar={!isDesktop ? openDrawer : undefined}
      />
    )
  }
  const isSettingsArea = activeView.kind === 'settings'

  /* --------------------------------- Drawer -------------------------------- */

  const drawer =
    sidebarDrawerOpen && !isDesktop ? (
      <div ref={drawerRef} className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
        <div
          className="absolute inset-0 bg-black/35 animate-fade-in"
          onClick={() => setSidebarDrawer(false)}
          aria-hidden="true"
        />
        <div className="absolute inset-y-0 left-0 shadow-sketch-lg animate-drawer-in">
          <Sidebar variant="drawer" />
        </div>
      </div>
    ) : null

  /* --------------------------------- Mobile -------------------------------- */

  if (isMobile) {
    return (
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 pb-[calc(3.75rem+env(safe-area-inset-bottom))]">
          {selectedNoteId ? (
            <NoteEditor key={selectedNoteId} noteId={selectedNoteId} />
          ) : (
            viewContent
          )}
        </div>
        {!selectedNoteId && <MobileNav />}
        {drawer}
        <ModalHost />
      </div>
    )
  }

  /* --------------------------- Desktop / tablet ---------------------------- */

  const showDockedSidebar = isDesktop && !focusMode

  return (
    <div
      className="flex h-full overflow-hidden"
      style={{ '--sidebar-width': `${sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : sidebarWidth}px` } as React.CSSProperties}
    >
      {showDockedSidebar && (
        <>
          <aside
            style={{ width: 'var(--sidebar-width)' }}
            className={cn(
              'h-full shrink-0 transition-[width] duration-200 ease-out',
              sidebarResizing && 'transition-none',
            )}
          >
            <Sidebar variant="dock" />
          </aside>
          {/* Always mounted (even collapsed) so drags never lose pointer capture. */}
          <SidebarResizeHandle />
        </>
      )}

      {isSettingsArea ? (
        <main className="min-h-0 min-w-0 flex-1">
          {focusMode && selectedNoteId ? (
            <NoteEditor key={selectedNoteId} noteId={selectedNoteId} />
          ) : (
            viewContent
          )}
        </main>
      ) : (
        <>
          {!focusMode && (
            <aside className="h-full w-[300px] min-h-0 shrink-0 xl:w-[360px]">
              {viewContent}
            </aside>
          )}
          <section aria-label="Editor" className="min-h-0 min-w-0 flex-1">
            {selectedNoteId ? (
              <NoteEditor key={selectedNoteId} noteId={selectedNoteId} />
            ) : (
              <EditorPlaceholder />
            )}
          </section>
        </>
      )}

      {drawer}
      <ModalHost />
    </div>
  )
}
