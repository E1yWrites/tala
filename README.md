# Notely

**Capture ideas. Keep moving.**

A fast, local-first note-taking app for students and makers. Everything lives in your
browser — no account, no server, no tracking. Your notes work offline and stay on
your device until *you* export them.

Built with React 19 + TypeScript, a Tiptap rich-text editor, Zustand stores, and an
IndexedDB (Dexie) persistence layer behind a swappable repository API.

---

## Quick start

```bash
npm install
npm run dev        # start dev server (http://localhost:5173)
npm run build      # typecheck + production build → dist/
npm run preview    # serve the production build (http://localhost:4173)
npm run typecheck  # tsc --noEmit
```

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
- **Templates** — lecture notes, meeting notes, to-do list, journal, brain dump, code notes…
- **Organize** — folders, colored tags, favorites, pins, archive; sort & density controls;
  grid or list layout; filter by tag / favorites
- **Instant search** — spotlight modal over titles, body text, tags and folders with highlighting
- **Command palette** (`Ctrl+Shift+P`) — jump anywhere, run any action
- **Trash with restore** — soft-delete notes or the whole trash; archive is one keystroke away
- **Distraction-free mode** — collapse everything but the editor
- **Light / dark / auto theme**, persisted before first paint (no flash)
- **Responsive** — three-pane desktop → drawer tablet → single-pane mobile with bottom nav
- **Keyboard-first** — see below
- **Data ownership** — export/import JSON backups (merge or replace), storage usage readout

### Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `Ctrl/⌘ N` · `Alt N` | New note (template picker) |
| `Ctrl/⌘ K` · `Ctrl/⌘ ⇧ F` | Search notes |
| `Ctrl/⌘ ⇧ P` | Command palette |
| `Ctrl/⌘ S` | Force save |
| `Ctrl/⌘ ⇧ D` | Toggle dark mode |
| `Ctrl/⌘ ,` | Settings |
| `/` | Focus list search |
| `Esc` | Close dialog → exit focus mode |
| `Ctrl B` / `I` / `U` / `E` | Bold / italic / underline / inline code |

*(Some browsers reserve `Ctrl N`; use `Alt N` there.)*

## Architecture

```
src/
├── components/
│   ├── Dashboard/HomeView      # stats, pinned/recent rows, quick actions
│   ├── Modals/*                # template picker, spotlight search, palette, share…
│   ├── NoteEditor/*            # Tiptap setup, toolbar, placeholder, header
│   ├── NoteList/*              # list/grid panel, rows, per-note menus
│   ├── Sidebar/                # nav tree, folders, tags, collapse, profile
│   ├── UI/                     # Button, Modal, DropdownMenu, Tooltip, TagChip…
│   └── layout/                 # AppShell (responsive panes), MobileNav
├── database/
│   ├── db.ts                   # Dexie schema (notes/folders/tags/settings)
│   ├── hydration.ts            # DB → stores bootstrap (+ first-run demo seed)
│   └── repositories/           # THE ONLY code touching IndexedDB.
│                               # Swap for a REST backend without touching UI.
├── data/                       # defaults, templates, seed content, doc builders
├── hooks/                      # useMediaQuery, useHotkeys
├── pages/                      # HomePage, LibraryPage (+ presets), SettingsPage
├── store/                      # Zustand: notes, folders, tags, settings, ui
├── types/models.ts             # domain models — single source of truth
└── utils/                      # cn, dates, doc, search, markdown, image, backup
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

- Bulk multi-select actions in note lists
- Service-worker installability for true offline shell caching
- Note backlinks / wiki-links, export single note as PDF
