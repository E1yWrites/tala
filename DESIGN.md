---
name: Tala
description: "Planisphere: the note library as a star atlas, in the app icon's colours: a forest-green rail, white sheets on a green chart ground, star yellow for stars only."
colors:
  tile-green: "#2e6a3a"
  tile-green-deep: "#23562e"
  tile-green-wash: "#e1efe0"
  rail-forest: "#1f4a2b"
  rail-well: "#275835"
  rail-active: "#2e653d"
  rail-seam: "#2f5e3a"
  rail-text: "#eef6ee"
  rail-muted: "#b7cfba"
  star-yellow: "#f6c845"
  star-wash: "#fdf2cc"
  star-ink: "#5c4300"
  on-star: "#1f1a06"
  ballpoint-blue: "#2a52c9"
  ballpoint-wash: "#e4ebfc"
  marker-red: "#be3428"
  marker-wash: "#fbe7e4"
  chart-ground: "#edf3ec"
  shelf: "#f5f8f4"
  chart-white: "#ffffff"
  hover-well: "#e4ede3"
  control-line: "#7c8e80"
  seam: "#d6e1d4"
  ink: "#14261a"
  ink-muted: "#4b5e50"
  ink-faint: "#57695c"
  night-ground: "#0c150f"
  night-shelf: "#0f1a13"
  night-sheet: "#15221a"
  night-well: "#1d2e23"
  night-seam: "#26382c"
  night-line: "#687d6d"
  night-ink: "#e6f0e7"
  night-muted: "#a8baab"
  night-faint: "#8da091"
  night-green: "#7cc98c"
  night-green-bright: "#9cdaa8"
  night-green-wash: "#1e3625"
  night-on-green: "#0a1e10"
  night-rail: "#0a180f"
  night-rail-well: "#122418"
  night-rail-active: "#1b3222"
  night-star-wash: "#3a3215"
  night-star-ink: "#f6d982"
  night-ballpoint: "#8fb0f5"
  night-red: "#ff8a80"
typography:
  display:
    fontFamily: "'Hanken Grotesk Variable', system-ui, -apple-system, sans-serif"
    fontSize: "30px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "'Hanken Grotesk Variable', system-ui, -apple-system, sans-serif"
    fontSize: "21px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "-0.02em"
  title:
    fontFamily: "'Hanken Grotesk Variable', system-ui, -apple-system, sans-serif"
    fontSize: "14.5px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  body:
    fontFamily: "'Hanken Grotesk Variable', system-ui, -apple-system, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
  body-ui:
    fontFamily: "'Hanken Grotesk Variable', system-ui, -apple-system, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.375
  label:
    fontFamily: "'Hanken Grotesk Variable', system-ui, -apple-system, sans-serif"
    fontSize: "10.5px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.14em"
  catalogue:
    fontFamily: "'Hanken Grotesk Variable', system-ui, -apple-system, sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1.4
    fontFeature: "'tnum' 1"
  meta:
    fontFamily: "'Hanken Grotesk Variable', system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.33
    fontFeature: "'tnum' 1"
  figure:
    fontFamily: "'Hanken Grotesk Variable', system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    fontFeature: "'tnum' 1"
  code:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "0.88em"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  sheet: "4px"
  control: "8px"
  card: "10px"
  surface: "14px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "40px"
