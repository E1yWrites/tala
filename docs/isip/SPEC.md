# Isip: Tala's second mind (implementation spec)

Isip is for people who just want to write. They type a line about their day, such as a workout, a grocery run or a meal, and Tala turns it into organized records. They never pick a category, open a form or file anything.

Isip is separate from note-taking. Notes are for notes; Isip keeps its own Entries and the planner views read only those (plus checklist items in Notes).

> **History.** Draft 1 (2026-10-22) added five tables and an Isip view beside a planner that read the pages. Draft 2 put Isip on the pages instead. This version (owner decisions, 2026-10-22) takes activity logging out of Notes entirely. Pagtatala, the unreleased `feat/pagtatala` work, is reshaped to match. None of it is on `main`, so no user data needs migrating.

## Decisions (locked 2026-10-22)

| Decision | Choice |
|---|---|
| Notes | Note-taking only. The one thing still read from Notes is checklist items (`[ ]`, with their dates and chips) for Tasks, Today and Upcoming |
| Isip | Its own Entries, typed into one capture box. It never reads Notes. No per-Note switch |
| Storage | One Dexie v6 table, `isipEntries`: the text plus the owner's decisions. Readings are worked out from the text on read; nothing parsed is stored |
| Automation | Markers (`P150`, `@ thu 2pm`, `✓ water`) are certain. Unmarked lines are scored: ≥ 0.8 counts, 0.5–0.8 is a "confirm?" chip, below 0.5 nothing |
| Engine | Fully local, rule-based, hand-written rules plus Vitest phrase tables. No network. Cloud AI is a later phase and needs ADR 0003 first |
| Mistakes | One-tap Undo on every reading Isip counted; corrections are saved and win next time; Entries can be edited and deleted |
| Views | The planner views stay (Today, Upcoming, Tasks, Money, Habits, Workouts) under a rail group renamed ISIP. Today lists the day's Entries |
| v1 trackers | Expenses (grocery Items, Food sub-categories), events, habit ticks, lifts. Meals count as Food spending |
| Workouts | A Workout is one day's lifts. No location or time-of-day grouping |
| Out of v1 | Calories and macros, pantry inventory, median training time, creating Tasks from Isip |

## What leaves Notes

All of this is unreleased, so it is removed rather than migrated:

- Reading money, events, ticks and lifts from Pages: `entries/scan.ts` keeps only checklist items. The editor's chips (`components/NoteEditor/entryLines.ts`) and `suggestMarker` cover tasks only. The `at` stamp stays, on task items only.
- The Journal: `Note.journal`, `PageRecord.day`, `library/journal.ts`, the journal parsing in `parseBackup`, and the "today's page" plumbing.
- Lasso → "Turn into…" and `InkDoc.entries`.
- The warning about ₱ lines when a note is trashed.

The pure modules stay and now take Entries as input instead of page lines: `entries/parse.ts` (marker grammar), `dates.ts`, `agenda.ts`, `money.ts`, `habits.ts`, `workouts.ts`. Their tests stay.

## Rules from the existing repo

- `src/library/` is the only code that touches data. `library/isip.ts` is the single writer of `isipEntries` and of Isip's `meta` rows. It uses the write path: optimistic store update, the serialized queue, rollback plus `toast.error`.
- Schema changes are additive: `this.version(6)` in `database/db.ts`, `isipEntries` in `LIBRARY_TABLES` (`library/snapshot.ts`, so dump/restore/wipe follow), `clearAll` in `library/notes.ts`, and coercion in `parseBackup` (`utils/exportImport.ts`, malformed rows dropped). `library/migrate.test.ts` seeds a v5 database and upgrades it.
- Navigation is state (`uiStore.activeView`). No router.
- **The pen is sacred.** Isip never touches the editor or Ink. Capture is its own text field.
- **Encourage, never nag.** Nothing about how often you log. Insights describe and never judge. Quiet mode silences Bituin's Isip mention.
- Isip's strings live in `src/isip/copy.ts`, so the owner can review every Filipino line together, as with `coach/copy.ts`.
- `npm run typecheck` (strict) and `npm test` pass at every phase.

