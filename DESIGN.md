---
name: Tala
description: A clean study desk with doodle margins: calm surfaces, a green action color, and Bituin the star in the corner.
colors:
  cap-green: "#2b7a3f"
  cap-green-deep: "#1f6a33"
  cap-green-wash: "#e3f3e6"
  star-gold: "#facc15"
  star-gold-wash: "#fff1bf"
  star-gold-ink: "#5c4300"
  ballpoint-blue: "#2d5da1"
  ballpoint-wash: "#e4edfa"
  marker-red: "#b3261e"
  desk: "#f3f6f2"
  paper: "#ffffff"
  well: "#e9eee7"
  ink: "#17201a"
  ink-muted: "#566259"
  ink-faint: "#5d685f"
  line-control: "#86918a"
  line-divider: "#dfe5dd"
  night-desk: "#101512"
  night-paper: "#171d19"
  night-green: "#5cc277"
  night-ink: "#e9efe9"
typography:
  title:
    fontFamily: "Kalam, 'Patrick Hand', cursive"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.3
  voice:
    fontFamily: "'Patrick Hand', Kalam, cursive"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "'Inter Variable', Inter, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Inter Variable', Inter, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.3
rounded:
  control: "8px"
  card: "12px"
  surface: "16px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.cap-green}"
    textColor: "{colors.paper}"
    rounded: "{rounded.card}"
    height: "40px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.cap-green-deep}"
  button-subtle:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    height: "40px"
  card-note:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "12px"
  nudge-bituin:
    backgroundColor: "{colors.star-gold-wash}"
    textColor: "{colors.star-gold-ink}"
    rounded: "{rounded.card}"
    padding: "12px"
---

# Design System: Tala

## Overview

**Creative North Star: "Clean Desk, Doodle Margins"**

The page is the loudest thing on screen. Controls are calm, legible and modern; personality lives in the margins: a hand-drawn squiggle that marks where you are, hand-lettered titles, and Bituin, the star mascot who appears in a corner and never over the work. The system refuses the all-handwriting interface the app wore before (hard offset shadows, wobbly borders on every control, small handwriting body text) and equally refuses the generic gray-card SaaS shell.

Light is a desk in daylight: a cool paper neutral with a faint green cast. Dark is the same desk at 1 AM: charcoal with the same green cast. Three colours do jobs: green acts, gold belongs to Bituin and celebration, blue is ink and links.

**Key Characteristics:**
- Inter for everything you operate; Kalam and Patrick Hand only for titles and Bituin's voice.
- One solid green action per view; everything else is quiet.
- Soft, low shadows; no hard offsets.
- Doodle icons and squiggles are accents, never controls' structure.
- Touch-first sizes on coarse pointers (44px class hit areas).

## Colors

A restrained neutral ground with one working accent and one reserved celebratory colour.