components:
  button-new-note:
    backgroundColor: "{colors.star-yellow}"
    textColor: "{colors.on-star}"
    typography: "{typography.title}"
    rounded: "{rounded.card}"
    height: "44px"
  button-primary:
    backgroundColor: "{colors.tile-green}"
    textColor: "{colors.chart-white}"
    rounded: "{rounded.card}"
    padding: "0 16px"
    height: "40px"
  button-primary-hover:
    backgroundColor: "{colors.tile-green-deep}"
  button-primary-sm:
    backgroundColor: "{colors.tile-green}"
    textColor: "{colors.chart-white}"
    rounded: "{rounded.control}"
    padding: "0 12px"
    height: "32px"
  button-subtle:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "0 16px"
    height: "40px"
  button-subtle-hover:
    backgroundColor: "{colors.hover-well}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.card}"
    padding: "0 16px"
    height: "40px"
  button-danger:
    backgroundColor: "{colors.marker-red}"
    textColor: "{colors.chart-white}"
    rounded: "{rounded.card}"
    padding: "0 16px"
    height: "40px"
  segment-type-write:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "36px"
  segment-type-write-active:
    backgroundColor: "{colors.tile-green}"
    textColor: "{colors.chart-white}"
  chip-filter:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "0 10px"
    height: "28px"
  chip-filter-active:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.chart-white}"
  input-search:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 32px 0 36px"
    height: "40px"
  rail-nav-item:
    backgroundColor: "{colors.rail-forest}"
    textColor: "{colors.rail-text}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "36px"
  rail-nav-item-active:
    backgroundColor: "{colors.rail-active}"
    textColor: "{colors.rail-text}"
  note-row:
    backgroundColor: "{colors.shelf}"
    textColor: "{colors.ink}"
    typography: "{typography.title}"
    rounded: "{rounded.control}"
    padding: "10px 12px"
  note-row-hover:
    backgroundColor: "{colors.hover-well}"
  note-row-selected:
    backgroundColor: "{colors.tile-green-wash}"
  week-constellation:
    backgroundColor: "{colors.rail-well}"
    textColor: "{colors.rail-text}"
    rounded: "{rounded.card}"
    padding: "12px 12px 10px"
  pen-dock:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.surface}"
    padding: "6px"
    width: "52px"
  page-sheet:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.sheet}"
    padding: "24px 40px 96px"
    width: "720px"
  bituin-card:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px"
  planner-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.full}"
    padding: "0 14px"
    height: "36px"
  planner-tab-hover:
    backgroundColor: "{colors.hover-well}"
    textColor: "{colors.ink}"
  planner-tab-active:
    backgroundColor: "{colors.tile-green}"
    textColor: "{colors.chart-white}"
  planner-card:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
  planner-row:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink}"
    padding: "0 14px"
    height: "44px"
  safe-to-spend:
    backgroundColor: "{colors.chart-white}"
    textColor: "{colors.ink}"
    typography: "{typography.headline}"
    rounded: "{rounded.card}"
    padding: "14px 16px"
  habit-done:
    backgroundColor: "transparent"
    textColor: "{colors.ink-faint}"
    rounded: "{rounded.full}"
    size: "36px"
  habit-done-active:
    backgroundColor: "{colors.tile-green}"
    textColor: "{colors.chart-white}"
  habit-count:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "0 10px"
    height: "36px"
---

# Design System: Tala

## Overview

**Creative North Star: "Planisphere"**

Tala's library is a star atlas. A forest-green rail, cut from the app icon's tile, is the instrument you steer by; the notes it charts sit on a pale green chart ground, and each page is a white sheet laid on that chart, the loudest thing on screen. The student's week is plotted in the rail as a small constellation: a Study day lights a star, the lit days join with a line, today waits as a dashed ring. Every note carries a catalogue number (№ 024) the way a star carries its entry in a catalogue.

The world is quiet and exact rather than cute. One typeface, Hanken Grotesk, does all the work, with hierarchy made by size and weight alone. Panes are divided by one-pixel seams, not shadows; shadows are kept for things that genuinely float (the pen dock, menus, dialogs). Colour carries meaning: green acts and selects, star yellow marks stars, ballpoint blue is ink, links and focus, red is destructive. Density is a study desk at tablet scale: rows are tight enough to scan a term of notes, controls grow to 44 px under a finger or stylus.

The planner (Today, Upcoming, Tasks, Money, Habits, Workouts) is the same atlas read as a logbook: one frame for all six views, small-caps groups over white seamed cards on the shelf, figures said in sentences rather than shouted in red. Habits plot their week as dots the way the rail plots Study days as stars, and money's remaining days run out as a line of points to the next income day.

The released world (doodle icons, Kalam and Patrick Hand display type, Inter, a scrapbook mood) is retired by owner decision, and the generic grey-card notes shell is refused. Bituin, the star mascot, and the name Tala are the only pinned brand assets.

