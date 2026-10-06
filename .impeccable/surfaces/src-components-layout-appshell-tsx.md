---
version: 1
slug: "src-components-layout-appshell-tsx"
primary_target: "src/components/layout/AppShell.tsx"
related_targets: ["src/index.css","src/components/Sidebar/Sidebar.tsx","src/components/layout/MobileNav.tsx"]
---

# Surface brief: Tala app shell and library UI

## Scope and visitor mode
Operate. The working app end to end: shell and navigation, note list, editor chrome, modals, settings, empty states, onboarding, splash. Phone, tablet (landscape and portrait, stylus-first) and desktop.

## Audience, job, constraints
A student with a stylus, in a lecture or at a desk, who must find or start a Note in two taps, write, and never look away from the page. PRODUCT.md rules bind: pen is sacred, never lose notes, encourage never nag. Owner-pinned look: clean surfaces, doodle accents only; green = actions, gold = Bituin and celebration, blue = ink and links; Inter for UI text, Kalam and Patrick Hand for accents only. WCAG AA, visible focus, mirrored pen toolbars for left-handed use, full keyboard use. No image generation is available here, so this is a code-led build.

## Direction and memorable moment
"Clean desk, doodle margins": the page is the loudest thing on screen; personality lives in the margins (a hand-drawn squiggle marking the active place, a drawn tick on completion, Bituin), never in the controls. Memorable moment: after the pen rests about two seconds, Bituin's small corner chip appears, never during a stroke, never taking focus.

## Unresolved decisions
Tasks tab content beyond a read-only list (toggling lands in Phase 4). Every Filipino line in Bituin's copy awaits the owner's review. Add-to-Home-Screen wording per platform.

## Direction contract
THESIS: A calm, modern study desk where the page outranks every control. It refuses the all-handwriting UI the app wore before (hard offset shadows, wobbly borders on every control, small handwriting body text) and also refuses the generic gray-card SaaS shell.
OWN-WORLD: Cool paper neutrals with a faint green tint, white surfaces, soft low shadows, 12px card radius. Inter for all UI text. Cap green (the TALA cap, darkened to pass AA with white text) for actions. Star gold only for Bituin, streaks, celebration and the favorite star. Ballpoint blue for ink and links. Kalam for note, page and panel titles and for Bituin's voice. A thin hand-drawn squiggle underline marks the active tab or item; a drawn tick marks completion. Recognizable with content removed: green solid buttons, white cards on a pale green-gray ground, the squiggle under the active item, the star in the corner.
STORY: The student opens Tala, sees their notes at once, taps the green plus and writes. Bituin cheers a Study day and reminds about a backup once a week, small and skippable, and falls silent in Quiet mode and under reduced motion.
FIRST VIEWPORT: Tablet landscape: 260px left rail (wordmark, solid green New note, library links with the squiggle on the active one), 360px note list with search and filters, editor filling the rest with its page strip above the sheet. Phone: title and search on top, the note list, and a bottom tab bar Notes / Tasks / Search with a raised green plus centred between them; Bituin's chip sits bottom-right above the bar.
FORM: Brief-pinned by the owner's plan (clean surfaces plus doodle accents); not rolled, no seed key.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.
