---
version: 1
slug: "src-components-layout-appshell-tsx"
primary_target: "src/components/layout/AppShell.tsx"
related_targets: ["src/index.css","src/components/Sidebar/Sidebar.tsx","src/components/layout/MobileNav.tsx","src/components/NoteList/NoteListPanel.tsx","src/components/NoteEditor/NoteEditor.tsx"]
---

# Surface brief: Tala app shell and library UI

## Scope and visitor mode
Operate. The working app end to end: shell and navigation, note list, editor chrome, modals, settings, empty states, onboarding, splash. Tablet landscape and desktop lead (owner: "I want it more for tablet/PC"); phone follows the same world.

## Audience, job, constraints
A student with a stylus, in a lecture or at a desk, who must find or start a Note in two taps, write, and never look away from the page. PRODUCT.md rules bind: pen is sacred, never lose notes, encourage never nag. Owner decision (2026-10-07): only Bituin and the name Tala are pinned; the old green/gold/blue roles, Inter and the Kalam/Patrick Hand accents are released. Owner's pains with the old UI: generic, childish (handwriting faces, doodle icons), busy editor chrome, empty space with weak hierarchy, missing placeholders and onboarding. WCAG AA, visible focus, mirrored pen dock for left-handed use, full keyboard use.

## Direction and memorable moment
Planisphere: the library as a star atlas, in the app icon's colours (owner revision 2026-10-07: "stick with what resonates with the app icon"). Memorable moment: the week constellation in the rail, one gold star per Study day, joined as the week fills; Bituin's corner chip on a pen pause.

## Unresolved decisions
Filipino lines in Bituin copy await owner review. Add-to-Home-Screen wording per platform.

## Direction contract
THESIS: Tala's library is a star atlas: a forest-green rail (the icon's tile) you steer by, chart-white pages that stay the loudest thing on screen, and the study week plotted as a constellation. It refuses the generic grey-card notes shell and the old all-doodle scrapbook.
OWN-WORLD: Forest-green rail (#1f4a2b, the app icon's tile) with pale green text, green-tinted chart ground (#edf3ec) with a faint coordinate dot grid behind pages, white sheets, one-pixel coordinate seams instead of shadows. Star yellow (#f6c845) means stars only: Bituin, Study days, starred notes, and the one New note button on the rail. Icon green (#2e6a3a) fills actions and selection on white. Hanken Grotesk for everything, hierarchy by scale and weight; spaced small caps for section labels; tabular catalogue numbers (№ 024) on every note. Lucide line icons, no doodles.
STORY: The student opens Tala and sees the notes at once, taps gold New note, writes on a white page under a quiet vertical pen dock. The rail's constellation gains a star when a Study day lands; Bituin cheers from the corner and falls silent in Quiet mode.
FIRST VIEWPORT: Tablet landscape: 232px green rail (app icon + Tala, yellow New note, Home/All Notes/Starred/Tasks/Search with counts, Folders with colour dots, week constellation, profile with backup status), 304px list (title + count, search, filter chips, day-grouped rows with catalogue number, title, snippet, page/audio/ink meta, selected row pale green with a 1px ink seam), editor (crumb bar with a Type | Write segment and Record, big title, meta line, page strip, white sheet on the dot grid, pen dock on the right edge).
FORM: Planisphere (star atlas), position 7 on the ordered grounded list, seed key ab15cb25. Raises: hairline seams (console), rows keep identity when reranked (gate board), gold has one meaning (orienteering), catalogue numbers (Saville), hierarchy by scale alone (variable-font specimen).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