**Key Characteristics:**
- Forest-green rail (both themes) with pale green text; the one star-yellow New note button sits at its top.
- Green-tinted chart ground with a 24 px coordinate dot grid behind white page sheets (tablet and up).
- Hanken Grotesk Variable only; spaced small-caps labels head list groups; tabular figures for every number.
- Catalogue numbers (№ 001) on every note row, in creation order.
- One-pixel seams between panes and rows; shadows only on floating tools and the page sheet.
- The week as a constellation of star-yellow Study days; missing a day is a faint point, never red.
- One planner frame for six views: a 21 px title, a muted note line, a pill strip where the rail is not docked, then small-caps groups over white seamed cards.
- Lucide line icons throughout; no doodles, no handwriting fonts.

## Colors

The palette is the app icon spread over a whole screen: tile green, star yellow, white paper, with a blue ballpoint for ink and a red marker for danger. Tokens are RGB channel triplets in `src/index.css` (`--c-*`), mapped through `tailwind.config.ts`, so light and dark swap variables and never per-component overrides.

### Primary
- **Tile Green** (tile-green): fills the actions and selections that live on white: the primary button, the active half of the Type | Write segment, the active planner tab, checked task boxes, a habit's done days and its Done check, today's point on the money runway and the rest timer bar, lasso and selection overlays, complete task badges. As text it marks planner section links and money coming in. Hover and press deepen to **Tile Green Deep**.
- **Green Wash** (tile-green-wash): the selected note row, selected toggles and the pressed tool in the pen dock. It is also the soft tint behind placeholder step icons.

### Secondary
- **Rail Forest** (rail-forest): the navigation rail and the mobile tab bar, the icon's tile at full size. It stays green in dark mode (night-rail), so the rail is a place, not a theme colour.
- **Rail Well / Rail Active / Rail Seam** (rail-well, rail-active, rail-seam): inset panels on the rail (the week constellation), the active and hovered nav item, and the hairlines inside the rail.
- **Rail Text / Rail Muted** (rail-text, rail-muted): labels on the rail, and secondary text, counts and idle icons (6.3:1 on the rail).

### Tertiary
- **Star Yellow** (star-yellow): stars. Bituin, Study-day stars in the constellation and on the Habits list, the starred-note star, the New note button on the rail and the mobile New note button. Text on solid yellow is **On Star** (on-star).
- **Star Wash / Star Ink** (star-wash, star-ink): the active Starred toggle in the editor header.
- **Ballpoint Blue** (ballpoint-blue): the default ink, the text caret, links in the page, the focus ring (2 px outline, 2 px offset) and text selection at 22% alpha. **Ballpoint Wash** is its tint.
- **Marker Red** (marker-red): destructive actions, the recording dot and the live Record state (on **Marker Wash**).

### Neutral
- **Chart Ground** (chart-ground): the editor ground behind sheets and the empty editor; carries the dot grid.
- **Shelf** (shelf): the note list pane, one step lighter than the chart.
- **Chart White** (chart-white): page sheets, inputs, menus, the pen dock, list cards and modals.
- **Hover Well** (hover-well): hover fills on white and on the shelf.
- **Control Line** (control-line): borders that must read as controls (3:1).
- **Seam** (seam): the one-pixel dividers between panes and rows, dot-grid dots, scrollbar thumbs.
- **Ink / Ink Muted / Ink Faint** (ink, ink-muted, ink-faint): primary text; secondary text and idle icons; meta, placeholders and catalogue numbers (all AA on their surfaces).
- **Night set** (night-*): the same roles at night. Green and ballpoint lighten (night-green, night-ballpoint) and text on green turns dark (night-on-green); star yellow keeps its value in both themes.

Folder dots use a fixed six-hue set derived from the folder id (`src/utils/folderColor.ts`); green and yellow are deliberately left out of it.

