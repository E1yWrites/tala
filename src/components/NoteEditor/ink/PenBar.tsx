import type { ReactNode } from 'react'
import { Copy, Eraser, Highlighter, Lasso, ListPlus, Palette, Pencil, PenLine, Redo2, Trash2, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { InkPointerMode } from '@/types/ink'
import { cn } from '@/utils/cn'
import { usePrefsStore } from '@/store/prefsStore'
import { Tooltip } from '../../UI/Tooltip'

/* ---------------------------------------------------------------------------
   PenBar: the pen dock shown in writing mode. On tablet and up a vertical
   column floating on the page's outer edge (right, or left in left-handed
   mode); on a phone a row along the bottom. It never scrolls away: the tools one tap apart, the current colour (opens the
   radial PenPalette for colours, sizes and presets), undo/redo, and the
   lasso's contextual actions. Clear sits last, apart from the rest.
--------------------------------------------------------------------------- */

const TOOLS: ReadonlyArray<{ tool: InkPointerMode; icon: LucideIcon; label: string }> = [
  { tool: 'pen', icon: PenLine, label: 'Marker' },
  { tool: 'pencil', icon: Pencil, label: 'Pencil' },
  { tool: 'highlighter', icon: Highlighter, label: 'Highlighter' },
  { tool: 'eraser', icon: Eraser, label: 'Eraser' },
  { tool: 'select', icon: Lasso, label: 'Lasso' },
]

export interface PenBarProps {
  tool: InkPointerMode
  color: string
  presetLabel: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onTool: (tool: InkPointerMode) => void
  /** Opens the palette anchored at this point. */
  onOpenPalette: (anchor: { x: number; y: number }) => void
  /** Count of currently selected ink strokes: drives the contextual lasso actions. */
  selectionCount: number
  onDeleteSelection?: () => void
  /** Paint the selection in the colour currently chosen in the palette. */
  onRecolorSelection?: () => void
  onDuplicateSelection?: () => void
  /** Turn the selected handwriting into an entry (expense, task, event, tick). */
  onEntrySelection?: () => void
}

export function PenBar({
  tool,
  color,
  presetLabel,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onTool,
  onOpenPalette,
  selectionCount,
  onDeleteSelection,
  onRecolorSelection,
  onDuplicateSelection,
  onEntrySelection,
}: PenBarProps): ReactNode {
  const leftHanded = usePrefsStore((st) => st.leftHanded)
  const tipSide = leftHanded ? 'right' : 'left' // tooltips point away from the page
  const current = TOOLS.find((t) => t.tool === tool)?.label ?? 'Marker'

  return (
    <div
      role="toolbar"
      aria-label="Pen tools"
      aria-orientation="vertical"
      className="flex items-center gap-1 rounded-surface border border-lineSoft bg-panel p-1.5 shadow-float animate-pen-pop-in md:w-[52px] md:flex-col"
    >
      {TOOLS.map(({ tool: t, icon: Icon, label }) => (
        <Tooltip key={t} label={label} side={tipSide}>
          <button
            type="button"
            onClick={() => onTool(t)}
            aria-label={label}
            aria-pressed={tool === t}
            className={cn(DOCK_BTN, tool === t ? 'bg-selected text-ink' : 'text-muted hover:bg-raise hover:text-ink')}
          >
            <Icon size={19} strokeWidth={tool === t ? 2.1 : 1.8} />
          </button>
        </Tooltip>
      ))}

      <hr className={DOCK_RULE} />

      <Tooltip label={`Colour and size: ${presetLabel}`} side={tipSide}>
        <button
          type="button"
          aria-label={`Open pen palette — ${current}, ${presetLabel}`}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            onOpenPalette({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
          }}
          className={cn(DOCK_BTN, 'hover:bg-raise')}
        >
          <span
            aria-hidden="true"
            className="size-6 rounded-full shadow-[inset_0_0_0_2px_rgb(255_255_255/0.85),0_0_0_1.5px_rgb(var(--c-ink))]"
            style={{ backgroundColor: color }}
          />
        </button>
      </Tooltip>

      <hr className={DOCK_RULE} />

      <button type="button" onClick={onUndo} disabled={!canUndo} aria-label="Undo handwriting" className={cn(DOCK_BTN, IDLE)}>
        <Undo2 size={18} />
      </button>
      <button type="button" onClick={onRedo} disabled={!canRedo} aria-label="Redo handwriting" className={cn(DOCK_BTN, IDLE)}>
        <Redo2 size={18} />
      </button>

      {selectionCount > 0 && (
        <>
          <hr className={DOCK_RULE} />
          <Tooltip label="Turn into an entry (₱, task, event)" side={tipSide}>
            <button type="button" onClick={onEntrySelection} aria-label="Turn selected handwriting into an entry" className={cn(DOCK_BTN, IDLE)}>
              <ListPlus size={18} />
            </button>
          </Tooltip>
          <Tooltip label="Recolor to the current colour" side={tipSide}>
            <button type="button" onClick={onRecolorSelection} aria-label="Recolor selection to the current colour" className={cn(DOCK_BTN, IDLE)}>
              <Palette size={18} />
            </button>
          </Tooltip>
          <Tooltip label="Duplicate" side={tipSide}>
            <button type="button" onClick={onDuplicateSelection} aria-label="Duplicate selection" className={cn(DOCK_BTN, IDLE)}>
              <Copy size={18} />
            </button>
          </Tooltip>
          <Tooltip label={`Delete ${selectionCount} stroke${selectionCount === 1 ? '' : 's'}`} side={tipSide}>
            <button
              type="button"
              onClick={onDeleteSelection}
              aria-label={`Delete ${selectionCount} selected stroke${selectionCount === 1 ? '' : 's'}`}
              className={cn(DOCK_BTN, 'bg-danger-soft text-danger hover:brightness-95')}
            >
              <Trash2 size={18} />
            </button>
          </Tooltip>
        </>
      )}

      <hr className={DOCK_RULE} />
      <Tooltip label="Clear this page's handwriting" side={tipSide}>
        <button type="button" onClick={onClear} aria-label="Clear handwriting" className={cn(DOCK_BTN, 'text-faint hover:bg-danger-soft hover:text-danger')}>
          <Trash2 size={17} />
        </button>
      </Tooltip>
    </div>
  )
}

const DOCK_BTN =
  'grid size-10 shrink-0 place-items-center rounded-card transition-colors duration-100 active:scale-95 disabled:pointer-events-none disabled:opacity-30'
const IDLE = 'text-muted hover:bg-raise hover:text-ink'
/** Divider: vertical between buttons in the phone row, horizontal in the tablet column. */
const DOCK_RULE = 'mx-1 h-6 w-0 shrink-0 border-0 border-l border-lineSoft md:mx-0 md:my-1 md:h-0 md:w-6 md:border-l-0 md:border-t'
