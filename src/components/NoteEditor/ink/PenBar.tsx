import type { ReactNode } from 'react'
import { MousePointer2, Pencil, PenTool, Highlighter, Eraser, Undo2, Redo2, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { InkPointerMode } from '@/types/ink'
import { cn } from '@/utils/cn'
import { usePrefsStore } from '@/store/prefsStore'
import { Tooltip } from '../../UI/Tooltip'

/* ---------------------------------------------------------------------------
   PenBar — the primary pen control bar shown in writing mode (replaces the
   old PenToolbar that duplicated the palette trigger + cluster).

   A pill-shaped "what am I holding" button opens the radial PenPalette in
   trigger mode; compact undo/redo/clear cluster sits beside it. A delete-
   selection button appears contextually when select tool is active.
--------------------------------------------------------------------------- */

const TOOL_ICONS: Record<InkPointerMode, LucideIcon> = {
  pen: PenTool,
  pencil: Pencil,
  highlighter: Highlighter,
  eraser: Eraser,
  select: MousePointer2,
}

const TOOL_LABELS: Record<InkPointerMode, string> = {
  pen: 'Marker',
  pencil: 'Pencil',
  highlighter: 'Highlighter',
  eraser: 'Eraser',
  select: 'Lasso',
}

export interface PenBarProps {
  tool: InkPointerMode
  color: string
  presetLabel: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  /** Wire this to `onPaletteRequest` anchor to open palette from the pill. */
  onOpenPalette: (anchor: { x: number; y: number }) => void
  /** Count of currently selected ink strokes — drives the contextual delete button. */
  selectionCount: number
  onDeleteSelection?: () => void
  /** Paint the selection in the colour currently chosen in the palette. */
  onRecolorSelection?: () => void
  onDuplicateSelection?: () => void
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
  onOpenPalette,
  selectionCount,
  onDeleteSelection,
  onRecolorSelection,
  onDuplicateSelection,
}: PenBarProps): ReactNode {
  const ToolIcon = TOOL_ICONS[tool]
  const leftHanded = usePrefsStore((st) => st.leftHanded)

  return (
    <div className={cn('flex items-center gap-1.5', leftHanded && 'flex-row-reverse')}>
      {/* Primary pen/eraser control — opens the radial palette in trigger mode */}
      <Tooltip label={TOOL_LABELS[tool]}>
        <button
          type="button"
          aria-label={`Open pen palette — ${TOOL_LABELS[tool]}, ${presetLabel}`}
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            onOpenPalette({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
          }}
          className="flex items-center gap-1.5 rounded-full border border-line bg-panel px-3 py-1.5 text-sm shadow-sm transition-[background-color,border-color] hover:border-accent/60 hover:bg-raise active:scale-[0.98]"
        >
          <ToolIcon className="size-4 text-muted" />
          <span className="text-[13px] font-medium text-ink">{presetLabel}</span>
          <span
            aria-hidden="true"
            className="size-2 rounded-full border border-white/60 dark:border-black/30"
            style={{ backgroundColor: color }}
          />
        </button>
      </Tooltip>

      {/* Undo / redo / clear cluster — compact, faded when inactive */}
      <span className="flex items-center gap-px rounded-full border border-lineSoft bg-canvas/60 p-px">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo handwriting"
          className={cn(
            'rounded-full p-1.5 transition-colors duration-100',
            canUndo
              ? 'text-muted hover:text-ink hover:bg-raise'
              : 'pointer-events-none opacity-30',
          )}
        >
          <Undo2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo handwriting"
          className={cn(
            'rounded-full p-1.5 transition-colors duration-100',
            canRedo
              ? 'text-muted hover:text-ink hover:bg-raise'
              : 'pointer-events-none opacity-30',
          )}
        >
          <Redo2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear handwriting"
          className="rounded-full p-1.5 text-faint transition-colors duration-100 hover:text-accent hover:bg-raise"
        >
          <Trash2 className="size-3.5" />
        </button>
      </span>

      {/* Contextual lasso actions: appear when the select tool has a selection */}
      {selectionCount > 0 && (
        <span className="flex items-center gap-px rounded-full border border-lineSoft bg-canvas/60 p-px text-xs">
          <button
            type="button"
            onClick={onRecolorSelection}
            aria-label="Recolor selection to the current colour"
            className="flex items-center gap-1 rounded-full px-2 py-1 text-muted transition-colors hover:bg-raise hover:text-ink"
          >
            <span
              aria-hidden="true"
              className="size-2 rounded-full border border-white/60 dark:border-black/30"
              style={{ backgroundColor: color }}
            />
            Recolor
          </button>
          <button
            type="button"
            onClick={onDuplicateSelection}
            aria-label="Duplicate selection"
            className="rounded-full px-2 py-1 text-muted transition-colors hover:bg-raise hover:text-ink"
          >
            Duplicate
          </button>
        </span>
      )}
      {selectionCount > 0 && (
        <Tooltip label={`Delete ${selectionCount} stroke${selectionCount === 1 ? '' : 's'}`}>
          <button
            type="button"
            onClick={onDeleteSelection}
            aria-label={`Delete ${selectionCount} selected stroke${selectionCount === 1 ? '' : 's'}`}
            className="rounded-full bg-selected p-1.5 text-selected-ink shadow-sm transition-[background-color] hover:bg-accent/20 active:scale-95"
          >
            <Trash2 className="size-3.5" />
          </button>
        </Tooltip>
      )}
    </div>
  )
}