### Named Rules
**The One Star Rule.** Star yellow means a star: Bituin, Study days (in the rail's constellation and as Study's done days on the Habits list), starred notes, and the single New note button. Every other habit's done day is a green dot. On the rail it also marks "you are here" (the active nav icon) and the profile initials chip, and it fills the theme toggle's sun and moon. It is never a general accent, a hover colour, a badge or a second primary button.

**The Steering Green Rule.** Green on white means "act" or "selected". The rail is the same green at full strength and is never itself a button; nothing on white is filled with rail-forest.

**The Ballpoint Rule.** Blue belongs to the pen: ink, caret, links and the focus ring. It never fills a control, so focus is always distinguishable from selection.

**The Plain Figures Rule.** Red is for destroying things, not for money or habits. Spending past today's share, a negative account balance and a missed habit day stay in ink, muted or faint tones; the words carry the news.

## Typography

**Display Font:** Hanken Grotesk Variable (with system-ui, -apple-system, sans-serif)
**Body Font:** Hanken Grotesk Variable (same stack)
**Label/Mono Font:** Hanken Grotesk for labels; `ui-monospace` stack only for code inside a page

**Character:** One grotesque in many weights: friendly-precise, closer to a variable-font specimen than to a notebook. Hierarchy comes from scale, weight and tracking, never from a second family.

### Hierarchy
- **Display** (700, 30 px, 1.15, -0.025em): the note title on the sheet (24 px on phones) and the onboarding headline.
- **Headline** (700, 21 px, 1.25, -0.02em): pane titles ("All Notes" with its count), every planner view's title, the Safe-to-spend sentence, the Tala wordmark, placeholder section heads (22 px). Today's greeting is the one step up: 21 px on phones, 26 px from 768 px. In-page headings scale from the editor size: H1 1.8em, H2 1.45em, H3 1.22em, all 700 at -0.02em.
- **Title** (600, 14.5 px, 1.3, -0.005em): note-row titles (13.5 px compact), card titles and nudge titles (15 px), nav items (500, 14 px).
- **Body** (400, 16 px, 1.65): typed page text, adjustable per user via `--editor-font-size` / `--editor-line-height`; the sheet holds it to a 720 px column.
- **Body UI** (400, 13 px, 1.375): row snippets, descriptions, nudge copy, the muted note line under a planner title.
- **Label** (600, 10.5 px, 0.14em, uppercase): section labels on the rail (PLANNER, NOTEBOOK, FOLDERS, TAGS), day groups in the list (TODAY, YESTERDAY, THIS WEEK) and the group labels above planner cards, in ink-faint (rail-muted on the rail).
- **Figure** (600, 14 px, tabular): money inside cards: account totals, the month's Spent and In, each money line's amount. Planner row text beside it is 14 px regular.
- **Catalogue** (500, 11.5 px, tabular): the № 000 number leading every note row.
- **Meta** (400, 12 px, tabular): times, counts, page/ink/task meta.
- **Code** (400, 0.88em of the page size, 1.6): inline code and code blocks inside a page only; the system monospace stack, never used for interface chrome.

### Named Rules
**The One Face Rule.** Hanken Grotesk is the only typeface in the interface. A new level is made by size and weight, not by a new family, italic or colour.

**The Catalogue Rule.** Every number a student scans (catalogue numbers, counts, times, page counts, zoom) is set with tabular figures so columns line up. Catalogue numbers are `№` plus three padded digits in creation order, in ink-faint.

**The Small-Caps Label Rule.** Spaced uppercase labels only head a group of list items. They never sit above a headline as a kicker.

## Layout

