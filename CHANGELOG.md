# Changelog

All notable changes to Tala are documented here.

## [Unreleased]

### Fixed
- **Bullet and numbered lists render real markers.** Tailwind's preflight reset (`ul, ol { list-style: none }`) was never overridden by the editor styles, so lists showed as bare indentation even though the document schema was correct. Markers (disc/circle/square, decimal/alpha/roman for nesting) are restored in both themes, and lists no longer use `display: flex`, which some engines use as an excuse to drop markers.
- Removed a duplicate `underline` extension registration (StarterKit 3 already includes it).

### Added
- Windows releases now include a standalone `Tala_x64.exe` asset in addition to installer bundles, with SHA-256 checksums published alongside it.
- **Document import** (New note → Import document, command palette, or drag & drop): PDF, DOCX, PPTX, DOC, PPT.
  - PDF: page model rendered lazily by pdf.js; zoom, thumbnails, page reorder/rotate/delete, ink on every page (same pen tools, undo/redo, lasso, eraser), typed text notes, and **Export annotated PDF** (pdf-lib writes ink as vectors).
  - DOCX/PPTX: **Automatic / Import as editable / Preserve appearance**. Editable text via mammoth / pptxtojson through the editor's own schema; preserved layout via docx-preview / positioned slide rendering, shown in a sandboxed frame with a "Switch to editable text" escape hatch. The original file is always attached and downloadable.
  - DOC/PPT (legacy binary): kept as an attachment with an explanation — no browser-side converter exists.
- **Handwriting gestures**: hold-to-straighten and hold-to-perfect-shape (line, arrow, ellipse, rectangle, triangle, polygon), scribble erase and scratch-out, tap-to-select recognised shapes. Configurable in the Draw popover (on/off, hold delay, strictness). Diagnostics via the `tala:gesture` window event.
- **Editable shapes**: recognised shapes are vector objects with corner resize handles (Shift keeps proportions), a rotate handle (Shift snaps 15°), larger/smaller, outline width, outline colour and fill.
- **Tala package (.zip)**: Share → "Tala package" exports a note with handwriting, documents and annotations; Settings → Export library exports everything. Import validates the manifest, entry paths, referenced files and SHA-256 hashes before writing anything, and never overwrites local notes unless asked (keep both / replace / skip).
- Unit + integration tests (vitest, jsdom, fake-indexeddb) for lists, documents, gestures, shapes, selection, packages and the store; smoke test covers list markers and PDF import.
- **Floating pen tray for touch/iPad**: draggable, remembers its place across portrait/landscape, fades while the pen is down, wraps selection actions on phones.
- **Lasso selection**: free-form loop selects strokes (replaces the rectangle marquee); tap and Shift-tap still pick single strokes.
- **Ink selection actions**: duplicate, copy/cut/paste (session clipboard, works across notes), rotate (±15°/±90°), recolour, select all.
- **Apple Pencil / stylus**: tilt-driven pencil width, hover ring under a lifted pen, palm rejection while the pen is down, finger draws-or-scrolls setting, pressure/tilt/hover toggles with live detection status. Double-tap and squeeze actions are configurable only when a native bridge dispatches `tala:pencil-gesture` — never faked in the browser.
- Per-stroke opacity for pencil and highlighter.
- Text font family, size and alignment (Tiptap TextStyle/FontFamily/FontSize/TextAlign).
- Shortcuts: `Ctrl .` toggles drawing; while drawing `1/2/3` tools, `E` eraser, `L` lasso, `[`/`]` size, `Ctrl C/X/V/D` on selected ink.

### Changed
- Database schema v3 adds `documents`, `assets`, `pageInk` tables and an optional `documentId` on notes; existing data is untouched.
- The JSON backup is now labelled legacy: it is text-only and skips imported documents. The .zip package is the complete format.
- **Adaptive editor toolbar**: the in-column formatting bar and the separate pen pill are replaced by one header row that follows the activity — text formatting (Aa style/font/size/alignment popover, strokes, lists, insert), drawing (Draw control, eraser, lasso, undo/redo, done) or ink selection (duplicate, copy/cut/paste, rotate, recolour, delete). Narrow panes get a slim scrollable row instead.
- **One Draw control**: pen, pencil and highlighter no longer sit in the header. The Draw control shows the live tool and ink colour and opens the Draw popover.
- **Draw popover** replaces the radial pen wheel: tools, style presets, colours, six sizes, opacity (pencil/highlighter), eraser mode, recently used combinations and stylus settings in one anchored panel. Right-click on the canvas still opens it at the cursor.
- Note actions (pin, favourite, share, reading layout, distraction-free) moved from header icons into the note menu.

## [2.0.0] - 2026-08-26

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
