# Doodle icons

Drop your doodles in this folder and they **replace the built-in icons
everywhere in the app** — no code changes needed.

## Current layout

```
light/            ← artwork for light mode
  app_star.png    … semantic names, see "Set names" below
dark/             ← artwork for dark mode (_dark suffix)
  app_star_dark.png
notely_set_N.png          ← small brand mark (sidebar button)
notely_set_full.png       ← full logo (splash screen)
notely_set_icon.png       ← standalone app icon (favicon / PWA)
```

The `light/` and `dark/` folders drive theme variants; files at the root of
`icons/` apply to both themes. Brand marks are wired separately (see below)
and don't need slot names.

> **Dark variants are currently disabled** — dark mode reuses the light
> artwork (`USE_DARK_VARIANTS = false` in `src/lib/lucideShim.tsx`). Flip the
> flag to `true` to bring per-theme artwork back; the files stay organized
> either way.

## How to use

1. Name your file after the icon "slot" you want to replace (list below),
   or use one of your set names from the alias table.
   Example: to replace the trash icon everywhere, add `trash-2.svg` (or drop
   `app_trash.png` into both folders and register it — see aliases).
2. Supported formats: `.svg` (recommended), `.png`, `.webp`, `.jpg`, `.gif`.
3. That's it. The dev server hot-reloads; production builds pick it up on
   the next build.

## Set names → app slots

Your hand-drawn set uses semantic file names. The shim maps them to every
slot they cover (edit `SLOT_ALIASES` in `src/lib/lucideShim.tsx` to change):

| File base      | Replaces slots                                  |
| -------------- | ----------------------------------------------- |
| `app_archive`  | `archive`                                       |
| `app_check`    | `list-checks`, `check-square`                   |
| `app_edit`     | `pencil`, `pen-tool`, `notebook-pen`            |
| `app_folder`   | `folder`                                        |
| `app_new`      | `plus`                                          |
| `app_note`     | `notebook-text`, `notebook`, `file-text`        |
| `app_search`   | `search`                                        |
| `app_star`     | `star`                                          |

Brand assets (wired in code, not slots):

- `notely_set_N(.png / _dark.png)` → sidebar brand button (`Sidebar.tsx`)
- `notely_set_full(.png / _dark.png)` → boot splash logo (`public/brand-full-*.png`)
- `notely_set_icon.png` → favicon + apple-touch-icon + PWA icon (`public/app-icon.png`)

## Light & dark variants

Two ways to provide per-theme artwork (both supported):

```
light/trash-2.svg    ← folder form
dark/trash-2.svg
trash-2.light.svg    ← suffix form
trash-2.dark.svg
trash-2.svg          ← theme-independent fallback for any mode
```

Precedence: exact theme variant → plain file → the other theme's variant.
So you can mix: some icons with two variants, others with a single file.

## Rules of thumb

- **SVG is recommended** — it stays crisp at every size. If you want your
  strokes to match the app's ink color (light/dark theme), draw them with
  `stroke="currentColor"` (or `fill="currentColor"`); the file is inlined,
  so `currentColor` follows the surrounding text color.
- Square artwork around a 24×24 viewBox looks best. Anything else is scaled
  to fit (`object-fit: contain` for rasters).
- Deleting the file instantly restores the built-in icon.
- Missing slots are fine — partial sets work; everything else keeps the
  built-in look.

## Available slots