## Vocabulary (CONTEXT.md)

- **Entry** (replaces the old meaning): one line typed into Isip, with the day it counts for. The text is the record; edits re-read it. _Avoid_: record, log, item.
- **Reading**: what Isip takes from an Entry: an expense, an event, a tick or a lift. One Entry can hold several. _Avoid_: log.
- **Item**: one priced thing in a grocery Reading (`eggs 98`).
- **Workout**: the lifts of one day. _Avoid_: session (Session already means writing on a Note).
- **Isip**: the part of Tala that keeps Entries and reads them; also the rail group holding Today, Upcoming, Tasks, Money, Habits and Workouts.
- **Task** (narrowed): a checklist item in a Page's typed text, optionally dated (`[ ] essay due fri`).
- Remove **Journal**. **Lift line** becomes "lift", a kind of Reading. Account, Safe to spend, Habit, Strength, Day off, Due-again, Reminder, Today and Upcoming keep their meaning, read from Entries.

## PRODUCT.md changes

- Users: "Students first: they capture lectures by hand and by keyboard and mark up slides and PDFs, mostly on a tablet with a stylus. Isip widens this to anyone who wants a record of their day without the work: people who log workouts, groceries, meals and spending by just writing a line, and will not fill in a form or pick a category. The job: write it once, and find it organized later."
- Capabilities: replace "The planner reads the pages" with "Notes are for notes. Isip keeps its own Entries, one typed line each, and Today, Upcoming, Money, Habits and Workouts read them; Tasks also lists the checklist items in Notes."
- Product Principles, add: "Write first, Tala organizes: the user never files, tags or picks a category; anything Tala read on its own can be undone in one tap."
- Positioning: "Isip is rule-based and runs on the device, so 'no AI in v1' still holds."
- Terminology list: Entry, Reading, Item and Workout in; Journal and Lift line out.

## Data model (Dexie v6)

| Table | Stores string | Holds |
|---|---|---|
| `isipEntries` | `id, day, createdAt` | `text` (one line), `day` (DayKey it counts for, editable), `createdAt` (epoch ms; relative words count from it), `updatedAt`, `decisions?` |

```ts
interface IsipEntry {
  id: string
  text: string
  day: DayKey
  createdAt: number
  updatedAt: number
  /** The owner's say on a Reading, keyed by the Reading's source text (`span` text), so an edit elsewhere in the line keeps it. */
  decisions?: Record<string, 'dismissed' | 'confirmed'>
}
```

- `meta` row `isip:aliases`: `{ exercise: Record<word, name>, merchant: Record<word, name> }`. Category corrections reuse `money:categories` (`setCategory`). `meta` already travels in backups.
- An edit re-reads the Entry. A decision survives only while its source text is still in the line.
- `day` starts as the capture day, moved by day words in the text (`kahapon`, `yesterday`, through `dates.ts`), and can be changed by hand.
- Boot loads every Entry (they are short lines). If boot time suffers, load a window and read older Entries on demand.
- Backups: `isipEntries` and `meta`. The `.tala` round trip must restore Entries exactly.

## Reader (`src/isip/read.ts`, pure, Vitest)

`read(entry: IsipEntry, ctx: EntryContext & { aliases: IsipAliases; categories: Record<string, string> }): Reading[]`, where a Reading is an existing `Entry`-union value (renamed) plus `span: [from, to]`, `score` and `status`. No DOM, no Dexie, no network. Anything unsure returns nothing (like `canvas/snapShape.ts`).

