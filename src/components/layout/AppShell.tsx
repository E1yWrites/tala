import { useEffect, useRef } from 'react'
import { useUIStore } from '@/store/uiStore'
import { usePrefsStore, PANE_WIDTHS } from '@/store/prefsStore'
import { useSettingsStore } from '@/store/settingsStore'
import { useMediaQuery, BREAKPOINTS } from '@/hooks/useMediaQuery'
import { useHotkeys } from '@/hooks/useHotkeys'
import { Sidebar } from '@/components/Sidebar/Sidebar'
import { MobileNav } from './MobileNav'
import { PaneResizer } from './PaneResizer'
import { ModalHost } from '@/components/Modals/ModalHost'
import { NoteListPanel } from '@/components/NoteList/NoteListPanel'
import { NoteEditor } from '@/components/NoteEditor/NoteEditor'
import { EditorPlaceholder } from '@/components/NoteEditor/EditorPlaceholder'
import { HomePage } from '@/pages/HomePage'
import { SettingsPage } from '@/pages/SettingsPage'
import { TasksPage } from '@/pages/TasksPage'
import { AgendaPage } from '@/pages/AgendaPage'
import { MoneyPage } from '@/pages/MoneyPage'
import { HabitsPage } from '@/pages/HabitsPage'
import type { ViewRef } from '@/types/models'
import { cn } from '@/utils/cn'
import { OnboardingPage } from '@/components/Onboarding/OnboardingPage'

/**
 * Responsive three-pane shell.
 *
 * ≥1024px : sidebar · list · editor (sidebar toggles expanded/hidden; both
 *            columns are drag-resizable, flex shrinks them before the editor
 *            drops below 480px)
 * 768-1023 : list · editor, sidebar in a drawer (tablet portrait)
 *    <768  : single pane + bottom tabs; editor becomes full-screen
 */
export function AppShell(): React.ReactNode {
  const activeView = useUIStore((s) => s.activeView)
  const selectedNoteId = useUIStore((s) => s.selectedNoteId)
  const focusMode = useUIStore((s) => s.focusMode)
  const sidebarDrawerOpen = useUIStore((s) => s.sidebarDrawerOpen)
  const setSidebarDrawer = useUIStore((s) => s.setSidebarDrawer)
  const sidebarCollapsed = usePrefsStore((s) => s.sidebarCollapsed)
  const toggleSidebar = usePrefsStore((s) => s.toggleSidebar)
  const sidebarWidth = usePrefsStore((s) => s.sidebarWidth)
  const setSidebarWidth = usePrefsStore((s) => s.setSidebarWidth)
  const listWidth = usePrefsStore((s) => s.listWidth)
  const setListWidth = usePrefsStore((s) => s.setListWidth)

  const isDesktop = useMediaQuery(BREAKPOINTS.desktop)
  const isMobile = useMediaQuery(BREAKPOINTS.mobile)
  const isXl = useMediaQuery('(min-width: 1280px)')

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

  /* ------------------------------ View content ----------------------------- */

  const setupCompleted = useSettingsStore((s) => s.settings.setupCompleted)

  // Show onboarding if setup is not completed
  if (!setupCompleted) {
    return <OnboardingPage />
  }

  const view: ViewRef = activeView

  let viewContent: React.ReactNode
  if (view.kind === 'home') {
    viewContent = <HomePage />
  } else if (view.kind === 'tasks') {
    viewContent = <TasksPage />
  } else if (view.kind === 'agenda') {
    viewContent = <AgendaPage />
  } else if (view.kind === 'money') {
    viewContent = <MoneyPage />
  } else if (view.kind === 'habits') {
    viewContent = <HabitsPage />
  } else if (view.kind === 'settings') {
    viewContent = <SettingsPage />
  } else {
    viewContent = <NoteListPanel view={view} />
  }
  const isSettingsArea = view.kind === 'settings'

  /* --------------------------------- Drawer -------------------------------- */

  const drawer =
    sidebarDrawerOpen && !isDesktop ? (
      <div ref={drawerRef} className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
        <div
          className="absolute inset-0 bg-black/35 animate-fade-in"
          onClick={() => setSidebarDrawer(false)}
          aria-hidden="true"
        />
        <div className="absolute inset-y-0 left-0 shadow-float animate-drawer-in">
          <Sidebar variant="drawer" />
        </div>
      </div>
    ) : null

  /* --------------------------------- Mobile -------------------------------- */

  if (isMobile) {
    return (
      <div className="flex h-full flex-col pt-[env(safe-area-inset-top)]">
        <div className={cn('min-h-0 flex-1', !selectedNoteId && 'pb-[calc(3.75rem+env(safe-area-inset-bottom))]')}>
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

  const showDockedSidebar = isDesktop && !focusMode && !sidebarCollapsed

  return (
    <div className="flex h-full overflow-hidden pt-[env(safe-area-inset-top)]">
      {showDockedSidebar && (
        <aside style={{ flexBasis: sidebarWidth, minWidth: PANE_WIDTHS.sidebar.min }} className="relative h-full shrink">
          <Sidebar variant="dock" />
          <PaneResizer
            label="Resize sidebar"
            value={sidebarWidth}
            min={PANE_WIDTHS.sidebar.min}
            max={PANE_WIDTHS.sidebar.max}
            onChange={setSidebarWidth}
            onReset={() => setSidebarWidth(PANE_WIDTHS.sidebar.default)}
            snapBelow={PANE_WIDTHS.sidebar.snapBelow}
            onCollapse={toggleSidebar}
          />
        </aside>
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
            <aside
              style={{ flexBasis: listWidth ?? undefined, minWidth: PANE_WIDTHS.list.min }}
              className="relative h-full min-h-0 shrink basis-[300px] xl:basis-[360px]"
            >
              {viewContent}
              {isDesktop && (
                <PaneResizer
                  label="Resize note list"
                  value={listWidth ?? (isXl ? 360 : 300)}
                  min={PANE_WIDTHS.list.min}
                  max={PANE_WIDTHS.list.max}
                  onChange={setListWidth}
                  onReset={() => setListWidth(null)}
                />
              )}
            </aside>
          )}
          <section aria-label="Editor" className="min-h-0 min-w-[480px] flex-1">
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
