import { useEffect, useRef, useState } from 'react'
import type { WheelEvent as ReactWheelEvent } from 'react'
import type { ReactNode } from 'react'
import { Eraser, Highlighter, MousePointer2, PenTool, Pencil } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { InkEraserMode, InkPreset, InkPointerMode } from '@/types/ink'
import { INK_PRESETS, sizesForTool } from '@/types/ink'
import { cn } from '@/utils/cn'
import { Tooltip } from '../../UI/Tooltip'
import { SIZE_LABELS, PenPalette } from './PenPalette'

/* ---------------------------------------------------------------------------
   Compact pen-mode pill: one small control that shows the selected tool and
   opens the radial PenPalette. Scrolling over it steps through thickness
   presets with a transient tooltip — no large bar, no extra chrome. The
   palette can also be opened by right-clicking the ink canvas (NoteEditor
   forwards that here via controlled palette state).
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
  const strokeW = Math.min(Math.max(sizes[prefs.sizeIdx] ?? 4, 1.2), 7)
  const ToolIcon = TOOL_ICONS[prefs.tool]
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Hand focus back to the wheel button when the palette goes away.
  const wasOpen = useRef(false)
  useEffect(() => {
    if (wasOpen.current && !palette.open) triggerRef.current?.focus()
    wasOpen.current = palette.open
  }, [palette.open])

  /* --------------------- Scroll-wheel thickness control -------------------- */

  const [hint, setHint] = useState<string | null>(null)
  const hintTimer = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    },
    [],
  )

  const flashHint = (text: string) => {
    setHint(text)
    if (hintTimer.current !== null) window.clearTimeout(hintTimer.current)
    hintTimer.current = window.setTimeout(() => setHint(null), 900)
  }

  const onWheelSize = (e: ReactWheelEvent<HTMLDivElement>): void => {
    const next = Math.min(
      sizes.length - 1,
      Math.max(0, prefs.sizeIdx + (e.deltaY > 0 ? 1 : -1)),
    )
    e.preventDefault()
    if (next === prefs.sizeIdx) return
    onPrefs({ sizeIdx: next })
    flashHint(`${SIZE_LABELS[next]} · ${Math.round(sizes[next]!)} px`)
  }

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
      {/* Transient size readout while scrolling */}
      <span
        aria-hidden="true"
        className={cn(
          'absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-wobbly-sm bg-ink px-1.5 py-0.5 text-[11px] font-medium text-canvas shadow-sketch-sm transition-opacity duration-150',
          hint ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        {hint}
      </span>
      <div
        role="toolbar"
        aria-label="Pen tools"
        onWheel={onWheelSize}
        className="inline-flex w-fit items-center gap-1 rounded-full border-2 border-line bg-panel px-1 py-0.5 shadow-sketch-sm"
      >
        {/* Plain span as Tooltip's direct child: Tooltip clones its child and
            overwrites props.ref, so the button keeps its own ref this way. */}
        <Tooltip label="Pen tools — scroll here to resize">
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

        {/* Current thickness preview */}
        <svg width="20" height="8" viewBox="0 0 20 8" className="shrink-0" role="img"
          aria-label={`Stroke thickness ${Math.round(sizes[prefs.sizeIdx] ?? 4)} pixels`}>
          <line
            x1="2"
            y1="4"
            x2="18"
            y2="4"
            stroke="currentColor"
            strokeWidth={strokeW}
            strokeLinecap="round"
            className="text-faint"
          />
        </svg>
      </div>
      <span aria-live="polite" className="sr-only">
        {hint}
      </span>

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