- A line `parseLine` accepts (markers, `[ ]`-free) is one Reading with score 1.
- Otherwise split into clauses on `.`, `,`, `;`, "then", "tapos" and "and then", keeping spans. A grocery list after `—`, `-` or `:` is one clause.
- Money: `₱150`, `P150`, `150 pesos`, `150php`, `paid 150`, `gastos 200`, `bayad 99`, `1,240`. Reuse `amountOf` and `NOT_MONEY`. `40kg` and `3x10` are never amounts.
- Lifts: the existing `bench 60x5x3 @8` (weight × reps × sets), plus `40kg 3x10` (sets × reps after a weight with a unit), `40 kilos 3x10`, `3 sets of 10`, `12kg x 12`, `bw x 15` (bodyweight = weight 0). Exercise names come from a built-in list plus aliases, with Taglish verbs (`nag-bench`, `nag-squat`) and plurals (`pull ups`, `squats`), mapped to canonical names (`Bench press`, `Pull-up`) so PRs and "last time" match.
- Meals: breakfast/almusal, lunch/tanghalian, dinner/hapunan, merienda/meryenda. Without one of these words no meal is set.
- Place: the words after `sa` or `at` → merchant.
- Delivery: Grab Food, GrabFood, Foodpanda, padeliver → Food › Delivery.
- Groceries: a grocery word (grocery, groceries, palengke, supermarket, puregold, …) followed by item-and-price pairs → one expense with `items`. If they do not add up to a stated total, keep the stated total and set `gap`.
- Categories: `Food` (sub: `Groceries`, `Eating out`, `Coffee/snacks`, `Delivery`), `Transport`, `Bills & load`, `School`, `Shopping`, `Health`, `Fitness`, `Fun`, `Other`. `Groceries` is no longer top-level; a stored choice of `Groceries` reads as Food › Groceries. Keywords first, then corrections (corrections win).
- Status: `dismissed` / `confirmed` from decisions, else `auto` (≥ 0.8) or `suggested` (0.5–0.8). Below 0.5 → dropped.

Hard rules:

- A bare amount with no clue (`spent 500 today`) scores at most 0.79.
- A Reading never holds a number that is not in the line.
- Only `auto` and `confirmed` Readings count in the views.

Phrase table to start from (`src/isip/read.test.ts`):

| Entry | Expected |
|---|---|
| Went to the gym. Bench 40kg 3x10, incline db 12kg x 12. Paid 150 day pass | 2 lifts (auto), ₱150 Fitness (auto) |
| lunch sa jollibee 189 | ₱189 Food › Eating out, lunch, Jollibee (auto) |
| kape 120 | ₱120 Food › Coffee/snacks (auto) |
| grocery sa SM 1,240 — eggs 98, chicken 1kg 220, rice 5kg 290, milk 115 | ₱1,240 Food › Groceries + 4 Items, gap ₱517 |
| spent 500 today | ₱500, suggested, no category |
| padeliver ng milktea 160 | ₱160 Food › Delivery (auto) |
| nag-bench ako 40 kilos 3x8 | Bench press 40 kg, 3 sets × 8 (auto) |
| pull ups bw x 10 | Pull-up, bodyweight, 1 × 10 |
| P150 lunch gcash | ₱150 Food, GCash (marker, score 1) |
| @ thu 2pm dentist | event Thu 2pm (marker, score 1) |
| lunch 150 kahapon | ₱150 Food, lunch; Entry day = yesterday |
| Lecture notes: supply and demand curve | nothing |

Replace and extend these with the owner's 20–30 real lines before the Phase 2 gate.

## UI

