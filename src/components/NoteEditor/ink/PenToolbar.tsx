import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { Eraser, Highlighter, MousePointer2, PenTool, Pencil } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { InkEraserMode, InkPreset, InkPointerMode } from '@/types/ink'
import { INK_PRESETS, sizesForTool } from '@/types/ink'
import { cn } from '@/utils/cn'
import { Tooltip } from '../../UI/Tooltip'
import { PenPalette } from './PenPalette'

/* ---------------------------------------------------------------------------
   Compact pen-mode pill: tool icon + preset label + 5 width-dot selectors.
   Clicking the label cycles subtools (marker / brush-pen / ballpoint).
   Clicking a dot sets the width. Clicking the icon opens the radial palette.
--------------------------------------------------------------------------- */

const TOOL_ICONS: Record<InkPointerMode, LucideIcon> = {
  pen: PenTool,
  pencil: Pencil,
  highlighter: Highlighter,
  eraser: Eraser,
  select: MousePointer2,
}

/** Subtool groups — tools that share a rendering pipeline but have distinct presets. */
const SUBTOOL_GROUPS: Record<string, InkPreset[]> = {
  pen: ['marker', 'brush-pen', 'ballpoint'],
  pencil: ['pencil', 'fine-pencil'],
}

function nextSubtool(current: InkPreset): InkPreset {
  const spec = INK_PRESETS[current]
  const group = SUBTOOL_GROUPS[spec.tool]
  if (!group || group.length <= 1) return current
  const idx = group.indexOf(current)
  return group[(idx + 1) % group.length]
}

/**
 * Indices into the 6-slot size array to show as quick-pick dots.
 * Picks the extremes and middle values for a good spread.
 */
const QUICK_INDICES = [0, 1, 2, 4, 5] as const

/** Map a raw size value to a dot diameter (px) for the visual indicator. */
function dotSize(px: number, allSizes: number[]): number {
  const min = allSizes[0] ?? 1
  const max = allSizes[allSizes.length - 1] ?? 14
  const t = max > min ? (px - min) / (max - min) : 0.5
  return 6 + t * 8 // 6px – 14px
}

export interface PenToolbarPrefs {
  tool: InkPointerMode
  color: string
  sizeIdx: number
  eraserMode: InkEraserMode
  preset: InkPreset
}

export interface PenPaletteState {
  open: boolean
  anchor: { x: number; y: number }
  mode: 'cursor' | 'trigger'
}

interface PenToolbarProps {
  prefs: PenToolbarPrefs
  onPrefs: (patch: Partial<PenToolbarPrefs>) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  palette: PenPaletteState
  onPalette: (next: PenPaletteState | null) => void
}

export function PenToolbar({
  prefs,
  onPrefs,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  palette,
  onPalette,
}: PenToolbarProps): ReactNode {
  const sizes = sizesForTool(prefs.tool)
  const ToolIcon = TOOL_ICONS[prefs.tool]
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Hand focus back to the wheel button when the palette goes away.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !palette.open) triggerRef.current?.focus()
    wasOpen.current = palette.open
  }, [palette.open])

  const openAtTrigger = () => {
    const r = triggerRef.current?.getBoundingClientRect()
    onPalette({
      open: true,
      anchor: r ? { x: r.left + r.width / 2, y: r.bottom } : { x: 40, y: 40 },
      mode: 'trigger',
    })
  }

  return (
    <div className="relative mt-1.5 w-fit">
      <div
        role="toolbar"
        aria-label="Pen tools"
        className="inline-flex w-fit items-center gap-1 rounded-full border-2 border-line bg-panel px-1 py-0.5 shadow-sketch-sm"
      >
        {/* Tool icon — opens radial palette */}
        <Tooltip label="Open pen palette">
          <span className="inline-flex">
            <button
              ref={triggerRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={palette.open}
              aria-label="Open pen palette"
              onClick={() => (palette.open ? onPalette(null) : openAtTrigger())}
              className={cn(
                'relative grid size-7 shrink-0 place-items-center rounded-full transition-[background-color,border-color,color,transform] duration-100 hover:scale-105 active:scale-95',
                palette.open
                  ? 'bg-postit text-postit-ink ring-2 ring-accent/40'
                  : 'text-muted hover:bg-raise hover:text-ink',
              )}
            >
              <ToolIcon className="size-4" />
              <span
                aria-hidden="true"
                className="absolute -bottom-px -right-px size-2.5 rounded-full border-2 border-panel"
                style={{ backgroundColor: prefs.color }}
              />
            </button>
          </span>
        </Tooltip>

        {/* Preset label — click to cycle subtools */}
        <Tooltip label="Click to switch writing style">
          <button
            type="button"
            onClick={() => {
              const next = nextSubtool(prefs.preset)
              const spec = INK_PRESETS[next]
              onPrefs({ preset: next, tool: spec.tool, sizeIdx: spec.defaultSizeIdx })
            }}
            aria-label={`Writing style: ${INK_PRESETS[prefs.preset]?.label}. Click to cycle.`}
            className="pr-0.5 text-[11px] font-medium text-muted hover:text-ink transition-colors"
          >
            {INK_PRESETS[prefs.preset]?.label ?? prefs.tool}
          </button>
        </Tooltip>

        <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-lineSoft" />

        {/* 5 width dots — quick pick */}
        <div className="flex items-center gap-0.5" role="radiogroup" aria-label="Stroke width">
          {QUICK_INDICES.map((qi) => {
            const sizeVal = sizes[qi]
            if (sizeVal === undefined) return null
            const isActive = prefs.sizeIdx === qi
            const dot = dotSize(sizeVal, sizes)
            return (
              <Tooltip key={qi} label={`${Math.round(sizeVal)} px`}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  aria-label={`${Math.round(sizeVal)} pixels`}
                  onClick={() => onPrefs({ sizeIdx: qi })}
                  className={cn(
                    'rounded-full transition-[background-color,transform] duration-100 hover:scale-110 active:scale-90',
                    isActive
                      ? 'bg-ink'
                      : 'bg-faint hover:bg-muted',
                  )}
                  style={{ width: dot, height: dot }}
                />
              </Tooltip>
            )
          })}
        </div>
      </div>

      <PenPalette
        open={palette.open}
        anchor={palette.anchor}
        anchorMode={palette.mode}
        prefs={prefs}
        onPrefs={onPrefs}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={onUndo}
        onRedo={onRedo}
        onClear={onClear}
        onClose={() => onPalette(null)}
      />
    </div>
  )
}
