/* eslint-disable */
/**
 * lucide-react shim — react-doodle-icons layer.
 *
 * Vite resolves every `import { ... } from 'lucide-react'` in the app to this
 * module (see `resolve.alias` in vite.config.ts). Icons come from the
 * react-doodle-icons pack (hand-drawn SVG set, MIT); where the pack offers no
 * fitting glyph — text formatting, gears/sliders, theme sun/moon, spinners —
 * the original lucide icon renders instead, so call sites never change.
 *
 * Two things every doodle needs:
 *   - fill via currentColor so theme colours apply unchanged;
 *   - `overflow: visible` on the <svg>: the hand-drawn paths intentionally
 *     overshoot their viewBox a few units, and SVG crops overflow by default,
 *     which sheared glyphs along their right/bottom edges. The wrapper below
 *     forces it back on (and merges caller styles over it).
 *
 * The pack marks its main entry as side-effectful, which disables
 * tree-shaking through it, so each icon is imported from its own file
 * (~200 bytes apiece).
 */
import { forwardRef } from 'react'
import type { ComponentType, CSSProperties, SVGProps } from 'react'
import * as Lucide from 'lucide-react/dist/esm/lucide-react.mjs'
import type { LucideIcon } from 'lucide-react'

import { ArrowLeftIcon } from 'react-doodle-icons/icons/ArrowLeftIcon'
import { ArrowRightIcon } from 'react-doodle-icons/icons/ArrowRightIcon'
import { BookmarkIcon } from 'react-doodle-icons/icons/BookmarkIcon'
import { BoxIcon } from 'react-doodle-icons/icons/BoxIcon'
import { CameraIcon } from 'react-doodle-icons/icons/CameraIcon'
import { ChevronsDownIcon } from 'react-doodle-icons/icons/ChevronsDownIcon'
import { ChevronsLeftIcon } from 'react-doodle-icons/icons/ChevronsLeftIcon'
import { ChevronsRightIcon } from 'react-doodle-icons/icons/ChevronsRightIcon'
import { ClockIcon } from 'react-doodle-icons/icons/ClockIcon'
import { CopyIcon } from 'react-doodle-icons/icons/CopyIcon'
import { CrossIcon } from 'react-doodle-icons/icons/CrossIcon'
import { DeleteIcon } from 'react-doodle-icons/icons/DeleteIcon'
import { DownloadIcon } from 'react-doodle-icons/icons/DownloadIcon'
import { EraserIcon } from 'react-doodle-icons/icons/EraserIcon'
import { FastForwardIcon } from 'react-doodle-icons/icons/FastForwardIcon'
import { FastRewindIcon } from 'react-doodle-icons/icons/FastRewindIcon'
import { FileNotesIcon } from 'react-doodle-icons/icons/FileNotesIcon'
import { FolderAddIcon } from 'react-doodle-icons/icons/FolderAddIcon'
import { FolderIcon } from 'react-doodle-icons/icons/FolderIcon'
import { ForwardIcon } from 'react-doodle-icons/icons/ForwardIcon'
import { Home1Icon } from 'react-doodle-icons/icons/Home1Icon'
import { HomeIcon } from 'react-doodle-icons/icons/HomeIcon'
import { InfoIcon } from 'react-doodle-icons/icons/InfoIcon'
import { LinkIcon } from 'react-doodle-icons/icons/LinkIcon'
import { MaximizeIcon } from 'react-doodle-icons/icons/MaximizeIcon'
import { Menu2Icon } from 'react-doodle-icons/icons/Menu2Icon'
import { MenuIcon } from 'react-doodle-icons/icons/MenuIcon'
import { MinimizeIcon } from 'react-doodle-icons/icons/MinimizeIcon'
import { NavigationIcon } from 'react-doodle-icons/icons/NavigationIcon'
import { NoteIcon } from 'react-doodle-icons/icons/NoteIcon'
import { PaintBrush2Icon } from 'react-doodle-icons/icons/PaintBrush2Icon'
import { PaintBucketIcon } from 'react-doodle-icons/icons/PaintBucketIcon'
import { PencilIcon } from 'react-doodle-icons/icons/PencilIcon'
import { PenToolIcon } from 'react-doodle-icons/icons/PenToolIcon'
import { PhotoIcon } from 'react-doodle-icons/icons/PhotoIcon'
import { PinIcon } from 'react-doodle-icons/icons/PinIcon'
import { RotateIcon } from 'react-doodle-icons/icons/RotateIcon'
import { SendIcon } from 'react-doodle-icons/icons/SendIcon'
import { ServerIcon } from 'react-doodle-icons/icons/ServerIcon'
import { StarIcon } from 'react-doodle-icons/icons/StarIcon'
import { TagIcon } from 'react-doodle-icons/icons/TagIcon'
import { Tick2Icon } from 'react-doodle-icons/icons/Tick2Icon'
import { TickIcon } from 'react-doodle-icons/icons/TickIcon'
import { UnboxIcon } from 'react-doodle-icons/icons/UnboxIcon'
import { UserIcon } from 'react-doodle-icons/icons/UserIcon'

interface DoodleProps extends SVGProps<SVGSVGElement> {
  size?: number | string
  /** Fill colour; defaults to currentColor like the rest of the app. */
  color?: string
}

type DoodleComponent = ComponentType<DoodleProps>

/**
 * Presents a doodle under its lucide slot identity. Besides forwarding props
 * it pins `overflow: visible` onto the glyph so overshooting hand-drawn
 * strokes are never cropped (call-site styles still win via merge order).
 */
