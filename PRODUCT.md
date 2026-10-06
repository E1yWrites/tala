# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Installable PWA first: iPadOS Safari home-screen app and Android Chrome. The same `dist/` is wrapped by Tauri v2 on desktop (identifier `com.lanz.tala`). No native tablet shells in v1; the browser exposes no Apple Pencil double-tap or squeeze.

## Users

Students. They capture lectures by hand and by keyboard, and mark up slides and PDF handouts, mostly on a tablet with a stylus (iPad, Android). They review on a laptop or phone. The job: take notes during class without friction, annotate what the lecturer shows, and find and revise it all later.

## Product Purpose

A local-first notebook that keeps typed text, handwriting and PDF markup in one place, with no account and no server. Success means ink feels instant, notes are never lost, and studying feels encouraging rather than guilt-driven.

## Positioning

Free and local, no AI in v1, with Bituin the star mascot acting as a rule-based study coach. Competitor pain (subscriptions, free-tier limits, data loss, lag, ads, tracking) is context for decisions, not a claim to make in the UI. Whether any competitor has a mascot is not verified.

## Operating Context

Lecture halls and desks: pen in hand, slides on screen, patchy or no network. Notes live in the webview's IndexedDB on the device; a `.tala` zip backup is the only portability story (no sync service). iPad Safari may evict storage for sites that are not installed, so installing to the home screen and requesting persistent storage matter. Terminology is fixed in `CONTEXT.md` (Note, Page, Ink, Library, Bituin, Session, Study day, Weekly goal, Wrap-up, Quiet mode, Recording, Task, Backup).

## Capabilities and Constraints

- Notes made of Pages; each Page owns its typed text and its Ink. PDF import keeps the original and renders pages on demand, also offline. Folders, tags, search, `.tala` backup and restore, a desktop shell.
- Decided for later phases: pinch zoom, page strip, lasso, snap-to-shape, PDF export, lecture audio with safety nets, a Tasks tab, library thumbnails, a coach loop (weekly goal where missing a day resets nothing; a Study day is 5 minutes of writing or marking up; a Session ends after 10 minutes without writing or when the Note closes).
- Constraints: no backend, no router, no account, no AI in v1, PWA only in v1. Phone navigation is Notes / Tasks / Search plus a large new-note button; Starred lives inside Notes; Settings sits under the profile picture. Tablet and desktop keep sidebar + list + editor.
- Bituin rules: never over the page while writing; only a small corner chip after the pen has paused about 2 seconds; never during a stroke; never takes focus; a global Quiet mode silences reactions and reminders.

## Brand Commitments

- Name: Tala (Tagalog for "star"). Tagline in `package.json`: "Pagtatala, made simple."
- Mascot: Bituin, a yellow star with a green cap that reads TALA. Art in `src/assets/bituin/` (`bituin.png`, `bituin-blink.png`, transparent PNG).
- Voice: English with light Filipino touches. The owner reviews every Filipino line; all Bituin strings live in one file so they can be reviewed together.
- Binding visual constraints already decided by the owner: clean surfaces with doodle accents only; green means actions, gold means Bituin and celebration, blue means ink and links; Inter for UI text, Patrick Hand and Kalam only for accents.

## Evidence on Hand

The two Bituin images. The repository's Playwright flows (`scripts/`) and Vitest suite. No testimonials, ratings, customer names or usage numbers exist; none may be invented.

## Product Principles

1. The pen is sacred: nothing delays, covers or interrupts ink.
2. Never lose notes: data safety outranks features, and the app is plain about where data lives.
3. Encourage, never nag: Bituin cheers; missing a day costs nothing and nothing guilt-trips.
4. Local-first and honest: no account, no hidden server, no claims the app cannot back up.
5. Stylus-first, everything else supported: touch, mouse and keyboard stay fully usable.

## Accessibility & Inclusion

- WCAG AA contrast for text and controls in light and dark, with a visible focus indicator on every control.
- Left-handed writing: pen toolbars and palm-rejection layouts can be mirrored.
- Full desktop keyboard operation; the existing hotkeys keep working.
- Quiet mode is a product setting; `prefers-reduced-motion` is honoured as baseline craft even though it was not selected as a standalone requirement.
