# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable PWA first: iPadOS Safari home-screen app and Android Chrome. The same `dist/` is wrapped by Tauri v2 on desktop (identifier `com.lanz.tala`). No native tablet shells in v1; the browser exposes no Apple Pencil double-tap or squeeze.

## Users

Anyone who wants a record of their day without the work, students first: people who log spending, workouts, habits and plans by just writing a line, and will not fill in a form, pick a category or press through menus; the same people capture lectures by hand and by keyboard and mark up slides and PDFs, often on a tablet with a stylus. The job: write it once, and find it organized later. Ease of use outranks options: if a thing can be read from what was typed, it is never asked for.

## Product Purpose

A local-first tracker and notebook: Isip turns lines typed about the day (`lunch 150`, `dentist fri 2pm`, `water 3`, `bench 40kg 3x10`) into money, plans, habits and workouts, with no marker, form or category to choose; notes keep typed text, handwriting and PDF markup in the same app. No account and no server. Success means ink feels instant, notes are never lost, and studying feels encouraging rather than guilt-driven.

## Positioning

Free and local, no AI in v1 (Isip is rule-based and runs on the device, so 'no AI in v1' still holds), with Bituin the star mascot acting as a rule-based study coach. Competitor pain (subscriptions, free-tier limits, data loss, lag, ads, tracking) is context for decisions, not a claim to make in the UI. Whether any competitor has a mascot is not verified.

## Operating Context

Lecture halls and desks: pen in hand, slides on screen, patchy or no network. Notes live in the webview's IndexedDB on the device; a `.tala` zip backup is the only portability story (no sync service). iPad Safari may evict storage for sites that are not installed, so installing to the home screen and requesting persistent storage matter. Terminology is fixed in `CONTEXT.md` (Note, Page, Ink, Library, Bituin, Session, Study day, Weekly goal, Wrap-up, Quiet mode, Recording, Task, Backup, Isip, Entry, Reading, Item, Workout, Today, Upcoming, Account, Safe to spend, Habit, Strength, Day off, Lift).

## Capabilities and Constraints

- Notes made of Pages; each Page owns its typed text and its Ink. PDF import keeps the original and renders pages on demand, also offline. Folders, tags, search, `.tala` backup and restore, a desktop shell.
- Decided for later phases: pinch zoom, page strip, lasso, snap-to-shape, PDF export, lecture audio with safety nets, a Tasks tab, library thumbnails, a coach loop (weekly goal where missing a day resets nothing; a Study day is 5 minutes of writing or marking up; a Session ends after 10 minutes without writing or when the Note closes).
- Notes are for notes. Isip keeps its own Entries, one typed line each, and Today, Upcoming, Money, Habits and Workouts read them; Tasks also lists the checklist items in Notes. A view's buttons write Entries.
- Constraints: no backend, no router, no account, no AI in v1, PWA only in v1. Phone navigation is Today / Plan / Notes / Search plus a large gold Write button; Plan is the front door to Upcoming, Tasks, Money, Habits and Workouts (a tile on Today opens the same views, and Back returns there); New note sits in the Notes header; Starred lives inside Notes; Settings sits under the profile picture in each header. Tablet and desktop keep sidebar + list + editor; the sidebar groups ISIP above NOTEBOOK, and a planner view takes the whole pane until a line opens its note beside it.
- Bituin rules: never over the page while writing; only a small corner chip after the pen has paused about 2 seconds; never during a stroke; never takes focus; a global Quiet mode silences reactions and reminders.

## Brand Commitments

- Name: Tala (Tagalog for "star", and "a note, a record": talaan, pagtatala). Kept on 2026-10-22 when Tala grew from a notebook into a tracker, because the word already means writing things down. Tagline in `package.json`: "Pagtatala, made simple."; English line: "Write it once, find it organized."
- Mascot: Bituin, a yellow star with a green cap that reads TALA. Art in `src/assets/bituin/` (`bituin.png`, `bituin-blink.png`, transparent PNG).
- Voice: English with light Filipino touches. The owner reviews every Filipino line; all Bituin strings live in one file so they can be reviewed together.
- Visual world (owner decision, 2026-10-07 redesign): only Bituin and the name Tala are pinned. The earlier green/gold/blue roles, Inter, Patrick Hand and Kalam were released; the current world is "Planisphere" (the library as a star atlas), documented in DESIGN.md.

## Evidence on Hand

The two Bituin images. The repository's Playwright flows (`scripts/`) and Vitest suite. No testimonials, ratings, customer names or usage numbers exist; none may be invented.

## Product Principles

1. The pen is sacred: nothing delays, covers or interrupts ink.
2. Never lose notes: data safety outranks features, and the app is plain about where data lives.
3. Encourage, never nag: Bituin cheers; missing a day costs nothing and nothing guilt-trips.
4. Local-first and honest: no account, no hidden server, no claims the app cannot back up.
5. Stylus-first, everything else supported: touch, mouse and keyboard stay fully usable.
6. Write first, Tala organizes: the user never files, tags or picks a category; anything Tala read on its own can be undone in one tap.
7. Type, don't click: the one gold control on every screen is Write, a line can be written from anywhere (Ctrl/⌘ Shift Space, the app-icon shortcut, the phone's centre button), and a view's buttons are shortcuts for lines, never the only way.

## Accessibility & Inclusion

- WCAG AA contrast for text and controls in light and dark, with a visible focus indicator on every control.
- Left-handed writing: pen toolbars and palm-rejection layouts can be mirrored.
- Full desktop keyboard operation; the existing hotkeys keep working.
- Quiet mode is a product setting; `prefers-reduced-motion` is honoured as baseline craft even though it was not selected as a standalone requirement.
