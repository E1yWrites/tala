import { Eraser, Highlighter, MousePointer2, Pencil, Redo2, Trash2, Undo2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { InkEraserMode, InkPointerMode } from '@/types/ink'
import { cn } from '@/utils/cn'
import { Tooltip } from '../../UI/Tooltip'
import { HIGHLIGHTER_SIZES, PEN_SIZES } from './InkLayer'

/* ---------------------------------------------------------------------------
   Contextual toolbar shown while Pen Mode is active. Styled after the
   EditorToolbar (panel bg, wobbly border, sketch shadow) so it reads as part
   of the same editor chrome. Keyboard accessible: real buttons with
   aria-pressed and tooltips throughout.
--------------------------------------------------------------------------- */

/** Ink swatches — fixed physical pen colors (independent of light/dark theme). */
const SWATCHES = [
  { color: '#2d2d2d', label: 'Graphite' },
  { color: '#2d5da1', label: 'Ballpoint blue' },
  { color: '#ff4d4d', label: 'Red marker' },
  { color: '#16a34a', label: 'Green' },
  { color: '#d97706', label: 'Amber' },
] as const

interface ToolSpec {
  id: Extract<InkPointerMode, 'pen' | 'highlighter' | 'eraser' | 'select'>
  icon: LucideIcon
  label: string
}

const TOOLS: ToolSpec[] = [
  { id: 'pen', icon: Pencil, label: 'Pen' },
  { id: 'highlighter', icon: Highlighter, label: 'Highlighter' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'select', icon: MousePointer2, label: 'Select & move ink' },
]

export interface PenToolbarPrefs {
  tool: InkPointerMode
  color: string
  sizeIdx: number
  eraserMode: InkEraserMode
}

interface PenToolbarProps {
  prefs: PenToolbarPrefs
  onPrefs: (patch: Partial<PenToolbarPrefs>) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
}

export function PenToolbar({
  prefs,
  onPrefs,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
}: PenToolbarProps): React.ReactNode {
  const sizes = prefs.tool === 'highlighter' ? HIGHLIGHTER_SIZES : PEN_SIZES

  return (
    <div
      role="toolbar"
      aria-label="Pen tools"
      className="no-scrollbar mt-1.5 flex flex-wrap items-center gap-0.5 rounded-wobbly-md border-2 border-line bg-panel px-1.5 py-1 shadow-sketch-sm"
    >
      {/* Tools */}
      {TOOLS.map((t) => (
        <Tooltip key={t.id} label={t.label}>
          <button
            type="button"
            onClick={() => onPrefs({ tool: t.id })}
            aria-pressed={prefs.tool === t.id}
            aria-label={t.label}
            className={cn(
              'grid size-7 shrink-0 place-items-center rounded-wobbly-sm transition-colors duration-100',
              prefs.tool === t.id
                ? 'bg-postit text-postit-ink'
                : 'text-muted hover:bg-raise hover:text-ink',
            )}
          >
            <t.icon size={14} strokeWidth={prefs.tool === t.id ? 2.75 : 2} />
          </button>
        </Tooltip>
      ))}

      {/* Eraser behavior toggle */}
      {prefs.tool === 'eraser' && (
        <span
          role="radiogroup"
          aria-label="Eraser mode"
          className="ml-1 flex items-center gap-px rounded-wobbly-sm border border-lineSoft p-px"
        >
          {(
            [
              { id: 'stroke', label: 'Whole strokes' },
              { id: 'pixel', label: 'Partial erase' },
            ] as const
          ).map((m) => (
            <Tooltip key={m.id} label={m.label}>
              <button
                type="button"
                role="radio"
                aria-checked={prefs.eraserMode === m.id}
                onClick={() => onPrefs({ eraserMode: m.id })}
                className={cn(
                  'rounded-[5px] px-1.5 py-0.5 text-[11px] font-medium transition-colors',
                  prefs.eraserMode === m.id
                    ? 'bg-postit text-postit-ink'
                    : 'text-muted hover:text-ink',
                )}
              >
                {m.id === 'stroke' ? 'Stroke' : 'Pixel'}
              </button>
            </Tooltip>
          ))}
        </span>
      )}

      <Sep />

      {/* Undo / redo for the ink layer */}
      <Tooltip label="Undo stroke">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo handwriting"
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-wobbly-sm transition-colors duration-100',
            canUndo ? 'text-muted hover:bg-raise hover:text-ink' : 'pointer-events-none opacity-35',
          )}
        >
          <Undo2 size={14} />
        </button>
      </Tooltip>
      <Tooltip label="Redo stroke">
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo handwriting"
          className={cn(
            'grid size-7 shrink-0 place-items-center rounded-wobbly-sm transition-colors duration-100',
            canRedo ? 'text-muted hover:bg-raise hover:text-ink' : 'pointer-events-none opacity-35',
          )}
        >
          <Redo2 size={14} />
        </button>
      </Tooltip>

      <Sep />

      {/* Colors */}
      {SWATCHES.map((s) => (
        <Tooltip key={s.color} label={s.label}>
          <button
            type="button"
            onClick={() => onPrefs({ color: s.color })}
            aria-pressed={prefs.color === s.color}
            aria-label={`${s.label} ink`}
            style={{ backgroundColor: s.color }}
            className={cn(
              'size-5 shrink-0 rounded-full border-2 transition-transform duration-100',
              prefs.color === s.color
                ? 'scale-110 border-accent ring-2 ring-accent/30'
                : 'border-white/70 hover:scale-105 dark:border-black/40',
            )}
          />
        </Tooltip>
      ))}
      <Tooltip label="Custom color">
        <label
          aria-label="Custom ink color"
          className="relative size-5 shrink-0 cursor-pointer overflow-hidden rounded-full border-2 border-white/70 dark:border-black/40"
          style={{
            background:
              'conic-gradient(#ff4d4d, #d97706, #16a34a, #2d5da1, #7c3aed, #ff4d4d)',
          }}
        >
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(prefs.color) ? prefs.color : '#2d5da1'}
            onChange={(e) => onPrefs({ color: e.target.value })}
            className="absolute inset-0 cursor-pointer opacity-0"
            tabIndex={-1}
          />
        </label>
      </Tooltip>

      <Sep />

      {/* Thickness presets */}
      <span role="radiogroup" aria-label="Stroke thickness" className="flex items-center gap-0.5">
        {[0, 1, 2].map((i) => (
          <Tooltip key={i} label={['Thin', 'Medium', 'Thick'][i]!}>
            <button
              type="button"
              role="radio"
              aria-checked={prefs.sizeIdx === i}
              aria-label={['Thin', 'Medium', 'Thick'][i]}
              onClick={() => onPrefs({ sizeIdx: i })}
              className={cn(
                'grid h-7 w-6 place-items-center rounded-wobbly-sm transition-colors',
                prefs.sizeIdx === i ? 'bg-postit' : 'hover:bg-raise',
              )}
            >
              <span
                className={cn(
                  'rounded-full',
                  prefs.sizeIdx === i ? 'bg-postit-ink' : 'bg-muted',
                )}
                style={{ width: 3 + i * 3, height: 3 + i * 3 }}
              />
            </button>
          </Tooltip>
        ))}
      </span>

      <Sep />

      {/* Clear all ink (undoable) */}
      <Tooltip label="Clear handwriting">
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear handwriting"
          className="grid size-7 shrink-0 place-items-center rounded-wobbly-sm text-muted transition-colors duration-100 hover:bg-accent-soft hover:text-accent"
        >
          <Trash2 size={14} />
        </button>
      </Tooltip>

      {/* Current size hint (hidden on narrow widths) */}
      <span
        aria-hidden="true"
        className="ml-auto hidden pr-1 text-[11px] tabular-nums text-faint sm:block"
      >
        {Math.round(sizes[prefs.sizeIdx] ?? sizes[1]!)} px
      </span>
    </div>
  )
}

function Sep(): React.ReactNode {
  return <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-lineSoft" />
}
