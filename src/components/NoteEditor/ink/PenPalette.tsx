import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { CSSProperties, ReactNode } from 'react'
import {
  ArrowLeft,
  Check,
  Eraser,
  Highlighter,
  MousePointer2,
  PenTool,
  Pencil,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { InkEraserMode, InkPreset, InkPointerMode } from '@/types/ink'
import { INK_PRESETS, sizesForTool } from '@/types/ink'
import type { PencilAction, PencilShortcuts } from '@/store/prefsStore'
import { PENCIL_ACTIONS } from '@/store/prefsStore'
import { cn } from '@/utils/cn'
import { Tooltip } from '../../UI/Tooltip'

/* ---------------------------------------------------------------------------
   Radial pen palette — a floating tool wheel for the handwriting layer,
   inspired by stylus-first note apps but drawn in Tala's sketch language
   (panel bg, line/postit tokens, wobbly shadows).

   One circular shell hosts four views:
     tools  — pen / pencil / highlighter / eraser / select around a colour hub,
              with a subtool (preset) strip and pencil-shortcut gear for pen tools
     color  — ten ink swatches around the custom picker hub
     size   — six true-thickness stroke previews around a back hub
     pencil — Apple Pencil shortcut actions (double-tap / squeeze / hover ring)
   Selecting a tool keeps the wheel open (fast switching); picking a colour
   returns to the tools view. Esc / outside press / scroll dismiss it.
--------------------------------------------------------------------------- */

/** Fixed physical ink colours (independent of light/dark theme). */
export const INK_SWATCHES = [
  { color: '#111111', label: 'Black' },
  { color: '#4b5563', label: 'Dark gray' },
  { color: '#dc2626', label: 'Red' },
  { color: '#ea580c', label: 'Orange' },
  { color: '#eab308', label: 'Yellow' },
  { color: '#16a34a', label: 'Green' },
  { color: '#2563eb', label: 'Blue' },
  { color: '#7c3aed', label: 'Purple' },
  { color: '#ec4899', label: 'Pink' },
  { color: '#f8fafc', label: 'White' },
] as const

const SIZE_LABELS = ['Hairline', 'Thin', 'Medium', 'Thick', 'Bold', 'Marker']
export { SIZE_LABELS }

interface ToolSpec {
  id: Extract<InkPointerMode, 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'select'>
  icon: LucideIcon
  label: string
  /** Idle icon tint — physical stationery colours so every tool reads at a glance. */
  tone?: string
}

const TOOLS: ToolSpec[] = [
  { id: 'pen', icon: PenTool, label: 'Marker', tone: 'text-ballpoint dark:text-ballpoint' },
  { id: 'pencil', icon: Pencil, label: 'Pencil', tone: 'text-[#6f665a] dark:text-[#a89f92]' },
  { id: 'highlighter', icon: Highlighter, label: 'Highlighter', tone: 'text-[#d69e04] dark:text-[#f0b429]' },
  { id: 'eraser', icon: Eraser, label: 'Eraser', tone: 'text-[#db4a8c] dark:text-[#ec4899]' },
  { id: 'select', icon: MousePointer2, label: 'Lasso' },
]

export interface PenPalettePrefs {
  tool: InkPointerMode
  color: string
  sizeIdx: number
  eraserMode: InkEraserMode
  preset: InkPreset
  pencil: PencilShortcuts
}

/** Whether the palette is shown and where its anchor sits in the viewport. */
export interface PenPaletteState {
  open: boolean
  anchor: { x: number; y: number }
  mode: 'cursor' | 'trigger'
}

/** Subtool presets offered for each writing tool (the "what am I holding" strip). */
const PRESETS_BY_TOOL: Record<'pen' | 'pencil', InkPreset[]> = {
  pen: ['marker', 'brush-pen', 'ballpoint'],
  pencil: ['pencil', 'fine-pencil'],
}

/** Short strip labels — full names live in tooltips / INK_PRESETS ids. */
const PRESET_LABELS: Record<InkPreset, string> = {
  marker: 'Marker',
  pencil: 'Pencil',
  'brush-pen': 'Brush',
  'fine-pencil': 'Fine',
  highlighter: 'Highlighter',
  ballpoint: 'Ballpoint',
}

const PENCIL_ACTION_LABELS: Record<PencilAction, string> = {
  eraser: 'Eraser',
  pen: 'Pen mode',
  undo: 'Undo',
  palette: 'Palette',
  none: 'Off',
}

type View = 'tools' | 'color' | 'size' | 'pencil'

interface PenPaletteProps {
  open: boolean
  /** Viewport-space anchor point (cursor for right-click, trigger centre otherwise). */
  anchor: { x: number; y: number }
  anchorMode?: 'cursor' | 'trigger'
  prefs: PenPalettePrefs
  onPrefs: (patch: Partial<PenPalettePrefs>) => void
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onClear: () => void
  onClose: () => void
}

const SIZE = 252
const CENTER = SIZE / 2
const OUTER_R = 95
const INNER_R = 56

/**
 * Compass degrees (0 = top) + radius → top/left for an absolutely centred
 * node of `node` px. Hexagon slots read clockwise from 12 o'clock.
 */
function slot(deg: number, r: number, node: number): CSSProperties {
  const rad = ((deg - 90) * Math.PI) / 180
  return {
    left: Math.round(CENTER + r * Math.cos(rad) - node / 2),
    top: Math.round(CENTER + r * Math.sin(rad) - node / 2),
  }
}

/** Rough luminance so the selection tick stays visible on any swatch. */
function isLight(hex: string): boolean {
  let n = hex.replace('#', '')
  if (n.length === 3) n = [...n].map((c) => c + c).join('')
  const r = parseInt(n.slice(0, 2), 16)
  const g = parseInt(n.slice(2, 4), 16)
  const b = parseInt(n.slice(4, 6), 16)
  return Number.isNaN(r + g + b) || 0.299 * r + 0.587 * g + 0.114 * b > 150
}

/**
 * Places the measured shell so it never leaves the viewport. Cursor mode
 * floats above the point (flipping below near the top edge, shifting inward
 * near the left/right edges); trigger mode opens beneath like a popover and
 * flips above when there is no room.
 */
function computePosition(
  anchor: { x: number; y: number },
  mode: 'cursor' | 'trigger',
  w: number,
  h: number,
): { left: number; top: number } {
  const pad = 8
  const maxX = document.documentElement.clientWidth - w - pad
  const maxY = document.documentElement.clientHeight - h - pad

  let left = anchor.x - w / 2
  if (mode === 'cursor') {
    if (left < pad) left = anchor.x + 16
    else if (left > maxX) left = anchor.x - w - 16
  }
  let top = mode === 'cursor' ? anchor.y - h - 14 : anchor.y + 16
  if (top < pad) top = anchor.y + 20
  else if (top > maxY) top = anchor.y - h - 16

  return {
    left: Math.min(Math.max(left, pad), Math.max(pad, maxX)),
    top: Math.min(Math.max(top, pad), Math.max(pad, maxY)),
  }
}

export function PenPalette({
  open,
  anchor,
  anchorMode = 'trigger',
  prefs,
  onPrefs,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onClose,
}: PenPaletteProps): ReactNode {
  const [view, setView] = useState<View>('tools')
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const [closing, setClosing] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number | null>(null)

  // Hidden first paint: the shell must be in the DOM before it can be
  // measured, so it mounts offscreen/invisible and gets placed right after.
  const PLACE_OFFSCREEN = { left: -9999, top: -9999 }

  useEffect(() => {
    if (open) {
      setView('tools')
      setClosing(false)
    }
  }, [open])

  const requestClose = useCallback(() => {
    if (closeTimer.current !== null || closing) return
    setClosing(true)
    closeTimer.current = window.setTimeout(() => {
      closeTimer.current = null
      setClosing(false)
      onClose()
    }, 130)
  }, [closing, onClose])

  useEffect(
    () => () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current)
    },
    [],
  )

  const measure = useCallback(() => {
    if (!open) return
    const el = shellRef.current
    if (!el) return
    setPos(computePosition(anchor, anchorMode, el.offsetWidth, el.offsetHeight))
  }, [anchor, anchorMode, open])

  useLayoutEffect(measure, [measure])
  // Dismissers: outside press, Escape, page scroll (the anchor would drift).
  useEffect(() => {
    if (!open || closing) return
    const onDown = (e: PointerEvent) => {
      if (shellRef.current && !shellRef.current.contains(e.target as Node)) requestClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        requestClose()
      }
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('scroll', requestClose, true)
    window.addEventListener('resize', requestClose)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('scroll', requestClose, true)
      window.removeEventListener('resize', requestClose)
    }
  }, [open, closing, requestClose])

  // Initial focus lands on the active control of the current view.
  useEffect(() => {
    if (!open || closing) return
    const raf = requestAnimationFrame(() => {
      shellRef.current?.querySelector<HTMLElement>('[data-current="true"]')?.focus()
    })
    return () => cancelAnimationFrame(raf)
  }, [open, closing, view])

  if (!open) return null

  const sizes = sizesForTool(prefs.tool)

  const pickTool = (id: ToolSpec['id']) => {
    // Eraser and select are non-preset tools: preserve the current writing preset
    if (id === 'eraser' || id === 'select') {
      onPrefs({ tool: id })
      if (view !== 'tools') setView('tools')
      return
    }
    // If clicking the already-active preset-bearing tool, don't reset its size
    if (prefs.tool === id) {
      if (view !== 'tools') setView('tools')
      return
    }
    // Map tool selection to the primary preset for that tool
    const presetMap: Record<ToolSpec['id'], InkPreset> = {
      pen: 'marker',
      pencil: 'pencil',
      highlighter: 'highlighter',
      eraser: 'marker',
      select: 'marker',
    }
    const preset = presetMap[id]
    const spec = INK_PRESETS[preset]
    onPrefs({ tool: id, preset, sizeIdx: spec.defaultSizeIdx })
    if (view !== 'tools') setView('tools')
  }

  const pickColor = (color: string) => {
    onPrefs({ color })
    setView('tools')
  }

  /** Choosing a subtool preset adopts its default thickness. */
  const pickPreset = (preset: InkPreset) => {
    if (prefs.preset === preset) return
    onPrefs({ preset, sizeIdx: INK_PRESETS[preset].defaultSizeIdx })
  }

  const nextAction = (a: PencilAction): PencilAction => {
    const i = PENCIL_ACTIONS.indexOf(a)
    return PENCIL_ACTIONS[(i + 1) % PENCIL_ACTIONS.length]!
  }

  const nodeBase =
    'grid place-items-center rounded-full border transition-[background-color,border-color,color,transform] duration-100 hover:scale-105 active:scale-95'
  const idle =
    'border-transparent bg-panel text-muted hover:bg-raise dark:hover:bg-raise'
  // Contract (matches EditorToolbar / PenBar): picked = postit fill +
  // accent ring; idle = muted → ink on hover. No per-tool special cases.
  const picked = 'border-accent bg-selected text-selected-ink shadow-rest ring-2 ring-accent/40'

  /** Absolute wrapper carries the polar slot + stagger; Tooltip stays flow-safe inside. */
  const orbit = (
    key: string,
    style: CSSProperties,
    delay: number,
    tip: string,
    button: ReactNode,
  ): ReactNode => (
    <span
      key={key}
      style={{ ...style, animationDelay: `${delay}ms` }}
      className="absolute animate-pen-node"
    >
      <Tooltip label={tip}>{button}</Tooltip>
    </span>
  )

  /* --------------------------------- Tools --------------------------------- */

  const toolNodes = TOOLS.map((t, i) => {
    const active = prefs.tool === t.id
    return orbit(
      t.id,
      slot(i * 60, OUTER_R, 44),
      i * 22,
      t.label,
      <button
        type="button"
        role="radio"
        aria-checked={active}
        aria-label={t.label}
        data-current={active || undefined}
        onClick={() => pickTool(t.id)}
        className={cn(
          nodeBase,
          'size-11',
          active ? picked : cn(idle, t.tone),
        )}
      >
        <t.icon className="size-[19px]" />
      </button>,
    )
  })

  const toolsView = (
    <>
      {/* Undo / redo / clear tuck into the corners and the free right-middle
          slot — hexagon nodes own everything else on the rim */}
      {orbit(
        'undo',
        { left: 20, top: 20 },
        110,
        'Undo stroke',
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Undo handwriting"
          className={cn(nodeBase, 'size-8', canUndo ? idle : 'pointer-events-none opacity-35')}
        >
          <Undo2 className="size-4" />
        </button>,
      )}
      {orbit(
        'redo',
        { right: 20, top: 20 },
        130,
        'Redo stroke',
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Redo handwriting"
          className={cn(nodeBase, 'size-8', canRedo ? idle : 'pointer-events-none opacity-35')}
        >
          <Redo2 className="size-4" />
        </button>,
      )}
      {orbit(
        'clear',
        { left: CENTER + OUTER_R - 16, top: CENTER - 16 },
        150,
        'Clear handwriting',
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear handwriting"
          className={cn(nodeBase, 'size-8 text-faint hover:text-accent')}
        >
          <Trash2 className="size-[15px]" />
        </button>,
      )}
      {toolNodes}
      {/* Stroke-size node fills the sixth hexagon slot */}
      {orbit(
        'hub-size',
        slot(300, OUTER_R, 44),
        120,
        'Stroke size',
        <button
          type="button"
          aria-label="Change stroke size"
          onClick={() => setView('size')}
          className={cn(nodeBase, 'size-11', idle)}
        >
          <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
            <line
              x1="3"
              y1="6"
              x2="23"
              y2="6"
              stroke="currentColor"
              strokeWidth={Math.min(Math.max(sizes[prefs.sizeIdx] ?? 4, 1.2), 7)}
              strokeLinecap="round"
            />
          </svg>
        </button>,
      )}
      {/* Colour hub — shows the current ink */}
      {orbit(
        'hub-color',
        { left: CENTER - 27, top: CENTER - 27 },
        100,
        'Ink colour',
        <button
          type="button"
          aria-label={`Change ink colour — current ${prefs.color}`}
          data-current="true"
          onClick={() => setView('color')}
          className={cn(nodeBase, 'size-[54px] border-line hover:border-ballpoint')}
        >
          <span
            aria-hidden="true"
            className="size-7 rounded-full border border-white/80 shadow-inner dark:border-black/50"
            style={{ backgroundColor: prefs.color }}
          />
        </button>,
      )}
      {/* Writing tools get their subtool strip. The Apple Pencil shortcut gear is
          hidden: no browser exposes double-tap/squeeze, so nothing dispatches tala:pencil. */}
      {prefs.tool === 'pen' || prefs.tool === 'pencil' ? (
        <span className="absolute inset-x-0 top-[158px] flex items-center justify-center gap-1.5">
          <span
            role="radiogroup"
            aria-label={`${prefs.tool === 'pen' ? 'Pen' : 'Pencil'} preset`}
            className="flex items-center gap-px rounded-full border border-lineSoft bg-canvas p-px"
          >
            {PRESETS_BY_TOOL[prefs.tool].map((preset) => (
              <Tooltip key={preset} label={preset}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={prefs.preset === preset}
                  onClick={() => pickPreset(preset)}
                  className={cn(
                    'rounded-full px-2.5 py-0.5 text-[11px] font-medium transition-[background-color,border-color,color] duration-100',
                    prefs.preset === preset
                      ? 'bg-selected text-selected-ink ring-2 ring-accent/40'
                      : 'text-muted hover:text-ink',
                  )}
                >
                  {PRESET_LABELS[preset]}
                </button>
              </Tooltip>
            ))}
          </span>
        </span>
      ) : (
        prefs.tool === 'eraser' && (
          <span className="absolute inset-x-0 top-[158px] flex justify-center">
            <span
              role="radiogroup"
              aria-label="Eraser mode"
              className="flex items-center gap-px rounded-full border border-lineSoft bg-canvas p-px"
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
                      'rounded-full px-2 py-0.5 text-[11px] font-medium transition-[background-color,border-color,color] duration-100',
                      prefs.eraserMode === m.id
                        ? 'bg-selected text-selected-ink ring-2 ring-accent/40'
                        : 'text-muted hover:text-ink',
                    )}
                  >
                    {m.id === 'stroke' ? 'Stroke' : 'Pixel'}
                  </button>
                </Tooltip>
              ))}
            </span>
          </span>
        )
      )}
    </>
  )

  /* --------------------------------- Colour -------------------------------- */

  const customColor = !INK_SWATCHES.some((s) => s.color.toLowerCase() === prefs.color.toLowerCase())

  const colorView = (
    <>
      {INK_SWATCHES.map((s, i) => {
        const active = prefs.color.toLowerCase() === s.color.toLowerCase()
        const outer = i < 6
        const deg = outer ? i * 60 : (i - 6) * 90 + 45
        return orbit(
          s.color,
          slot(deg, outer ? OUTER_R : INNER_R, 38),
          i * 16,
          `${s.label} ink`,
          <button
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${s.label} ink`}
            data-current={active || undefined}
            onClick={() => pickColor(s.color)}
            className={cn(
              nodeBase,
              'size-[38px] p-0',
              active
                ? 'border-accent ring-2 ring-accent/40'
                : 'border-white/70 hover:border-accent/60 dark:border-black/40',
            )}
          >
            <span
              aria-hidden="true"
              className="grid size-full place-items-center rounded-full"
              style={{ backgroundColor: s.color }}
            >
              {active && (
                <Check
                  className="size-[15px]"
                  style={{ color: isLight(s.color) ? '#111827' : '#ffffff' }}
                />
              )}
            </span>
          </button>,
        )
      })}
      {/* Custom picker as the hub */}
      {orbit(
        'hub-custom',
        { left: CENTER - 24, top: CENTER - 24 },
        160,
        'Custom colour…',
        <label
          aria-label="Custom ink colour"
          data-current={customColor || undefined}
          className={cn(
            nodeBase,
            'relative size-12 cursor-pointer overflow-hidden border-line hover:border-ballpoint',
          )}
        >
          <span
            aria-hidden="true"
            className="size-8 rounded-full border border-white/80 dark:border-black/50"
            style={{
              background:
                'conic-gradient(#dc2626, #ea580c, #eab308, #16a34a, #2563eb, #7c3aed, #ec4899, #dc2626)',
            }}
          />
          <input
            type="color"
            value={/^#[0-9a-f]{6}$/i.test(prefs.color) ? prefs.color : '#2563eb'}
            onChange={(e) => pickColor(e.target.value)}
            className="absolute inset-0 cursor-pointer opacity-0"
            tabIndex={-1}
          />
        </label>,
      )}
    </>
  )

  /* ---------------------------------- Size ---------------------------------- */

  const sizeView = (
    <>
      {sizes.map((px, i) => {
        const active = prefs.sizeIdx === i
        return orbit(
          `size-${i}`,
          slot(i * 60, OUTER_R, 44),
          i * 22,
          `${SIZE_LABELS[i]} · ${Math.round(px)} px`,
          <button
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${SIZE_LABELS[i]} stroke, ${Math.round(px)} pixels`}
            data-current={active || undefined}
            onClick={() => onPrefs({ sizeIdx: i })}
            className={cn(nodeBase, 'size-11', active ? picked : idle)}
          >
            <svg width="26" height="12" viewBox="0 0 26 12" aria-hidden="true">
              <line
                x1="3"
                y1="6"
                x2="23"
                y2="6"
                stroke="currentColor"
                strokeWidth={Math.min(Math.max(px, 1.2), 7)}
                strokeLinecap="round"
              />
            </svg>
          </button>,
        )
      })}
      {orbit(
        'hub-back',
        { left: CENTER - 27, top: CENTER - 27 },
        140,
        'Back to tools',
        <button
          type="button"
          aria-label="Back to tools"
          data-current="true"
          onClick={() => setView('tools')}
          className={cn(nodeBase, 'size-[54px] border-line text-muted hover:text-ink')}
        >
          <ArrowLeft className="size-5" />
        </button>,
      )}
    </>
  )

  /* ----------------------------- Pencil shortcuts ----------------------------- */

  const pencilView = (
    <>
      {orbit(
        'double-tap',
        slot(0, OUTER_R, 44),
        80,
        `Double-tap → ${PENCIL_ACTION_LABELS[prefs.pencil.doubleTap]}`,
        <button
          type="button"
          aria-label={`Double-tap action: ${PENCIL_ACTION_LABELS[prefs.pencil.doubleTap]}. Click to cycle.`}
          onClick={() =>
            onPrefs({ pencil: { ...prefs.pencil, doubleTap: nextAction(prefs.pencil.doubleTap) } })
          }
          className={cn(nodeBase, 'size-11 flex-col text-center leading-none')}
        >
          <span className="text-[9px] text-muted">Double-tap</span>
          <span className="text-[10px] font-semibold text-selected-ink">
            {PENCIL_ACTION_LABELS[prefs.pencil.doubleTap]}
          </span>
        </button>,
      )}
      {orbit(
        'squeeze',
        slot(120, OUTER_R, 44),
        100,
        `Squeeze → ${PENCIL_ACTION_LABELS[prefs.pencil.squeeze]}`,
        <button
          type="button"
          aria-label={`Squeeze action: ${PENCIL_ACTION_LABELS[prefs.pencil.squeeze]}. Click to cycle.`}
          onClick={() =>
            onPrefs({ pencil: { ...prefs.pencil, squeeze: nextAction(prefs.pencil.squeeze) } })
          }
          className={cn(nodeBase, 'size-11 flex-col text-center leading-none')}
        >
          <span className="text-[9px] text-muted">Squeeze</span>
          <span className="text-[10px] font-semibold text-selected-ink">
            {PENCIL_ACTION_LABELS[prefs.pencil.squeeze]}
          </span>
        </button>,
      )}
      {orbit(
        'hover',
        slot(240, OUTER_R, 44),
        120,
        prefs.pencil.hover ? 'Hover ring on' : 'Hover ring off',
        <button
          type="button"
          aria-label={`Hover ring: ${prefs.pencil.hover ? 'on' : 'off'}. Click to toggle.`}
          onClick={() => onPrefs({ pencil: { ...prefs.pencil, hover: !prefs.pencil.hover } })}
          className={cn(
            nodeBase,
            'size-11',
            prefs.pencil.hover
              ? 'border-accent bg-selected text-selected-ink ring-2 ring-accent/40'
              : idle,
          )}
        >
          <span className="text-[10px] font-semibold">{prefs.pencil.hover ? 'On' : 'Off'}</span>
        </button>,
      )}
      {orbit(
        'hub-back',
        { left: CENTER - 27, top: CENTER - 27 },
        140,
        'Back to tools',
        <button
          type="button"
          aria-label="Back to tools"
          data-current="true"
          onClick={() => setView('tools')}
          className={cn(nodeBase, 'size-[54px] border-line text-muted hover:text-ink')}
        >
          <ArrowLeft className="size-5" />
        </button>,
      )}
    </>
  )

  return createPortal(
    <div
      ref={shellRef}
      role="dialog"
      aria-label="Pen tool palette"
      className={cn(
        'fixed z-[80] select-none rounded-full border border-lineSoft bg-panel/90 shadow-float backdrop-blur-md dark:bg-panel/80',
        pos && (closing ? 'animate-pen-pop-out' : 'animate-pen-pop-in'),
      )}
      style={{
        left: (pos ?? PLACE_OFFSCREEN).left,
        top: (pos ?? PLACE_OFFSCREEN).top,
        width: SIZE,
        height: SIZE,
        visibility: pos ? 'visible' : 'hidden',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Faint guide ring keeps the wheel readable without heavy borders */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full border border-lineSoft"
        style={{ inset: 24 }}
      />
      <div key={view} className="absolute inset-0 animate-pen-swap">
        {view === 'tools'
          ? toolsView
          : view === 'color'
            ? colorView
            : view === 'size'
              ? sizeView
              : pencilView}
      </div>
    </div>,
    document.body,
  )
}