- `align-justify.svg` — built-in: `AlignJustify`
- `archive.svg` — built-in: `Archive`
- `arrow-left.svg` — built-in: `ArrowLeft`
- `arrow-left-right.svg` — built-in: `ArrowLeftRight`
- `arrow-up-down.svg` — built-in: `ArrowUpDown`
- `bold.svg` — built-in: `Bold`
- `book-open.svg` — built-in: `BookOpen`
- `braces.svg` — built-in: `Braces`
- `check.svg` — built-in: `Check`
- `check-square.svg` — built-in: `CheckSquare`
- `chevron-down.svg` — built-in: `ChevronDown`
- `chevron-left.svg` — built-in: `ChevronLeft`
- `chevron-right.svg` — built-in: `ChevronRight`
- `clock.svg` — built-in: `Clock`
- `code.svg` — built-in: `Code`
- `command.svg` — built-in: `Command`
- `copy.svg` — built-in: `Copy`
- `corner-down-left.svg` — built-in: `CornerDownLeft`
- `download.svg` — built-in: `Download`
- `eraser.svg` — built-in: `Eraser`
- `file-text.svg` — built-in: `FileText`
- `folder.svg` — built-in: `Folder`
- `folder-input.svg` — built-in: `FolderInput`
- `folder-plus.svg` — built-in: `FolderPlus`
- `graduation-cap.svg` — built-in: `GraduationCap`
- `hard-drive.svg` — built-in: `HardDrive`
- `hash.svg` — built-in: `Hash`
- `heading-1.svg` — built-in: `Heading1`
- `heading-2.svg` — built-in: `Heading2`
- `heading-3.svg` — built-in: `Heading3`
- `highlighter.svg` — built-in: `Highlighter`
- `home.svg` — built-in: `Home`
- `house.svg` — built-in: `House`
- `image-plus.svg` — built-in: `ImagePlus`
- `import.svg` — built-in: `Import`
- `italic.svg` — built-in: `Italic`
- `kanban-square.svg` — built-in: `KanbanSquare`
- `keyboard.svg` — built-in: `Keyboard`
- `layout-grid.svg` — built-in: `LayoutGrid`
- `lightbulb.svg` — built-in: `Lightbulb`
- `link-2.svg` — built-in: `Link2`
- `list.svg` — built-in: `List`
- `list-checks.svg` — built-in: `ListChecks`
- `list-ordered.svg` — built-in: `ListOrdered`
- `loader-circle.svg` — built-in: `LoaderCircle`
- `maximize-2.svg` — built-in: `Maximize2`
- `menu.svg` — built-in: `Menu`
- `minimize-2.svg` — built-in: `Minimize2`
- `minus.svg` — built-in: `Minus`
- `monitor.svg` — built-in: `Monitor`
- `moon.svg` — built-in: `Moon`
- `more-horizontal.svg` — built-in: `MoreHorizontal`
- `mouse-pointer-2.svg` — built-in: `MousePointer2`
- `notebook.svg` — built-in: `Notebook`
- `notebook-pen.svg` — built-in: `NotebookPen`
- `notebook-text.svg` — built-in: `NotebookText`
- `palette.svg` — built-in: `Palette`
- `pen-tool.svg` — built-in: `PenTool`
- `pencil.svg` — built-in: `Pencil`
- `pin.svg` — built-in: `Pin`
- `plus.svg` — built-in: `Plus`
- `quote.svg` — built-in: `Quote`
- `redo-2.svg` — built-in: `Redo2`
- `rotate-ccw.svg` — built-in: `RotateCcw`
- `rows-3.svg` — built-in: `Rows3`
- `search.svg` — built-in: `Search`
- `settings.svg` — built-in: `Settings`
- `settings-2.svg` — built-in: `Settings2`
- `share-2.svg` — built-in: `Share2`
- `sliders-horizontal.svg` — built-in: `SlidersHorizontal`
- `square-code.svg` — built-in: `SquareCode`
- `star.svg` — built-in: `Star`
- `strikethrough.svg` — built-in: `Strikethrough`
- `sun.svg` — built-in: `Sun`
- `sun-moon.svg` — built-in: `SunMoon`
- `trash-2.svg` — built-in: `Trash2`
- `underline.svg` — built-in: `Underline`
- `undo-2.svg` — built-in: `Undo2`
- `user.svg` — built-in: `User`
- `users.svg` — built-in: `Users`
- `x.svg` — built-in: `X`
