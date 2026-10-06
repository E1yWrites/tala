# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Tala (package `tala`, repo dir `Notely`): a local-first note-taking PWA (React 19 + Vite + Tiptap + Dexie/IndexedDB + Zustand) with handwriting ink and PDF-page annotation, also shipped as a Tauri v2 desktop app. No backend, no router.

## Commands

```bash
npm run dev          # vite dev server, :5173
npm run build        # tsc --noEmit && vite build → dist/
npm run preview      # serve dist/, :4173
npm run typecheck    # tsc --noEmit (strict, noUnusedLocals/Parameters: unused code fails the build)
npm run app:dev      # Tauri native window (needs Rust + WebKitGTK deps, see README)
npm run app:build    # Tauri installers → src-tauri/target/release/bundle/
```

- There is no linter. `npm test` runs Vitest (`src/**/*.test.ts`, node environment, `fake-indexeddb` under real Dexie: migrations, the library write path, backups, prefs). `npm run test:smoke` (`scripts/smoke.mjs`) and `npm run test:e2e` (`scripts/pages-e2e.mjs`: per-page text, PDF import/render offline, `.tala` round trip, v1/v3 upgrades in a real browser) are Playwright-core flows against a **running `npm run preview`** on :4173 (override with `SMOKE_URL`); build first. Their headers note the `LD_LIBRARY_PATH` needed for the headless shell. Each is one end-to-end flow, so there is no single-test selection. `scripts/layout-audit.mjs` and `scripts/visual-qa.mjs` follow the same preview-first pattern.
- Pushing a `v*` tag runs `.github/workflows/release.yml`, which builds the Windows Tauri installers and a `SHA256SUMS` file (no Linux/macOS job despite the README download table).

## Gotchas

- The PWA service worker precaches `**/*.{js,mjs,css,html,ico,png,svg,woff,woff2}`; keep `mjs` in that glob or the pdf.js worker is not cached and PDF import fails offline. `vite.config.js`, `vite.config.d.ts` and `*.tsbuildinfo` are untracked and gitignored: if `vite.config.js` reappears (tsc emitting `tsconfig.node.json`), delete it, because Vite loads `.js` before `.ts` and the PWA plugin would silently vanish.
- `lucide-react` is aliased to `src/lib/lucideShim.tsx`, which serves hand-drawn `react-doodle-icons` glyphs and falls back to real lucide icons. Keep importing from `lucide-react` as usual, but a new icon name has to be mapped in the shim.
- `@/` → `src/`. Tailwind colors are RGB-triplet CSS variables defined in `src/index.css` (`darkMode: 'class'`, toggled on `<html>` by `applyThemeToDom` in `settingsStore.ts`), so prefer the semantic tokens (`bg-canvas`, `text-ink`, …) over per-component `dark:` overrides.
- `README.md` is partly stale: its architecture section says repositories are the only code touching IndexedDB (it is `src/library/` now, see below), and it predates pages/ink/PDF.

## Architecture

**Library (`src/library/`) is the only code that touches note data.** `notes.ts` is the single writer of `notes`, `pages`, `inkDocs`, `blobs` and `pdfs` (create/duplicate/delete cascades, page ops, `saveInk`, `savePageContent`, `flush`). `snapshot.ts` holds `LIBRARY_TABLES` and drives `dump`/`restore`/`wipe`; `boot.ts` is `load`/`bootApp`/`hydrateAll`; `references.ts` repairs dangling folder/tag links and runs the folder/tag delete cascades; `safety.ts` copies a pre-v4 library into a separate `tala-safety` database before the upgrade; `migrate.ts` is the pure v4 upgrade shared by Dexie and old-backup restore. Components call library functions (`createNote`, `patchNote`, `trashNotes`, ...) directly; `noteStore`/`pageStore` are plain state and have no actions. Only `references.ts` and `notes.ts` call `useNoteStore.setState`/`usePageStore.setState`.