### Primary
- **Cap Green** (#2b7a3f; dark mode #5cc277): every primary action, the selected tab, toggles, focus-adjacent affordances. White text on it is 5.3:1. Deep (#1f6a33) is hover and pressed.

### Secondary
- **Star Gold** (#facc15, wash #fff1bf, ink #5c4300): Bituin, the favorite star, backup and install nudges. Never a button colour and never text on white (use Star Gold Ink on its wash, 8.2:1).
- **Ballpoint Blue** (#2d5da1; dark #8fb4f0): handwriting ink defaults, links, the keyboard focus ring.
- **Marker Red** (#b3261e; dark #ff8a80): destructive actions only.

### Neutral
- **Desk** (#f3f6f2) is the app ground; **Paper** (#ffffff) is cards, lists and sheets; **Well** (#e9eee7) is hover and input wells.
- **Ink** (#17201a), **Ink Muted** (#566259), **Ink Faint** (#5d685f, still 5.3:1 on the desk) for text.
- **Line Control** (#86918a, 3:1) outlines inputs and toggles; **Line Divider** (#dfe5dd) separates panes and rows.

### Named Rules
**The Gold Is Bituin's Rule.** Gold appears only with Bituin, celebration and favorites. If something is merely important, it is green or ink, not gold.
**The One Green Rule.** One solid green control per view carries the action; a second one means the hierarchy failed.

## Typography

**Display Font:** Kalam (fallback Patrick Hand, cursive)
**Body Font:** Inter Variable (fallback Inter, system-ui)
**Voice Font:** Patrick Hand, only for Bituin's lines.

**Character:** A clean workhorse sans carries the interface so long reading and small meta text stay legible; a marker hand signs the titles so the app still feels written.

### Hierarchy
- **Title** (Kalam 400, 20-30px, 1.3): panel, page and note titles.
- **Voice** (Patrick Hand 400, 18px, 1.2): Bituin's headline in nudges and the welcome.
- **Body** (Inter 400, 15px, 1.6, 65-75ch in the editor): notes and descriptions.
- **Label** (Inter 500, 13px): buttons, tabs, row labels. Meta text is 12px Ink Faint.

### Named Rules
**The Margin Hand Rule.** Handwriting faces never set a control's label or any text under 16px.

## Layout

Desktop and tablet landscape (≥1024px) use three panes: a 260px rail, a 300-360px list, and the editor filling the rest. Tablet portrait (768-1023px) drops the rail into a drawer. The phone (<768px) is one pane with a bottom tab bar (Notes, Tasks, a big green New note, Search, profile) and a full-screen editor. Spacing is a 4/8/16/24 rhythm. Bituin's corner chip sits bottom-right (bottom-left in left-handed mode).

## Elevation & Depth

Tonal layering first (Desk, Paper, Well), then soft shadows for lift. Surfaces are flat at rest; shadows appear on floating things and as a response to hover.

### Shadow Vocabulary
- **Rest** (`0 1px 2px rgb(23 32 26 / 0.08)`): buttons and cards at rest.
- **Raise** (`0 1px 2px rgb(23 32 26 / 0.08), 0 4px 12px rgb(23 32 26 / 0.10)`): hovered cards, the New note FAB.
- **Float** (`0 2px 4px rgb(23 32 26 / 0.08), 0 16px 40px rgb(23 32 26 / 0.18)`): modals, menus, drawers.

**The No Offset Rule.** No zero-blur offset shadows anywhere.

## Shapes

Quiet geometry: 8px controls, 12px cards and buttons, 16px sheets, full round for avatars and the FAB. The irregular "doodle" radius exists only for Bituin-adjacent accents. Borders are 1px; the thick pencil outlines of the old system are gone.

## Components

### Buttons
- **Shape:** 12px radius, 40px tall (44px on coarse pointers), 14px Inter 500.
- **Primary:** Cap Green fill, white text, Rest shadow; hover deepens and lifts to Raise; press scales to 0.98.
- **Subtle / Outline / Ghost:** Paper with a Line Divider border; transparent with a Line Control border; text-only. **Danger** is Marker Red fill.

### Chips
- Tags are 8px-radius pills tinted from the tag colour; the task badge is a Paper chip with a Divider border.

### Cards / Containers
- **Note row:** transparent until hover (Paper), selected state is the green wash with a Green border; grid tile is Paper with Rest shadow.
- **Nudge:** Star Gold wash with Star Gold Ink text, Bituin at left, one green action and a quiet "later".

### Inputs / Fields
- 40px tall, 12px radius, Paper fill, Line Divider border; focus shifts to Ballpoint Blue with a 2px soft ring. Placeholders are Ink Faint.

### Navigation
- Rail items are 8px-radius rows; active is the green wash. Phone tabs are icon over 11px label; the active tab turns green with a hand-drawn squiggle underline. The profile tab opens a menu (Settings, Quiet mode, Back up now).

### Bituin
- Two stacked images (eyes open, eyes shut); blink every 6s, gentle bob in resting places, wave and cheer on welcome moments. Frozen in Quiet mode, in pen mode and under reduced motion.

## Do's and Don'ts

### Do:
- **Do** keep one solid-green action per view and let everything else stay quiet.
- **Do** use Star Gold only with Bituin, celebration and favorites.
- **Do** keep every text and control pair at WCAG AA; check the dark theme too.
- **Do** give coarse pointers 44px-class targets.
- **Do** freeze Bituin while writing and in Quiet mode.

### Don't:
- **Don't** use hard offset shadows, thick pencil borders or wobbly radii on controls.
- **Don't** set UI text in Patrick Hand or Kalam.
- **Don't** show stat tiles, kickers above headings, or identical icon-title-text card grids as page structure.
- **Don't** let Bituin appear over the page while the pen is moving.
- **Don't** use gold as a button or text colour on white.
