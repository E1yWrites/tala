<p align="center">
  <img src="assets/tala-banner.jpg" alt="Tala — Pagtatala, made simple." width="100%" />
</p>

<p align="center">
  <img src="public/app-icon.png" alt="Tala logo" width="96" />
</p>

<h1 align="center">Tala</h1>

<p align="center">
  <strong>Pagtatala, made simple.</strong><br/>
  A local-first notebook for typed notes, handwriting, PDF annotation and the small
  records of daily life: tasks, events, money, habits and workouts.
</p>

<p align="center">
  <a href="https://tala.lorenzmalabanan.com/"><img src="https://img.shields.io/badge/Try%20it-tala.lorenzmalabanan.com-1f2937?logo=googlechrome&logoColor=white" alt="Live app" /></a>
  <a href="https://github.com/E1yWrites/tala/releases/latest"><img src="https://img.shields.io/github/v/release/E1yWrites/tala?label=release" alt="Latest release" /></a>
  <a href="https://github.com/E1yWrites/tala/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/E1yWrites/tala/ci.yml?label=CI" alt="CI" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/E1yWrites/tala" alt="MIT license" /></a>
  <a href="https://github.com/E1yWrites/tala/stargazers"><img src="https://img.shields.io/github/stars/E1yWrites/tala?style=flat" alt="Stars" /></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/React-19-149eca?logo=react&logoColor=white" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5.6-3178c6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/Vite-6-646cff?logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tiptap-3-0f172a?logo=tiptap&logoColor=white" alt="Tiptap" />
  <img src="https://img.shields.io/badge/Dexie-IndexedDB-f59e0b" alt="Dexie / IndexedDB" />
  <img src="https://img.shields.io/badge/Zustand-5-433e38" alt="Zustand" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-3-06b6d4?logo=tailwindcss&logoColor=white" alt="Tailwind CSS" />
  <img src="https://img.shields.io/badge/Tauri-2-24c8db?logo=tauri&logoColor=white" alt="Tauri 2" />
  <img src="https://img.shields.io/badge/Capacitor-8-119eff?logo=capacitor&logoColor=white" alt="Capacitor 8" />
  <img src="https://img.shields.io/badge/Vitest-5-6e9f18?logo=vitest&logoColor=white" alt="Vitest" />
  <img src="https://img.shields.io/badge/Playwright-e2e-2ead33?logo=playwright&logoColor=white" alt="Playwright" />
  <img src="https://img.shields.io/badge/PWA-offline-5a0fc8?logo=pwa&logoColor=white" alt="PWA" />
</p>

---

No account, no server, no tracking. Notes live in your browser's IndexedDB, work
offline, and leave your device only when *you* export them.

## Features

- **Pages**: a note is an ordered list of pages, each with its own typed text and handwriting; continuous scroll, page strip, templates.
- **Ink**: pressure-aware pen, highlighter and pencil, lasso, undo, zoom, snap-to-shape, wet-ink rendering.
- **PDF**: import and annotate pages, export a note back to PDF (ink as vector paths).
- **Lecture audio**: record while you write; tap a stroke to replay what was said.
- **Pagtatala entries**: type `P150 lunch gcash`, `@ thu 2pm dentist`, `[ ] essay due fri` or `✓ water 3` and the page becomes the record. English and Taglish dates.
- **Planner**: Today, Upcoming, Tasks, Money (safe to spend), Habits and Workouts, all re-read from your lines. No separate database.
- **Organize**: folders, tags, stars, pins, archive, trash, instant search, command palette.
- **Your data**: `.tala` zip backups (merge or replace), device-only storage, light/dark themes.

## Try it

Open **<https://tala.lorenzmalabanan.com/>** and install it from your browser (iPad Safari, Android Chrome, desktop Chrome/Edge).

Windows installers are on the [Releases](https://github.com/E1yWrites/tala/releases/latest) page. They are not code-signed: check them against the `SHA256SUMS` file attached to each release.

```bash
sha256sum -c SHA256SUMS
```

## Develop

Node 18+ (CI uses 20).

```bash
git clone https://github.com/E1yWrites/tala.git
cd tala
npm ci
npm run dev        # http://localhost:5173
npm run typecheck  # strict; unused code fails
npm test           # Vitest (fake-indexeddb)
npm run build      # typecheck + production build -> dist/
npm run preview    # http://localhost:4173
npm run test:e2e   # Playwright flows against a running preview (build first)
```

### Desktop (Tauri v2)

```bash
# Debian/Ubuntu prerequisites
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

npm run app:dev     # native window with HMR
npm run app:build   # installers -> src-tauri/target/release/bundle/
```

An iOS build via Capacitor lives in `ios/` and is dormant until App Store launch.

## How it is put together

`src/library/` is the only code that writes note data. Stores are plain state, and library calls update them optimistically, then persist through one serialized queue. Details, gotchas and the data model are in [CLAUDE.md](CLAUDE.md); design decisions are in [docs/adr](docs/adr).

## Contributing and security

Issues and pull requests are welcome, see [CONTRIBUTING.md](CONTRIBUTING.md). To report a vulnerability, see [SECURITY.md](SECURITY.md). Privacy: [public/privacy.html](public/privacy.html).

## License

[MIT](LICENSE) © 2026 e1yu