- **Capture**: the one `QuickCapture` box saves an Entry (no longer writes to a Page) and keeps its live preview chip. One line per Entry; Enter saves; a paste with several lines makes one Entry per line. It appears where it does today (planner views, command palette) and opens from anywhere with Ctrl+Shift+Space on desktop (free in `hooks/useHotkeys.ts`; check IME toggles on Windows) and from a button beside New on the phone tab bar.
- **Today**: the day's Entries, each with its Readings as chips. A counted chip has Undo (×), which dismisses it. A suggested chip has "confirm?" and Dismiss, and a money suggestion has the category picker. ‹ › arrows and a date move between days. An Entry is edited in place (text, day) and deleted with an Undo toast.
- **Corrections**: tapping a chip opens a small popover (category, exercise name, merchant). Saving writes an alias, or a category choice keyed by the merchant word or else the first word. It never edits the Entry's text.
- **Other views**: Money's month list, Workouts' days and Habits open the Entry behind a line for editing. Habit Done/+1 keeps one `✓ name N` Entry per habit per day and updates its count. On Upcoming, Skip appends `skip <date>` to the event Entry's text, and Done on a due-again item adds a `✓ name` Entry. Done on a checklist Task ticks it in its Note, as now.
- **Search**: the command palette also finds Entries. A result opens Today on that Entry's day.
- **Rail**: the PLANNER group is renamed ISIP. Phone navigation is unchanged apart from the capture button.
- **Reminders**: `!` on event Entries fire as today (`library/reminders.ts`).
- Follow DESIGN.md (Planisphere) and use the semantic tokens. WCAG AA, visible focus, keyboard operable, chips are real buttons with labels ("Don't count: ₱189 Food"), 44 px touch targets on the phone.

## Insights (Phase 3, plain counting)

| View | Insight | Shows after |
|---|---|---|
| Workouts | Usual split per weekday | 3 Workouts on that weekday |
| Workouts | Last weight per exercise | first set |
| Workouts | Top weight per week | 4 weeks |
| Money | Spending by category this month, with Food's sub-categories | first expense |
| Money | Groceries vs eating out vs delivery | 2 weeks of Food Readings |
| Money | Recurring costs (same amount and category, regular gaps) | 3 repeats |
| Money | Grocery item price change | 2 purchases of the item |
| Money | Food spend on gym days vs rest days | 2 weeks |

**Bituin**: one rule in `coach/rules.ts`. The first time an insight unlocks, Bituin mentions it once in the corner chip ("Eggs cost ₱8 more than last time"). The chip describes and never judges, and it stays silent in Quiet mode.

## Phases and gates

One commit per phase on the branch.

| Phase | Scope | Gate |
|---|---|---|
| 1. Separate | Strip page reading from Notes (everything in "What leaves Notes"); the v6 `isipEntries` table and `library/isip.ts`; capture saves Entries (single line, paste splits); Today, Upcoming, Money, Habits and Workouts read Entries through the existing marker grammar; Today's Entry list with day arrows, edit and delete; Habit +1, Skip and Done write Entries; backup and restore; the v5 → v6 test; CONTEXT.md, PRODUCT.md and CLAUDE.md updates; the e2e flows updated | A `.tala` backup with Entries restores exactly; the v5 → v6 upgrade test passes; typecheck, tests and e2e pass |
| 2. Reader | `isip/read.ts` with unmarked scoring and the phrase table; chips with Undo, confirm and Dismiss; corrections and `isip:aliases`; grocery Items; Food sub-categories and Fitness; day words moving `day` | The owner's 20–30 real lines read as expected |
| 3. Organize | The insights; Bituin's mention; Entries in search; the Ctrl+Shift+Space hotkey and the phone capture button; `src/isip/copy.ts` review | Two weeks of the owner's daily use, then it ships |
| 4. Later | ADR 0003 and opt-in cloud for low-score lines only, meal journal, macros | — |

## Prompts for Claude Code

Phase 1:

> Read docs/isip/SPEC.md, CLAUDE.md, CONTEXT.md and PRODUCT.md. Implement Phase 1 only. Run npm run typecheck, npm test and the e2e flows before you finish, and list anything in the spec that conflicts with the code.

Phase 2:

> Read docs/isip/SPEC.md. Implement Phase 2 with the owner's real lines in the phrase table. Run typecheck and tests.

Phase 3:

> Read docs/isip/SPEC.md. Implement Phase 3. All strings in src/isip/copy.ts. Follow DESIGN.md. Run typecheck, tests and the e2e flows.
