/* eslint-disable */
/**
 * lucide-react shim — the doodle-icon layer.
 *
 * Vite resolves every `import { ... } from 'lucide-react'` in the app to this
 * module (see `resolve.alias` in vite.config.ts). Each icon is wrapped so that:
 *
 *   - if a doodle file exists for its slot (src/assets/icons/<slot>.svg or a
 *     raster image), the doodle is rendered instead of the built-in glyph;
 *   - otherwise the original lucide component renders unchanged.
 *
 * Dropping/removing files in src/assets/icons swaps icons app-wide instantly
 * (dev hot-reloads; production builds bake them in). No call sites change.
 *
 * Slot names are kebab-case versions of the lucide names — e.g. `Trash2`
 * becomes `trash-2`. See src/assets/icons/README.md for the full list.
 */
import { createElement, useSyncExternalStore } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import * as Lucide from 'lucide-react/dist/esm/lucide-react.mjs'
import type { LucideIcon } from 'lucide-react'
import { useSettingsStore } from '@/store/settingsStore'

/**
 * Doodle SVGs are inlined raw so strokes using currentColor follow the theme.
 * Files may sit at the root or inside `light/` / `dark/` theme folders.
 */
const rawSvgs = import.meta.glob('../assets/icons/**/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

/** Raster doodles render as plain <img> embedding. */
const rasterUrls = import.meta.glob('../assets/icons/**/*.{png,webp,jpg,jpeg,gif}', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

type ThemeVariant = 'light' | 'dark'

/** Strips the extension plus an optional `_light`/`_dark` name suffix. */
function fileName(path: string): string {
  return path
    .split('/')
    .pop()!
    .replace(/\.[^.]+$/, '')
    .replace(/_(light|dark)$/, '')
    .toLowerCase()
}

/** Theme comes from the folder (`light/x.png`) or a name suffix (`x.dark.png`). */
function variantOf(path: string): ThemeVariant | undefined {
  if (/\/light\//.test(path)) return 'light'
  if (/\/dark\//.test(path)) return 'dark'
  const m = /[._](light|dark)\.[^.]+$/.exec(path)
  return m ? (m[1] as ThemeVariant) : undefined
}

/**
 * Maps the hand-drawn set's semantic file names to the app icon slots they
 * replace. One doodle can cover several slots (e.g. `app_note` stands in for
 * every note-ish glyph). Keys are the file base names in src/assets/icons/.
 */
const SLOT_ALIASES: Record<string, string[]> = {
  app_archive: ['archive'],
  app_check: ['list-checks', 'check-square'],
  app_edit: ['pencil', 'pen-tool', 'notebook-pen'],
  app_folder: ['folder'],
  app_new: ['plus'],
  app_note: ['notebook-text', 'notebook', 'file-text'],
  app_pin: ['pin'],
  app_recent: ['clock'],
  app_search: ['search'],
  app_star: ['star'],
  app_trash: ['trash-2'],

  // State variants (solid glyphs) and soft UI accents from the second set
  filled_filter: ['filter-active'],
  filled_pin: ['pin-filled'],
  filled_saved: ['bookmark'],
  filled_sort: ['sort-active'],
  filled_star: ['star-filled'],
  filled_trash: ['trash-filled'],
  ui_check: ['check-soft'],
  ui_filter: ['filter'],
  ui_info: ['info'],
  ui_sort: ['sort'],
  ui_star: ['star-outline'],
}

/**
 * Dark-variant artwork is currently disabled — dark mode reuses the light /
 * theme-independent doodles. Flip to true to resume per-theme resolution.
 */
const USE_DARK_VARIANTS = false

const svgIndex = new Map<string, Map<string, string>>()
const rasterIndex = new Map<string, Map<string, string>>()

function indexInto(
  index: Map<string, Map<string, string>>,
  path: string,
  value: string,
): void {
  const slot = fileName(path)
  const variant = variantOf(path)
  // Register under the literal name plus every alias slot it covers
  const slots = [slot, ...(SLOT_ALIASES[slot] ?? [])]
  for (const s of slots) {
    let variants = index.get(s)
    if (!variants) {
      variants = new Map()
      index.set(s, variants)
    }
    // '' = theme-independent file
    variants.set(variant ?? '', value)
  }
}

/**
 * Defense-in-depth: doodle packs are local assets, but a future icon set is
 * still untrusted input that gets inlined. Strip scripts, event handlers,
 * foreign objects and non-fragment URLs before anything reaches innerHTML.
 */
function sanitizeDoodleSvg(raw: string): string {
  return raw
    .replace(/<script[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<foreignObject[\s\S]*?<\/foreignObject\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(
      /\s(?:xlink:href|href)\s*=\s*(["'][^"']*["']|[^\s>]+)/gi,
      (m, url: string) => (/^(["'])#[\w-]+\1$/.test(url.trim()) ? m : ''),
    )
    .replace(/javascript:/gi, '')
}

for (const [path, raw] of Object.entries(rawSvgs)) {
  indexInto(svgIndex, path, sanitizeDoodleSvg(raw))
}
for (const [path, url] of Object.entries(rasterUrls)) indexInto(rasterIndex, path, url)

/**
 * Resolves the best file for a slot under the active theme.
 * Precedence: exact theme variant → theme-independent → opposite variant.
 * When USE_DARK_VARIANTS is off, dark mode falls straight through to the
 * light / plain artwork.
 */
function resolveVariant(
  index: Map<string, Map<string, string>>,
  slot: string,
  isDark: boolean,
): string | undefined {
  const variants = index.get(slot.toLowerCase())
  if (!variants) return undefined
  if (!USE_DARK_VARIANTS && isDark) {
    return variants.get('light') ?? variants.get('')
  }
  const want: ThemeVariant = isDark ? 'dark' : 'light'
  return variants.get(want) ?? variants.get('') ?? variants.get(isDark ? 'light' : 'dark')
}

/** True when any doodle overrides this slot. */
export function hasDoodle(slot: string): boolean {
  const lower = slot.toLowerCase()
  return svgIndex.has(lower) || rasterIndex.has(lower)
}

interface DoodleProps {
  size?: number | string
  className?: string
  style?: CSSProperties
}

/**
 * Renders an overriding doodle for `slot`, or null when none exists.
 * SVG doodles are inlined (currentColor-aware); rasters render via <img>.
 * `isDark` picks between `.dark`/`.light` artwork variants.
 */
export function Doodle(slot: string, props: DoodleProps, isDark: boolean): ReactNode {
  const size = props.size ?? 24
  const px = typeof size === 'number' ? `${size}px` : size
  const svg = resolveVariant(svgIndex, slot, isDark)
  if (svg !== undefined) {
    return (
      <span
        aria-hidden="true"
        className={props.className}
        style={{ display: 'inline-block', width: px, height: px, lineHeight: 0, ...props.style }}
        dangerouslySetInnerHTML={{
          __html: svg.replace('<svg', '<svg focusable="false" tabindex="-1"'),
        }}
      />
    )
  }
  const url = resolveVariant(rasterIndex, slot, isDark)
  if (url === undefined) return null
  return (
    <img
      src={url}
      alt=""
      aria-hidden="true"
      draggable={false}
      width={typeof size === 'number' ? size : undefined}
      height={typeof size === 'number' ? size : undefined}
      className={props.className}
      style={{ width: px, height: px, objectFit: 'contain', ...props.style }}
    />
  )
}

type AnyProps = { size?: number | string; className?: string; style?: CSSProperties } & Record<string, unknown>

/** Subscribes to the app theme (and OS-level changes under "system"). */
function useIsDark(): boolean {
  const theme = useSettingsStore((s) => s.settings.theme)
  const prefersDark = useSyncExternalStore(
    (onStoreChange) => {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', onStoreChange)
      return () => mq.removeEventListener('change', onStoreChange)
    },
    () => window.matchMedia('(prefers-color-scheme: dark)').matches,
    () => false,
  )
  return theme === 'dark' || (theme !== 'light' && prefersDark)
}

/**
 * Wraps a lucide component with doodle override behaviour.
 * No doodle present → the original component renders untouched.
 */
function withDoodle(slot: string, Fallback: LucideIcon): LucideIcon {
  const Wrapped = (props: AnyProps): ReactNode => {
    const { size, className, style, ...rest } = props
    // Hook order is stable whether or not a doodle exists for this slot.
    const isDark = useIsDark()
    if (hasDoodle(slot)) return <>{Doodle(slot, { size, className, style }, isDark)}</>
    return createElement(Fallback, rest as never, null)
  }
  Wrapped.displayName = `Doodle(${slot})`
  return Wrapped as unknown as LucideIcon
}

export * from 'lucide-react/dist/esm/lucide-react.mjs'

/* ---- Overridable icons actually used by Notely ---- */
export const AlignJustify = withDoodle('align-justify', Lucide.AlignJustify)
export const Archive = withDoodle('archive', Lucide.Archive)
export const ArrowLeft = withDoodle('arrow-left', Lucide.ArrowLeft)
export const ArrowLeftRight = withDoodle('arrow-left-right', Lucide.ArrowLeftRight)
export const ArrowUpDown = withDoodle('arrow-up-down', Lucide.ArrowUpDown)
export const Bold = withDoodle('bold', Lucide.Bold)
export const BookOpen = withDoodle('book-open', Lucide.BookOpen)
export const Braces = withDoodle('braces', Lucide.Braces)
export const Check = withDoodle('check', Lucide.Check)
export const CheckSquare = withDoodle('check-square', Lucide.CheckSquare)
export const ChevronDown = withDoodle('chevron-down', Lucide.ChevronDown)
export const ChevronLeft = withDoodle('chevron-left', Lucide.ChevronLeft)
export const ChevronRight = withDoodle('chevron-right', Lucide.ChevronRight)
export const Clock = withDoodle('clock', Lucide.Clock)
export const Code = withDoodle('code', Lucide.Code)
export const Command = withDoodle('command', Lucide.Command)
export const Copy = withDoodle('copy', Lucide.Copy)
export const CornerDownLeft = withDoodle('corner-down-left', Lucide.CornerDownLeft)
export const Download = withDoodle('download', Lucide.Download)
export const Eraser = withDoodle('eraser', Lucide.Eraser)
export const FileText = withDoodle('file-text', Lucide.FileText)
export const Folder = withDoodle('folder', Lucide.Folder)
export const FolderInput = withDoodle('folder-input', Lucide.FolderInput)
export const FolderPlus = withDoodle('folder-plus', Lucide.FolderPlus)
export const GraduationCap = withDoodle('graduation-cap', Lucide.GraduationCap)
export const HardDrive = withDoodle('hard-drive', Lucide.HardDrive)
export const Hash = withDoodle('hash', Lucide.Hash)
export const Heading1 = withDoodle('heading-1', Lucide.Heading1)
export const Heading2 = withDoodle('heading-2', Lucide.Heading2)
export const Heading3 = withDoodle('heading-3', Lucide.Heading3)
export const Highlighter = withDoodle('highlighter', Lucide.Highlighter)
export const Home = withDoodle('home', Lucide.Home)
export const House = withDoodle('house', Lucide.House)
export const ImagePlus = withDoodle('image-plus', Lucide.ImagePlus)
export const Import = withDoodle('import', Lucide.Import)
export const Italic = withDoodle('italic', Lucide.Italic)
export const KanbanSquare = withDoodle('kanban-square', Lucide.KanbanSquare)
export const Keyboard = withDoodle('keyboard', Lucide.Keyboard)
export const LayoutGrid = withDoodle('layout-grid', Lucide.LayoutGrid)
export const Lightbulb = withDoodle('lightbulb', Lucide.Lightbulb)
export const Link2 = withDoodle('link-2', Lucide.Link2)
export const List = withDoodle('list', Lucide.List)
export const ListChecks = withDoodle('list-checks', Lucide.ListChecks)
export const ListOrdered = withDoodle('list-ordered', Lucide.ListOrdered)
export const LoaderCircle = withDoodle('loader-circle', Lucide.LoaderCircle)
export const Maximize2 = withDoodle('maximize-2', Lucide.Maximize2)
export const Menu = withDoodle('menu', Lucide.Menu)
export const Minimize2 = withDoodle('minimize-2', Lucide.Minimize2)
export const Minus = withDoodle('minus', Lucide.Minus)
export const Monitor = withDoodle('monitor', Lucide.Monitor)
export const Moon = withDoodle('moon', Lucide.Moon)
export const MoreHorizontal = withDoodle('more-horizontal', Lucide.MoreHorizontal)
export const MousePointer2 = withDoodle('mouse-pointer-2', Lucide.MousePointer2)
export const Notebook = withDoodle('notebook', Lucide.Notebook)
export const NotebookPen = withDoodle('notebook-pen', Lucide.NotebookPen)
export const NotebookText = withDoodle('notebook-text', Lucide.NotebookText)
export const Palette = withDoodle('palette', Lucide.Palette)
export const PenTool = withDoodle('pen-tool', Lucide.PenTool)
export const Pencil = withDoodle('pencil', Lucide.Pencil)
export const Pin = withDoodle('pin', Lucide.Pin)
export const Plus = withDoodle('plus', Lucide.Plus)
export const Quote = withDoodle('quote', Lucide.Quote)
export const Redo2 = withDoodle('redo-2', Lucide.Redo2)
export const RotateCcw = withDoodle('rotate-ccw', Lucide.RotateCcw)
export const Rows3 = withDoodle('rows-3', Lucide.Rows3)
export const Search = withDoodle('search', Lucide.Search)
export const Settings = withDoodle('settings', Lucide.Settings)
export const Settings2 = withDoodle('settings-2', Lucide.Settings2)
export const Share2 = withDoodle('share-2', Lucide.Share2)
export const SlidersHorizontal = withDoodle('sliders-horizontal', Lucide.SlidersHorizontal)
export const SquareCode = withDoodle('square-code', Lucide.SquareCode)
export const Star = withDoodle('star', Lucide.Star)
export const Strikethrough = withDoodle('strikethrough', Lucide.Strikethrough)
export const Sun = withDoodle('sun', Lucide.Sun)
export const SunMoon = withDoodle('sun-moon', Lucide.SunMoon)
export const Trash2 = withDoodle('trash-2', Lucide.Trash2)
export const Underline = withDoodle('underline', Lucide.Underline)
export const Undo2 = withDoodle('undo-2', Lucide.Undo2)
export const User = withDoodle('user', Lucide.User)
export const Users = withDoodle('users', Lucide.Users)
export const X = withDoodle('x', Lucide.X)

/* ---- State-variant + accent doodles from the second icon set ---- */

export const Bookmark = withDoodle('bookmark', Lucide.Bookmark)
export const Filter = withDoodle('filter', Lucide.Filter)
export const FilterActive = withDoodle('filter-active', Lucide.Filter)
export const Info = withDoodle('info', Lucide.Info)
export const Sort = withDoodle('sort', Lucide.ArrowUpDown)
export const SortActive = withDoodle('sort-active', Lucide.ArrowUpDown)
export const StarFilled = withDoodle('star-filled', Lucide.Star)
export const PinFilled = withDoodle('pin-filled', Lucide.Pin)
export const TrashFilled = withDoodle('trash-filled', Lucide.Trash2)
export const CheckSoft = withDoodle('check-soft', Lucide.Check)
