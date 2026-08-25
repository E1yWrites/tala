# Changelog

All notable changes to Notely are documented here.

## [1.0.1] - 2026-08-25

### Bug Fixes

- **Pen toolbar width dots**: Fix `QUICK_INDICES` skipping index 3, which is the default size for marker and highlighter presets. All 5 dots now correctly reflect the available sizes.
- **Pen palette tool switching**: Fix `pickTool` clobbering the active preset when switching to eraser or select. The current writing preset (e.g. brush-pen, ballpoint) is now preserved.
- **Pen palette re-selection**: Fix `pickTool` resetting `sizeIdx` to the preset default even when clicking the already-active tool. Manual size choices are now respected.
- **Pen toolbar label**: Fix toolbar label showing "Marker" when eraser or select tool is active. Now correctly shows "Eraser" or "Select".
- **Long-press timer leak**: Fix `useLongPress` timer not cleaned up on unmount, which could cause ghost preview cards for deleted notes.
- **Long-press touch selection**: Add `preventDefault` on `touchStart` to suppress native text selection during long-press on mobile.
- **Multi-select Escape key**: Escape now exits multi-select mode (was previously missing from the Escape priority chain).
- **Multi-select stale selection**: Prune `selectedNoteIds` when the visible note list changes due to search or filter, preventing stale selections and broken batch operations.
- **Multi-select select-all toggle**: Fix "Select all / Deselect all" using count comparison instead of set equality. Now uses `every()` for correct set comparison.
- **Multi-select mode entry**: Fix `enterMultiSelectMode` not clearing the single-note `selectedNoteId`, causing inconsistent highlight state.
- **Multi-select delete button label**: Button now shows "Move to trash" (live/archive) or "Delete forever" (trash) instead of a generic "Delete" on all surfaces.
- **Note preview trash**: Fix preview card always showing confirmation dialog regardless of the `confirmBeforeDelete` setting. Now respects the user's preference, matching kebab menu behavior.
- **Note preview positioning**: Fix preview card not accounting for the mobile bottom nav bar (64px), which could position the card behind the navigation.
- **Note preview event churn**: Memoize `onClose` callback to prevent `NotePreviewCard` from re-registering window event listeners on every parent render.
- **Dropdown menu clipping**: Add viewport-aware horizontal positioning to the context menu to prevent left-edge clipping when the trigger is near the left side of the screen. Uses `getBoundingClientRect` measurement and `translateX` clamping.
- **Dropdown menu overflow safety**: Add `overflow-hidden` to the dropdown menu container to prevent content from extending beyond its boundaries.

### Features

- **Pen tool presets**: Six named writing styles (Marker, Brush Pen, Pencil, Fine Pencil, Highlighter, Ballpoint) accessible via label click cycling in the pen toolbar.
- **Multi-select mode**: Batch operations (trash, delete forever) across all surfaces — live notes, archive, and trash. Includes selection toolbar with count, select all/deselect all, and action buttons.
- **Long-press preview**: Floating preview card on long-press (touch) or right-click (desktop) showing note metadata, content preview, tags, task progress, and quick actions (Open, Share, Duplicate, Trash).
- **Context menu Share action**: "Share..." option added to the note context menu, opening the existing Share modal.
- **Grid card context menu**: Three-dot kebab menu now available on grid view cards (previously only on list rows).
- **Inline width dots**: Five dot selectors in the pen toolbar replace scroll-to-resize for quick stroke width picking, with visual dot diameter proportional to stroke width.

## [1.0.0] - 2026-08-24

Initial release of Notely — a local-first, hand-drawn aesthetic note-taking app.

### Core Features

- Rich text editing with Tiptap (headings, lists, task lists, code blocks, blockquotes, images)
- Handwriting/ink layer with pen, pencil, highlighter, eraser, and selection tools
- Radial pen palette with tool, color, and size selection
- Note organization with folders and tags
- Favorites and pinning
- Archive and trash with restore
- Search across all notes
- Multiple view modes (list, grid, comfort, compact)
- Dark/light/system theme support
- Full-text backup and restore
- Onboarding flow
- Focus mode (distraction-free writing)
- Global keyboard shortcuts
- Settings with profile, editor font size, sort preferences