Navigation is a responsive three-pane atlas:
- **Desktop and tablet landscape (1024 px and up):** a 232 px rail, a note list pane (300 px, 360 px from 1280 px) on the shelf colour, and the editor filling the rest. Both columns resize from a drag handle on their right edge (rail 180 to 360 px, dragging under 140 px hides it; list 260 to 480 px); the handle is a 2 px line that turns control-line on hover, tile green while dragging and a 3 px ballpoint line on keyboard focus. The rail can be hidden; a "Show sidebar" button then leads every view's header, where the rail's "Hide sidebar" button sat.
- **Tablet portrait (768 to 1023 px):** the rail becomes a 256 px drawer over a scrim; list and editor remain.
- **Phone (767 px and down):** one pane at a time with a fixed forest-green bottom tab bar (Notes, Today, a raised star-yellow New note button, Search, You), which mirrors for left-handed users. Today is lit for every planner view; Notes for every library view.
- **Below 1024 px (rail not docked):** every planner view carries the hub strip under its header, a horizontally scrolling row of pill tabs (Today, Upcoming, Tasks, Money, Habits, Workouts) that is the one tap between them. With the rail docked the rail's PLANNER group does that job and the strip is gone.

The planner views share one frame. A header (title, note line, the Show sidebar button when the rail is hidden), the hub strip where it applies, then a scrolling body on the shelf colour (12 px side padding on phones, 24 px from 768 px, 40 px at the bottom) holding groups 24 px apart. In the list pane beside an open note, or on a phone, the body is one column. With no note open on tablet and desktop the planner takes the whole pane, and once that pane is 848 px wide (container query) the frame widens to 1120 px: views with a side column split 7 : 5 with a 32 px gap, one-column views keep a 720 px column. Header, strip and body share the frame's left edge.

**The Same Edge Rule.** Every planner view starts its title, strip and first card on the same left edge, so switching views never moves the eye.

The editor centres a 720 px sheet with 40 px side padding (24 px on phones) on the chart ground. From 768 px up the ground carries a coordinate dot grid: 1 px seam-coloured dots on a 24 px pitch that scroll with the content. Plain lists inside the page flow into two columns when the editor pane is at least 720 px wide (container query); checklists stay single-column.

Spacing follows a 4 px grid: 4, 8, 12, 16, 24, 40. Pane gutters are 16 px, rail padding 12 px, rail sections are separated by 20 px, page paragraphs by 8 px and headings by 16 to 40 px above. On coarse pointers every control grows to a 44 px target (40 px for small buttons and the planner tabs); a planner section's link keeps its 12 px text but takes a 44 px hit area.

Touch has a platform baseline. Hover styles apply only where the pointer can hover (Tailwind `hoverOnlyWhenSupported`), so a tap never leaves a stuck hover fill. On coarse pointers every input, textarea and select is set at 16 px, whatever its mouse size, so iOS never zooms into a field. Buttons, links and tabs answer a tap at once (`touch-action: manipulation`), and a long press on a button or tab never selects its label; text in a page stays selectable.

**The Chart Ground Rule.** The dot grid lives only behind sheets in the editor pane. It never appears inside a sheet, on the rail, in the list or on phones.

## Elevation & Depth

Depth is mostly flat: surfaces are separated by tone (chart ground, shelf, white sheet) and one-pixel seams. Shadows are ambient, green-black tinted in light mode and pure black in dark, and reserved for things lifted off the chart.

### Shadow Vocabulary
- **Rest** (`box-shadow: 0 1px 1px rgb(20 38 26 / 0.05)`): the barely-there edge on primary and subtle buttons.
- **Raise** (`box-shadow: 0 1px 2px rgb(20 38 26 / 0.06), 0 6px 16px rgb(20 38 26 / 0.08)`): hover on primary buttons and grid cards, the mobile New note button.
- **Float** (`box-shadow: 0 2px 6px rgb(20 38 26 / 0.08), 0 18px 44px rgb(20 38 26 / 0.18)`): the pen dock, menus, popovers, dialogs and the compact Bituin pill.
- **Sheet** (`box-shadow: 0 1px 2px rgb(20 38 26 / 0.08), 0 8px 28px rgb(20 38 26 / 0.08)`): the white page on the chart ground (tablet and up).

### Named Rules
**The Seam Rule.** Panes, rows and groups divide with a one-pixel seam (seam / rail-seam), never with a shadow. A shadow means the thing floats above the page or is a page on the chart.

## Shapes

