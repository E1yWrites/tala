# Tala

<img width="2048" height="1152" alt="image" src="https://github.com/user-attachments/assets/c1371364-4f2c-45da-affe-4d1784cee5f5" />

**Pagtatala, made simple.**

A fast, local-first note-taking app built around pagtatala — the Filipino act of recording. Sun by day, moon by night.

No account, no server, no tracking. Your notes work offline and stay on your device
until *you* export them — in the browser or as a native desktop app.

Built with React 19 + TypeScript, a Tiptap rich-text editor, Zustand stores, and an
IndexedDB (Dexie) persistence layer behind a swappable repository API.

---

## Download

Pre-built installers are available on the [Releases](https://github.com/E1yWrites/tala/releases) page.

| Format | File | Best for |
| --- | --- | --- |
| AppImage | `Tala_1.0.1_amd64.AppImage` | Any Linux distro (no install needed) |
| .deb | `Tala_1.0.1_amd64.deb` | Debian, Ubuntu, Pop!_OS, Linux Mint |
| .rpm | `Tala-1.0.1-1.x86_64.rpm` | Fedora, RHEL, openSUSE |

### Verify your download

Each release includes SHA-256 checksums. After downloading, verify the file integrity:

```bash
# Download the checksum file from the release page, then:
sha256sum -c SHA256SUMS
```

Or verify a single file manually:

```bash
sha256sum Tala_1.0.1_amd64.AppImage
# Compare the output hash against the one listed in SHA256SUMS
```

**Browser security notes:**
- Chromium-based browsers (Chrome, Edge, Brave) may show a "Dangerous file" warning for `.AppImage` and `.deb` files. This is a generic warning for all executables downloaded from the internet — click **Keep** to proceed.
- Firefox may show a similar warning on the downloads panel. Click the file and select **Allow** to keep it.
- The installers are not code-signed (code signing requires a paid certificate from a Certificate Authority). Verify the SHA-256 checksum to confirm the file has not been tampered with.

### Install

```bash
# AppImage (any distro)
chmod +x Tala_1.0.1_amd64.AppImage
./Tala_1.0.1_amd64.AppImage

# Debian / Ubuntu
sudo dpkg -i Tala_1.0.1_amd64.deb

# Fedora / RHEL
sudo rpm -i Tala-1.0.1-1.x86_64.rpm
```

---

## Quick start (development)

```bash
git clone https://github.com/E1yWrites/tala.git
cd tala
npm install
npm run dev        # start dev server (http://localhost:5173)
npm run build      # typecheck + production build → dist/
npm run preview    # serve the production build (http://localhost:4173)
npm run typecheck  # tsc --noEmit
```

## Desktop app (Tauri v2)

The same web app wrapped in a native shell (system WebKitGTK, no bundled Chromium).
Notes persist in the webview's IndexedDB profile keyed by the `com.lanz.tala` identifier.

```bash
# one-time prerequisites (Debian/Ubuntu)
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

npm run app:dev     # native window with HMR (starts vite itself)
npm run app:build   # typecheck + build + release compile → installers
```

Build artifacts land in `src-tauri/target/release/bundle/`:
`.deb`, `.rpm` and `.AppImage` (Linux). The window is 1100x720 (min 940x600),
centered, with the doodle brand icon. External `http(s)`/`mailto:` links open in
the system browser via the opener plugin; on the web they fall back to a new tab.

Rust-side config lives in `src-tauri/` (`tauri.conf.json`, `Cargo.toml`,
capabilities in `src-tauri/capabilities/`).

### Smoke test (optional)

A headless end-to-end check of boot, seeding, editing, search, persistence,
theming and the mobile layout:

```bash
npm i -D playwright-core && npx playwright-core install chromium --only-shell
npm run preview &            # keep it running
node scripts/smoke.mjs       # needs system libs: libnss3 libnspr4 libasound2
```

## Features

- **Dashboard home** — greeting, live stats, quick actions, pinned & recently-edited rows
- **Rich editor** — headings, lists (incl. checkboxes), quotes, code blocks with copy,
  links, images (upload / paste / drag), inline markdown as you type, word count, saved indicator
- **Templates** — lecture notes, meeting notes, to-do list, journal, brain dump, code notes...
- **Pen presets** — six named writing styles (Marker, Brush Pen, Pencil, Fine Pencil, Highlighter, Ballpoint) with inline width dots
- **Multi-select** — batch trash, delete forever, and selection across all surfaces (live, archive, trash)
- **Long-press preview** — floating card with note metadata, tags, task progress, and quick actions
- **Organize** — folders, colored tags, favorites, pins, archive; sort & density controls;
  grid or list layout; filter by tag / favorites
- **Instant search** — spotlight modal over titles, body text, tags and folders with highlighting
- **Command palette** (`Ctrl+Shift+P`) — jump anywhere, run any action
- **Trash with restore** — soft-delete notes or the whole trash; archive is one keystroke away
- **Distraction-free mode** — collapse everything but the editor
- **Light / dark / auto theme**, persisted before first paint (no flash)
- **Responsive** — three-pane desktop -> drawer tablet -> single-pane mobile with bottom nav
- **Keyboard-first** — see below
- **Data ownership** — export/import JSON backups (merge or replace), storage usage readout

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl/Command N` / `Alt N` | New note (template picker) |
| `Ctrl/Command K` / `Ctrl/Command Shift F` | Search notes |
| `Ctrl/Command Shift P` | Command palette |
| `Ctrl/Command S` | Force save |
| `Ctrl/Command Shift D` | Toggle dark mode |
| `Ctrl/Command ,` | Settings |
| `/` | Focus list search |
| `Esc` | Close dialog / exit focus mode / exit multi-select |
| `Ctrl B` / `I` / `U` / `E` | Bold / italic / underline / inline code |

*(Some browsers reserve `Ctrl N`; use `Alt N` there.)*

## Architecture

```
src/
+-- components/
|   +-- Dashboard/HomeView      # stats, pinned/recent rows, quick actions
|   +-- Modals/*                # template picker, spotlight search, palette, share...
|   +-- NoteEditor/*            # Tiptap setup, toolbar, ink layer, pen palette
|   +-- NoteList/*              # list/grid panel, rows, per-note menus, preview card
|   +-- Sidebar/                # nav tree, folders, tags, collapse, profile
|   +-- UI/                     # Button, Modal, DropdownMenu, Tooltip, TagChip...
|   +-- layout/                 # AppShell (responsive panes), MobileNav
+-- database/
|   +-- db.ts                   # Dexie schema (notes/folders/tags/settings)
|   +-- hydration.ts            # DB -> stores bootstrap
|   +-- repositories/           # THE ONLY code touching IndexedDB.
|                               # Swap for a REST backend without touching UI.
+-- data/                       # defaults, templates, seed content, doc builders
+-- hooks/                      # useMediaQuery, useHotkeys, useLongPress
+-- pages/                      # HomePage, LibraryPage (+ presets), SettingsPage
+-- store/                      # Zustand: notes, folders, tags, settings, ui
+-- types/models.ts             # domain models -- single source of truth
+-- utils/                      # cn, dates, doc, search, markdown, image, backup
```

Key decisions:

- **Optimistic updates everywhere**: stores mutate first, IndexedDB persists after;
  failures roll the state back and toast.
- **Autosave with debounce** in the editor plus `Ctrl S` force-save; a `beforeunload`
  flush guards against closing mid-debounce.
- **Search scores** title > tag > folder > body, recomputed in-memory per keystroke.
- **Theme is applied pre-React** by an inline script reading `localStorage`, so dark
  mode never flashes.

## Roadmap ideas

- Service-worker installability for true offline shell caching
- Note backlinks / wiki-links, export single note as PDF
- Cross-device sync

## License

[MIT](LICENSE) -- (c) 2026 e1yu
