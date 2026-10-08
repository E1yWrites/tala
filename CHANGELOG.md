# Changelog

All notable changes to Tala are documented here.

## [2.1.0] - 2026-10-08

Bug fixes and quality-of-life improvements.

### Added
- **Continuous scroll**: a note's pages stack in one scroll instead of showing one at a time, and a note reopens on the page you last had in view (per device).
- **Insert pages in between**: a "+" between pages and after the last, plus "Insert page before/after" in the page menu. A new page copies the size and template of the page above it.
- **Resizable sidebar and note list**: drag the handle, or focus it and use the arrow keys, Home/End; double-click resets. Dragging the sidebar narrow enough closes it and keeps its width for reopening.

### Changed
- Home, Tasks and Settings each have a sidebar toggle in their header, so a hidden sidebar is always one tap away (including on a tablet held upright).
- Undo and redo cover the whole note across its pages.
- Only one formatting toolbar is on screen: the page you are typing in, or else the page in view.
- Larger touch targets for Type/Write, the zoom percentage, and the folder and tag controls under the title.
- Each page's handwriting area is announced to screen readers as "Handwriting on page N", and the resize handles have a clearer keyboard focus ring.

### Fixed
- Apple Pencil strokes on iPad could stop short when iPadOS took the drag for Scribble, text selection, the magnifier or scrolling.
- Long notes use less canvas memory on iPad, which could blank pages.
- Typed text is saved when its page scrolls out of view.

## [2.0.0] - 2026-10-07

Tala is rebuilt as a stylus-first, local-first notebook that installs as a web app (iPad Safari, Android Chrome) and still ships as a Windows desktop app. It continues from 1.0.0, not from 1.1.0: the 1.1.0 line was not carried forward (see "Not carried over" below).

### Added
- **Pages**: a note is an ordered list of pages; each page owns its typed text and its handwriting.
- **PDF import and markup**: the original PDF is kept and pages render on demand, also offline. **Export annotated PDF** draws ink as vectors over the original pages.
- **Pinch zoom and pan**, an opaque pen that paints wet ink with no lag, a **free-form lasso** (recolour, duplicate), and a **page strip** with thumbnails and drag reordering. Undo survives page switches.
- **Snap to shape**: rest the pen at the end of a stroke and a line, circle/ellipse, rectangle or triangle replaces it.
- **Lecture audio**: record while you write. Audio is saved in 5-second chunks so a crash loses almost nothing, a Wake Lock keeps the screen on, and tapping a stroke made while recording plays the audio from just before it.
- **Bituin**, the star mascot and rule-based study coach: a corner chip after the pen rests, a weekly goal that never resets progress, session wrap-ups, resurfacing of old notes, and a Quiet mode.
- **Tasks view**: tick tasks across the whole library.
- **Phone layout**: Notes / Tasks / New / Search / profile tab bar, 44 px touch targets, left-handed mirroring.
- **Data safety**: persistent-storage request, Add-to-Home-Screen guide, weekly backup nudge, share-sheet backup on phones and tablets, and a copy of a pre-upgrade library kept in a separate database.
- **`.tala` backups** (zip with `manifest.json`, `backup.json` and blobs). Legacy `.json` backups from versions 1–3 still import. Backups carry lecture rows and study days but not audio; each lecture has its own "Save audio".
- Experimental, off by default: handwriting search using the browser's built-in recogniser (ChromeOS and some Android; not iPad Safari).
- New app icon (star with pencil, pencil on the left) for web, iOS, Android and desktop.
- **First-run onboarding and start screens**: a two-column welcome on tablet and desktop, three tips at the end of setup, a start list (New note, Import a PDF, Add a folder) when the library is empty, and "Pick up where you left off" when it is not.
- **Week constellation** in the sidebar: one star per study day this week, joined as the week fills. Missing a day costs nothing.
- **Catalogue numbers** (№ 001, № 002, …) on every note, and note lists grouped by day (Pinned, Today, Yesterday, This week, Earlier).
- Home shows the tasks still open across notes; tick them there or jump to the note.
- Profile menu in the sidebar (edit profile, change picture, Quiet mode, back up now) with the last backup time.
- Search-engine and social-sharing metadata, `robots.txt`, `sitemap.xml` and a share image for tala.lorenzmalabanan.com.

### Changed
- **New look, built for tablet and desktop first**: colours taken from the app icon (forest-green sidebar, star-yellow New note, white pages on a light green dotted ground, dark mode to match), one typeface (Hanken Grotesk) instead of handwriting fonts, and plain line icons instead of doodles.
- **Calmer editor**: a Type | Write switch and a Record button in the header; the pen tools sit in a dock on the page's edge (mirrored for left-handed use, a bottom row on phones) instead of a bar above the text. Switching modes never moves the text under your handwriting.
- The note list's density (comfortable, compact, grid) moved into the Sort menu. Pinned and Recent left the sidebar; pinned notes head All Notes and both views stay in the command palette.
- Keyboard hints read ⌘ on Mac and iPad and Ctrl elsewhere.
- Database schema v5 (additive; upgrades from v2 and v3 are tested). One library module is now the only writer of note data, with optimistic updates and rollback on a failed write.
- The service worker now precaches the pdf.js worker, so PDF import works offline.
- Release workflow checks that the tag matches the app version, runs tests, and publishes the changelog section as the release notes.

### Fixed
- Opening a note autosaved it (bumping its modified time and wiping a PDF page's text layer).
- Ink on page 2 or later was mistaken for orphaned ink and created ghost notes.
- A note with ink only on a later page looked empty and was never saved; emptying a saved note was not saved.
- Edits are flushed when the tab is hidden or closed.
- PDF import failures now show a message.
- Menus near the right edge of the screen (such as the phone's "You" menu) no longer jump to the left side.

### Not carried over from 1.1.0
DOCX/PPTX/DOC/PPT import, the `.zip` package format (replaced by `.tala` backups, which can still read old backups but not 1.1.0 packages), editable shape handles, and the Draw popover. Pencil double-tap and squeeze are not available in a browser.

## [1.1.0] - 2026-09-13

### Added
- Document import (PDF, DOCX, PPTX, DOC, PPT); annotate PDFs and export them with ink.
- Handwriting gestures (hold to straighten or perfect a shape, scribble to erase) and editable vector shapes.
- Tala package (`.zip`) export and import with SHA-256 validation.
- Floating pen tray for touch and iPad, free-form lasso, ink copy/cut/paste/rotate/recolour, Apple Pencil tilt, hover ring and palm rejection.
- Text font family, size and alignment.

### Fixed
- Bullet and numbered lists render real markers.

## [Rebrand] - 2026-08-26

Shipped in 1.0.0. (An earlier draft of this file numbered it 2.0.0; no such release was ever tagged.)

### Changed
- Complete rebrand from Notely to Tala
- Brand identity: solar gold accent, warm ivory light mode, moonlit dark mode
- Animated sun ↔ moon theme toggle with hand-drawn SVG
- New inline SVG brand mark (hand-drawn sun + sparkle)
- Updated color palette for sunlight/moonlight theme
- Updated onboarding, empty states, and dashboard copy
- Bundle identifier changed to com.lanz.tala

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

Initial release of Tala — a local-first, hand-drawn aesthetic note-taking app.

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