Corners are gently rounded and tiered by size: 8 px for controls (buttons, inputs, nav items, rows, segments), 10 px for cards and containers (list cards, the constellation, primary 40 px buttons, the New note button), 14 px for floating surfaces (the pen dock). The page sheet is nearly square (4 px) so it reads as paper. Fully round shapes are reserved for chips, tag pills, the planner tabs, dots (habit days, runway points), a habit's round Done check, the avatar and the mobile New note button.

Borders are one pixel: seam for dividers and idle chips, control-line where a border must read as a control. The selected note row is marked with a one-pixel ink line on its left edge inside a green-wash fill; multi-selection uses a one-pixel green inset ring.

## Components

### Buttons
Calm and solid; one green, one gold, everything else quiet.
- **Shape:** gently rounded (8 px at 32 px tall, 10 px at 40 px tall).
- **Primary:** tile green with white text, rest shadow; hover deepens to tile-green-deep and lifts to the raise shadow; press scales to 0.98. Disabled is 50% opacity.
- **New note:** the one star-yellow button, full rail width, 44 px tall, 15 px semibold with a plus; hover brightens 5%, press scales to 0.98. On phones it is a 56 px yellow circle raised out of the tab bar with a 4 px rail-coloured ring.
- **Subtle / Outline / Ghost:** white with a seam border, transparent with a control-line border, or text-only in ink-muted; all hover to hover-well.
- **Danger:** marker red with white text; **Danger outline:** red text with a 60% red border, hover marker-wash.
- **Focus:** the global ballpoint ring (2 px, 2 px offset) on every control.

### Chips
- **Filter chips:** 28 px tall pills, white with a seam border and muted text; active inverts to ink fill with white text.
- **Tag chips on the rail:** pill outline in rail-seam with rail-muted text and a tabular count; active fills with rail-text and rail-forest text.

### Cards / Containers
- **Corner Style:** 10 px.
- **Background:** chart white on the shelf or chart ground.
- **Shadow Strategy:** none at rest; grid cards raise on hover (see Elevation).
- **Border:** one-pixel seam; hover strengthens to control-line.
- **Internal Padding:** 12 to 16 px.

### Inputs / Fields
- **Style:** white field, one-pixel seam border, 8 px corners, 40 px tall (44 px on touch), leading search icon in ink-faint.
- **Focus:** border turns ballpoint blue with a 2 px ballpoint ring at 20% alpha.
- **Placeholder:** ink-faint.

### Navigation
- **Rail:** forest green, 12 px padding. Top: the Hide sidebar button, app icon (30 px, 8 px corners) and the Tala wordmark, then New note. Nav items are 36 px rows, 14 px medium in rail-text at 90%; hover fills rail-active at 60%, active fills rail-active, the active icon turns star yellow and thickens. Counts sit right in tabular rail-muted. The nav list is grouped under small-caps labels: PLANNER (Today, Upcoming, Tasks, Money, Habits, Workouts), then NOTEBOOK (All Notes, Starred, and the Search row with its shortcut hint last), then FOLDERS (a coloured dot each) and TAGS. The week constellation, then Archive, Trash and theme icon buttons over a rail seam, then the profile row with backup status and the settings gear.
- **Mobile tab bar:** the same forest green, fixed to the bottom with safe-area padding: Notes, Today, the raised New note, Search, and You (the profile picture on a yellow chip, opening Settings, Quiet mode and Back up now). Labels are 11 px; active icons turn star yellow and thicken.
- **Planner hub strip:** below 1024 px, a row of 36 px pill tabs (40 px on touch) in 13.5 px medium, 4 px apart. The active tab fills tile green with white text; idle tabs are ink-muted text on nothing and hover to hover-well with ink text. Switching changes colour only, no movement or underline; press scales to 0.97 over 150 ms. The strip scrolls sideways with no scrollbar, keeps the current tab in view with 24 px of scroll padding, and fades whichever edge can still scroll (a 28 px mask) so a cut-off tab reads as more.

### Planner Frame and Cards
The six planner views are one component with one grammar. A group is a small-caps label (ink-faint) with an optional section link on the right (12 px medium tile green, underline on hover, 44 px hit area on touch), above a white card: 10 px corners, a one-pixel seam border, no shadow, rows inside divided by seams. Rows are at least 44 px tall with 14 px side padding and 14 px text. Rows and row actions press to 0.97 over 150 ms ease-out.