**Write path.** Library calls update the stores optimistically, then persist through one serialized queue (DB order == call order). A failed write rolls its change back and `toast.error`s. A note with no title, no page text and no strokes on any page is a scratch card: memory-only until it earns content, then written whole in one transaction; a note already on disk is always written, even if emptied. Ink bytes are written immediately; only the note-row `updatedAt` touch-up is debounced (800 ms per page) and flushed on `visibilitychange`/`pagehide`.

**Boot.** `App` calls `bootApp()` (`library/boot.ts`) behind the splash screen: `keepSafetyCopy()` (before anything opens Dexie), then `load()`, which reads only notes, folders, tags, pages and inkDocs, repairs references, revives ink whose note row never landed, and fills the stores. Blobs, PDFs and (later) recordings are never loaded at boot; `useBlobUrl` and `loadPdf` fetch them on demand. `hydrateAll()` re-runs `load()` after import/restore, and the `tala:external-sync` window event tells an open editor to resync. Navigation is state, not routes: `uiStore.activeView` + `selectedNoteId` drive the responsive three-pane `AppShell`.

**Schema changes touch several places.** `db.ts` is versioned (v1 notes/folders/tags/settings; v2 ink split into `inkDocs`; v3 `parentId`, `pages`, `pdfs`; v4 page text + `blobs`). v3 never shipped; real users are on v2. There is no downgrade path, so migrations stay additive and are tested (`library/migrate.test.ts` seeds raw old databases). A new table needs a new `this.version(n)`, an entry in `LIBRARY_TABLES` (dump/restore/wipe follow it), the cascades in `library/notes.ts` (`deleteForever`, `clearAll`), and `utils/exportImport.ts` parsing (`parseBackup` coerces and drops malformed entries before anything touches the DB).

**Note / Page / Ink model** (easy to get wrong):
- A Note is a title, folder/tags/flags and an ordered list of `PageRecord`s (`usePageStore.pagesByNote`). **Each Page owns its Tiptap `content` and plain `text`** (the editor is keyed by page id). `Note.content` is legacy: copied to page 1 by the v4 upgrade, never written again, ignore it.
- Ink lives in the `inkDocs` table, mirrored in `useNoteStore.inkDocs`, keyed by **page id**, even though the record field is named `noteId`. The page whose id equals the note id is the legacy "page 1" (created that way, remapped by `duplicateNote`); after reordering it need not be first.
- PDF import (`library/pdfImport.ts`) keeps the original bytes in `blobs` (`PdfRecord.blobId`), stores per-page size and text layer, and pages render on demand from the original (`PageBackground.tsx`). Pages imported before v4 carry a raster in `backgroundBlobId`. Blobs are shared between a PDF note and its duplicates and are deleted when no page or PDF references them.
- A scratch card never reaches IndexedDB (`isEmptyNote` in `library/notes.ts`).

**Backups** are `.tala` zips (`manifest.json` + `backup.json` + `blobs/<id>` entries) or legacy `.json` (versions 1-3); old backups are upgraded to the page model on restore. Device-local prefs (pen, sidebar, reading layout) live in `store/prefsStore.ts` (zustand `persist`, key `tala:prefs`); anything that belongs in a backup must go in a Dexie table instead.

**UI plumbing.** Modals go through `uiStore.modalStack` + `ModalHost` (singleton kinds dedupe); standalone `<Modal standalone>` overlays call `pushLocalOverlay` so global hotkeys and Esc (`hooks/useHotkeys.ts`) know a dialog is open. `NoteEditor.tsx` (~1k lines) hosts Tiptap and the ink stack (`ink/InkLayer`, `PenBar`, `PenPalette`). Tiptap's `editor.setEditable` emits `update` unless told not to: keep the `false` argument or opening a note autosaves it.

**Desktop.** `src-tauri` wraps the same `dist/` (identifier `com.lanz.tala`; data lives in the webview's IndexedDB). Vite `base: './'` keeps the build working under `file://` and `tauri://`.