function doodle(C: DoodleComponent): LucideIcon {
  const Wrapped = forwardRef<SVGSVGElement, DoodleProps>(function DoodleSlot(props, ref) {
    const { style, className, ...rest } = props
    return (
      <C
        ref={ref}
        {...rest}
        className={className ? `doodle-slot ${className}` : 'doodle-slot'}
        style={{ overflow: 'visible', ...(style as CSSProperties | undefined) }}
      />
    )
  })
  return Wrapped as unknown as LucideIcon
}

export * from 'lucide-react/dist/esm/lucide-react.mjs'

/* ---- Mapped slots: react-doodle-icons serves the glyph ---- */
export const AlignJustify = doodle(MenuIcon)
export const Archive = doodle(BoxIcon)
export const ArrowLeft = doodle(ArrowLeftIcon)
export const ArrowRight = doodle(ArrowRightIcon)
export const Bookmark = doodle(BookmarkIcon)
export const Camera = doodle(CameraIcon)
export const Check = doodle(TickIcon)
export const CheckSoft = doodle(Tick2Icon)
export const ChevronDown = doodle(ChevronsDownIcon)
export const ChevronLeft = doodle(ChevronsLeftIcon)
export const ChevronRight = doodle(ChevronsRightIcon)
export const Clock = doodle(ClockIcon)
export const Copy = doodle(CopyIcon)
export const CornerDownLeft = doodle(ForwardIcon)
export const Download = doodle(DownloadIcon)
export const Eraser = doodle(EraserIcon)
export const Folder = doodle(FolderIcon)
export const FolderInput = doodle(FolderAddIcon)
export const FolderPlus = doodle(FolderAddIcon)
export const HardDrive = doodle(ServerIcon)
export const Hash = doodle(TagIcon)
export const Highlighter = doodle(PaintBrush2Icon)
export const Home = doodle(Home1Icon)
export const House = doodle(HomeIcon)
export const ImagePlus = doodle(PhotoIcon)
export const Import = doodle(UnboxIcon)
export const Info = doodle(InfoIcon)
export const Link2 = doodle(LinkIcon)
export const Maximize2 = doodle(MaximizeIcon)
export const Menu = doodle(MenuIcon)
export const Minimize2 = doodle(MinimizeIcon)
export const MoreHorizontal = doodle(Menu2Icon)
export const MousePointer2 = doodle(NavigationIcon)
export const Notebook = doodle(FileNotesIcon)
export const NotebookText = doodle(NoteIcon)
export const Palette = doodle(PaintBucketIcon)
export const PenTool = doodle(PenToolIcon)
export const Pencil = doodle(PencilIcon)
export const Pin = doodle(PinIcon)
export const PinFilled = doodle(PinIcon)
export const Redo2 = doodle(FastForwardIcon)
export const RotateCcw = doodle(RotateIcon)
export const Share2 = doodle(SendIcon)
export const Star = doodle(StarIcon)
export const StarFilled = doodle(StarIcon)
export const Trash2 = doodle(DeleteIcon)
export const TrashFilled = doodle(DeleteIcon)
export const Undo2 = doodle(FastRewindIcon)
export const User = doodle(UserIcon)

/**
 * The pack ships no bare “+” glyph, but its X (“Cross”) rotated 45° becomes a
 * hand-drawn plus — keeping the new-note actions in the same stroke style.
 */
export const Plus = forwardRef<SVGSVGElement, DoodleProps>(function Plus(props, ref) {
  const { style, className, ...rest } = props
  return (
    <span
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        lineHeight: 0,
        transform: 'rotate(45deg)',
      }}
    >
      <CrossIcon
        ref={ref}
        {...rest}
        style={{ overflow: 'visible', ...(style as CSSProperties | undefined) }}
      />
    </span>
  )
}) as unknown as LucideIcon

/* ---- Slots where the pack has no trustworthy glyph: lucide renders ---- */
export const Bold = Lucide.Bold
export const ArrowLeftRight = Lucide.ArrowLeftRight
export const BookOpen = Lucide.BookOpen
export const Braces = Lucide.Braces
export const CheckSquare = Lucide.CheckSquare
export const Code = Lucide.Code
export const Command = Lucide.Command
export const FileText = Lucide.FileText
export const Filter = Lucide.Filter
export const FilterActive = Lucide.Filter
export const GraduationCap = Lucide.GraduationCap
export const Heading1 = Lucide.Heading1
export const Heading2 = Lucide.Heading2
export const Heading3 = Lucide.Heading3
export const Italic = Lucide.Italic
export const KanbanSquare = Lucide.KanbanSquare
export const Keyboard = Lucide.Keyboard
export const Lightbulb = Lucide.Lightbulb
export const List = Lucide.List
export const ListChecks = Lucide.ListChecks
export const ListOrdered = Lucide.ListOrdered
export const LoaderCircle = Lucide.LoaderCircle
export const LayoutGrid = Lucide.LayoutGrid
export const Minus = Lucide.Minus
export const Monitor = Lucide.Monitor
export const Moon = Lucide.Moon
export const NotebookPen = Lucide.NotebookPen
export const Quote = Lucide.Quote
export const Rows3 = Lucide.Rows3
export const Search = Lucide.Search
export const Settings = Lucide.Settings
export const Settings2 = Lucide.Settings2
export const SlidersHorizontal = Lucide.SlidersHorizontal
export const Sort = Lucide.ArrowUpDown
export const SortActive = Lucide.ArrowUpDown
export const SquareCode = Lucide.SquareCode
export const Strikethrough = Lucide.Strikethrough
export const Sun = Lucide.Sun
export const SunMoon = Lucide.SunMoon
export const Underline = Lucide.Underline
export const Users = Lucide.Users