### Safe to Spend (signature)
The money card states the day in one sentence in headline type: "₱205 to spend today" (the figure in ink, the words semibold ink-muted), or "₱221 over today's share" in ink when spent past it, never red and with no label above it. A 13 px muted line gives the daily share until the next income day, named when the lines say what it is (baon, sweldo). Below, the **runway**: the days left plotted as points on a seam line, today a 12 px tile-green dot (a green ring when over), the income day a 10 px green ring, the days between faint 6 px points; then a 12 px ink-faint tabular line of spent today, bills and money kept aside. Account totals and the month's Spent and In sit inside their cards in the figure type; a negative balance is ink.

### Habit Row
A habit is a grid row that reflows by its card's width (container query at 560 px). Wide: name, week, strength and Done on one line, columns lining up row to row. Narrow (phones): name, strength and Done on the first line, the week's dots under the name. The name is 14 px medium over a 12 px ink-faint rule line. The week is seven 14 px dots over day letters (today's letter bold ink): done fills tile green, started is green at 30%, a day off is a dashed ring, not done a control-line ring, days to come a seam ring. Study's done days are star-yellow stars instead of dots. Strength reads "new" over "first week" until a habit has 7 days of history, then a percentage over "strength" (10.5 px ink-faint), so a young habit never shows a low score. Done is a 36 px round check (44 px on touch) with a 1.5 px control-line ring that fills tile green when done; it presses to 0.94 over 150 ms ease-out and its check draws itself once (220 ms, cubic-bezier(0.16, 1, 0.3, 1)) only at the moment it turns done. A habit counted in numbers gets a 36 px "3/8 +" counter with 8 px corners instead, pressing to 0.97.

### Rest Timer
Between sets, a 3 px tile-green bar along the top edge drains from full to empty at a constant (linear) rate on the compositor, starting part-drained if reopened mid-rest. It is hidden under reduced motion.

### Note Row (catalogue row)
The list is a catalogue, not a card stack. Each row: № number (catalogue type), semibold title, a one-line snippet in body-ui muted, and a meta line (starred star, time, page count with "PDF ·" when imported, Ink, task badge, up to two tags), all in 12 px ink-faint. Rows are separated by a one-pixel seam inset 12 px; hover fills hover-well at 70%; selected fills green wash with the one-pixel ink left edge. Rows are grouped by day under small-caps labels (TODAY, YESTERDAY, THIS WEEK). A compact density drops the snippet and puts the time on the title line.

### Editor Header and Sheet
- **Crumb bar:** folder dot and name, chevron, note title, save status. On the right, the **Type | Write segment** (a 36 px white segmented control with a seam border; the active half fills tile green), **Record** (white with a red dot; turns marker-wash with a pulsing dot while recording), then star, share and more as 36 px icon toggles (the star toggle uses star-wash when on).
- **Page bar:** page stepper (the page in view, 1 / 2), Pages strip toggle, zoom stepper, template picker (Blank, Ruled, Grid) and Add page, as white seam-bordered controls.
- **Sheets:** every page of a note in one scroll, one sheet under the other. Between sheets, and after the last, a 32 px dashed round "+" (control-line border, ink-faint icon) inserts a page there; on phones it sits on a seam line, since sheets have no shadow there. PDF pages are the PDF on the chart ground, inset by the sheet's side padding.
- **Sheet:** white, 720 px, 4 px corners and the sheet shadow on tablet and up; display title, a 12 px meta line, then the page. Later pages open with a quiet "Page N" in 12 px ink-faint, in a head of the same height, so text starts at the same depth on every page. One formatting toolbar shows at a time: the page being typed in, else the page in view. Ruled and Grid templates draw control-line rules on the sheet itself at 35% and 25% alpha so they scale with zoom.

### Pen Dock
A vertical, 52 px wide floating dock on the editor's right edge (mirrors for left-handed users): white, 14 px corners, seam border, float shadow. Tools (pen, pencil, highlighter, eraser, lasso) are 40 px buttons with 10 px corners; the current tool fills green wash. Below a short seam: the colour swatch (24 px circle with a white inner ring and ink outer ring) that opens the palette, undo and redo, contextual lasso actions, and Clear in ink-faint that turns red on hover. It pops in at 180 ms.

### Week Constellation (signature)
The study week drawn as seven fixed sky positions (Monday to Sunday) in a 182 x 64 viewBox, inside a rail-well panel with 10 px corners. A Study day is a five-point star-yellow star, radius 5 to 8 by writing time; lit days join with a one-pixel yellow polyline (60% opacity, 95% once the weekly goal is reached); today without a star is a dashed yellow ring; other days are faint 2 px rings in rail-muted. Above, "2 of 4 study days" in semibold tabular and "this week" or "Goal reached"; below, the day letters, today's in full rail-text. A surface tone (white with a seam border) exists for light panels.

### Bituin Nudge
Bituin speaks in two forms. In the list, a white card (seam border, 10 px corners, 12 px padding) with Bituin at 36 px, a 15 px semibold title, a 13 px muted line and a small primary action plus a ghost "Not now". Elsewhere, a compact forest-green pill with the float shadow and a star-yellow text link. Bituin blinks and bobs in CSS only, and all of its motion stops while pen mode is on.

### Onboarding
A split screen: a forest-green panel (42%, up to 520 px) with the app icon, wordmark and a 30 px display promise, beside a white panel holding a 400 px column with Bituin waving, a display headline and full-width primary buttons. On phones the green panel shrinks to a header and a step indicator of ink and seam bars appears.

## Do's and Don'ts

### Do:
- **Do** take every colour from the `--c-*` tokens (`bg-canvas`, `bg-shelf`, `bg-panel`, `text-ink`, `bg-rail`, `bg-accent`, `bg-gold`) so light and dark swap by variable.
- **Do** keep exactly one star-yellow button per screen: New note.
- **Do** lead every note row with its catalogue number (№ 000, tabular, ink-faint).
- **Do** divide panes and rows with one-pixel seams and keep shadows for the pen dock, menus, dialogs and the page sheet.
- **Do** set every count, time and number with tabular figures.
- **Do** give every control a 44 px target on coarse pointers and the ballpoint focus ring everywhere.
- **Do** use Lucide line icons at 15 to 18 px (20 px in the mobile tab bar), thickening the stroke only for the active state.
- **Do** mirror the pen dock and the mobile tab bar for left-handed users.
- **Do** build every planner view from the shared frame: small-caps group label, white 10 px card with a one-pixel seam, seam-divided rows of at least 44 px.
- **Do** say money as a sentence ("₱205 to spend today", "₱221 over today's share") and set every figure in tabular type.
- **Do** keep the planner hub strip colour-only: tile green fill for the active tab, muted text for the rest, a faded edge where it can scroll.
- **Do** gate hover styles to hover-capable pointers and keep form fields at 16 px on coarse pointers.

### Don't:
- **Don't** use star yellow for anything that is not a star, New note, or the rail's active and profile marks: no yellow badges, hovers, banners or second buttons.
- **Don't** fill a control with ballpoint blue; blue is ink, links and focus.
- **Don't** bring back doodle icons, Kalam, Patrick Hand or Inter; Hanken Grotesk is the only face.
- **Don't** build the library as a grid of grey cards with drop shadows; it is a seamed catalogue on the shelf.
- **Don't** show a missed study day in red or as a loss; it is a faint point.
- **Don't** colour overspending, a negative balance or a missed habit day red, and don't score a habit under a week old; it is "new".
- **Don't** put a label above a money figure or set account names and tags in monospace; the sentence and the Hanken figure carry it.
- **Don't** animate Bituin or anything decorative while pen mode is on, and honour reduced motion (animations collapse to 1 ms).
- **Don't** add per-component `dark:` colour overrides when a token exists.
- **Don't** put the dot grid inside a sheet, on the rail, in the list or on phones.
