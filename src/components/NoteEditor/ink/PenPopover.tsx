import { useState } from 'react'
import type { ReactNode } from 'react'
import {
  Check,
  ChevronDown,
  Eraser,
  Highlighter,
  Lasso,
  PenTool,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { InkEraserMode, InkPreset, InkPointerMode } from '@/types/ink'
import { INK_PRESETS, OPACITY_RANGE, sizesForTool } from '@/types/ink'
import type { InkRecent, PencilSettings } from '@/store/uiStore'
import { PENCIL_ACTIONS, PENCIL_ACTION_LABELS, usePencilCapabilities, type PencilAction } from '@/lib/pencil'
import { cn } from '@/utils/cn'
import { Popover, type PopoverAnchor } from '../../UI/Popover'
import { Tooltip } from '../../UI/Tooltip'

/* ---------------------------------------------------------------------------
   Draw popover — the single home of every handwriting control.

     tools     pen · pencil · highlighter · eraser · lasso
     style     presets of the active tool (marker / brush / ballpoint …)
     colour    ten physical inks + custom picker
     size      six true-thickness previews
     opacity   pencil + highlighter only
     recent    combinations actually written with
     stylus    Apple Pencil: detected inputs, pressure/tilt/hover toggles,
               finger behaviour, double-tap + squeeze when a bridge exists

   Opens from the Draw control (anchored below it), the floating touch
   toolbar (anchored above it) or a right-click on the canvas (at the cursor).
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

export const SIZE_LABELS = ['Hairline', 'Thin', 'Medium', 'Thick', 'Bold', 'Marker']

export interface ToolSpec {
  id: InkPointerMode
  icon: LucideIcon
  label: string
}

export const TOOLS: ToolSpec[] = [
  { id: 'pen', icon: PenTool, label: 'Pen' },
  { id: 'pencil', icon: Pencil, label: 'Pencil' },
  { id: 'highlighter', icon: Highlighter, label: 'Highlighter' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'select', icon: Lasso, label: 'Lasso' },
]

export const TOOL_BY_ID: Record<InkPointerMode, ToolSpec> = Object.fromEntries(
  TOOLS.map((t) => [t.id, t]),
) as Record<InkPointerMode, ToolSpec>

/** Presets grouped by the tool they render through. */
const PRESETS_FOR_TOOL: Record<'pen' | 'pencil' | 'highlighter', InkPreset[]> = {
  pen: ['marker', 'brush-pen', 'ballpoint'],
  pencil: ['pencil', 'fine-pencil'],
  highlighter: ['highlighter'],
}

/** Primary preset when a tool is picked fresh. */
export const PRIMARY_PRESET: Record<'pen' | 'pencil' | 'highlighter', InkPreset> = {
  pen: 'marker',
  pencil: 'pencil',
  highlighter: 'highlighter',
}

export interface PenPrefs {
  tool: InkPointerMode
  color: string
  sizeIdx: number
  eraserMode: InkEraserMode
  preset: InkPreset
  hlOpacity: number
  pencilOpacity: number
  recents: InkRecent[]
  pencil: PencilSettings
}

export type PenPrefsPatch = Partial<Omit<PenPrefs, 'pencil' | 'recents'>> & {
  pencil?: Partial<PencilSettings>
}

interface PenPopoverProps {
  open: boolean
  anchor: PopoverAnchor | null
  /** Cursor anchors float above the point and dismiss on scroll. */
  anchorMode?: 'cursor' | 'trigger'
  side?: 'top' | 'bottom'
  align?: 'start' | 'center' | 'end'
  prefs: PenPrefs
  onPrefs: (patch: PenPrefsPatch) => void
  onClear: () => void
  onClose: () => void
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

/** Applies a tool choice, resetting size to the preset default on a real switch. */
export function patchForTool(current: PenPrefs, id: InkPointerMode): PenPrefsPatch {
  if (id === 'eraser' || id === 'select') return { tool: id }
  if (current.tool === id) return { tool: id }
  const preset = PRIMARY_PRESET[id]
  return { tool: id, preset, sizeIdx: INK_PRESETS[preset].defaultSizeIdx }
}

function SectionLabel({ children }: { children: ReactNode }): ReactNode {
  return (
    <span className="w-11 shrink-0 text-[10px] font-medium uppercase tracking-wide text-faint">
      {children}
    </span>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex items-center gap-2">
      <SectionLabel>{label}</SectionLabel>
      <div className="flex min-w-0 flex-1 items-center gap-1">{children}</div>
    </div>
  )
}

export function PenPopover({
  open,
  anchor,
  anchorMode = 'trigger',
  side,
  align = 'end',
  prefs,
  onPrefs,
  onClear,
  onClose,
}: PenPopoverProps): ReactNode {
  const [stylusOpen, setStylusOpen] = useState(false)
  const caps = usePencilCapabilities()

  const drawTool =
    prefs.tool === 'pen' || prefs.tool === 'pencil' || prefs.tool === 'highlighter' ? prefs.tool : null
  const drawing = drawTool !== null
  const sizes = sizesForTool(prefs.tool)
  const opacityTool = prefs.tool === 'pencil' || prefs.tool === 'highlighter' ? prefs.tool : null
  const opacityRange = opacityTool ? OPACITY_RANGE[opacityTool]! : null
  const opacityValue = opacityTool === 'pencil' ? prefs.pencilOpacity : prefs.hlOpacity
  const customColor = !INK_SWATCHES.some((s) => s.color.toLowerCase() === prefs.color.toLowerCase())

  const pickRecent = (r: InkRecent): void => {
    onPrefs({
      tool: r.tool,
      preset: r.preset,
      color: r.color,
      sizeIdx: r.sizeIdx,
      ...(r.opacity !== undefined
        ? r.tool === 'pencil'
          ? { pencilOpacity: r.opacity }
          : { hlOpacity: r.opacity }
        : {}),
    })
  }

  return (
    <Popover
      open={open}
      anchor={anchor}
      onClose={onClose}
      side={side ?? (anchorMode === 'cursor' ? 'top' : 'bottom')}
      align={anchorMode === 'cursor' ? 'center' : align}
      closeOnScroll={anchorMode === 'cursor'}
      ariaLabel="Drawing tools"
      className="w-[336px] p-3"
      initialFocus={anchorMode !== 'cursor'}
    >
      {/* Tools */}
      <div role="radiogroup" aria-label="Tool" className="grid grid-cols-5 gap-1">
        {TOOLS.map((t) => {
          const active = prefs.tool === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-autofocus={active || undefined}
              onClick={() => onPrefs(patchForTool(prefs, t.id))}
              className={cn(
                'flex h-[54px] flex-col items-center justify-center gap-0.5 rounded-wobbly-sm transition-[background-color,color,transform] duration-100 active:scale-95',
                active ? 'bg-postit text-postit-ink' : 'text-muted hover:bg-raise hover:text-ink',
              )}
            >
              <t.icon size={20} strokeWidth={active ? 2.5 : 2} aria-hidden="true" />
              <span className="text-[10px] font-medium leading-none">{t.label}</span>
            </button>
          )
        })}
      </div>

      <div className="mt-3 space-y-2.5">
        {/* Style presets */}
        {drawTool && PRESETS_FOR_TOOL[drawTool].length > 1 && (
          <Row label="Style">
            <div role="radiogroup" aria-label="Writing style" className="flex flex-wrap gap-1">
              {PRESETS_FOR_TOOL[drawTool].map((id) => {
                const spec = INK_PRESETS[id]
                const active = prefs.preset === id
                return (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => onPrefs({ preset: id, sizeIdx: spec.defaultSizeIdx })}
                    className={cn(
                      'h-7 rounded-full border px-2.5 text-xs transition-colors',
                      active
                        ? 'border-line bg-postit text-postit-ink'
                        : 'border-lineSoft text-muted hover:border-line hover:text-ink',
                    )}
                  >
                    {spec.label}
                  </button>
                )
              })}
            </div>
          </Row>
        )}

        {/* Colour */}
        {drawing && (
          <Row label="Colour">
            <div role="radiogroup" aria-label="Ink colour" className="flex flex-wrap items-center gap-[3px]">
              {INK_SWATCHES.map((s) => {
                const active = prefs.color.toLowerCase() === s.color.toLowerCase()
                return (
                  <Tooltip key={s.color} label={s.label}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`${s.label} ink`}
                      onClick={() => onPrefs({ color: s.color })}
                      className={cn(
                        'grid size-5 place-items-center rounded-full border transition-transform hover:scale-110 active:scale-95',
                        active ? 'border-line ring-2 ring-accent/60' : 'border-black/10 dark:border-white/15',
                      )}
                      style={{ backgroundColor: s.color }}
                    >
                      {active && (
                        <Check size={12} strokeWidth={3} style={{ color: isLight(s.color) ? '#111' : '#fff' }} />
                      )}
                    </button>
                  </Tooltip>
                )
              })}
              <Tooltip label="Custom colour…">
                <label
                  aria-label="Custom ink colour"
                  className={cn(
                    'relative grid size-5 cursor-pointer place-items-center overflow-hidden rounded-full border transition-transform hover:scale-110',
                    customColor ? 'border-line ring-2 ring-accent/60' : 'border-black/10 dark:border-white/15',
                  )}
                  style={{
                    background:
                      'conic-gradient(#dc2626, #ea580c, #eab308, #16a34a, #2563eb, #7c3aed, #ec4899, #dc2626)',
                  }}
                >
                  {customColor && (
                    <span className="size-2.5 rounded-full border border-white/80" style={{ backgroundColor: prefs.color }} />
                  )}
                  <input
                    type="color"
                    value={/^#[0-9a-f]{6}$/i.test(prefs.color) ? prefs.color : '#2563eb'}
                    onChange={(e) => onPrefs({ color: e.target.value })}
                    className="absolute inset-0 cursor-pointer opacity-0"
                    tabIndex={-1}
                  />
                </label>
              </Tooltip>
            </div>
          </Row>
        )}

        {/* Eraser mode */}
        {prefs.tool === 'eraser' && (
          <Row label="Erase">
            <div role="radiogroup" aria-label="Eraser mode" className="inline-flex rounded-wobbly-sm border border-lineSoft p-0.5">
              {(
                [
                  { id: 'stroke', label: 'Whole stroke' },
                  { id: 'pixel', label: 'Partial' },
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.eraserMode === m.id}
                  onClick={() => onPrefs({ eraserMode: m.id })}
                  className={cn(
                    'rounded-[6px_3px_7px_3px] px-2.5 py-1 text-xs transition-colors',
                    prefs.eraserMode === m.id ? 'bg-postit text-postit-ink' : 'text-muted hover:text-ink',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <Tooltip label="Clear all handwriting on this note">
              <button
                type="button"
                onClick={onClear}
                aria-label="Clear handwriting"
                className="ml-auto grid size-8 place-items-center rounded-wobbly-sm text-faint transition-colors hover:bg-accent/10 hover:text-accent"
              >
                <Trash2 size={15} />
              </button>
            </Tooltip>
          </Row>
        )}

        {/* Size */}
        {prefs.tool !== 'select' && (
          <Row label="Size">
            <div role="radiogroup" aria-label="Stroke size" className="flex flex-1 items-center justify-between">
              {sizes.map((px, i) => {
                const active = prefs.sizeIdx === i
                const dot = prefs.tool === 'eraser' ? 6 + i * 3 : Math.min(18, Math.max(3, px * (prefs.tool === 'highlighter' ? 0.5 : 1.15)))
                return (
                  <Tooltip key={i} label={`${SIZE_LABELS[i]} · ${Math.round(px)} px`}>
                    <button
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={`${SIZE_LABELS[i]} stroke, ${Math.round(px)} pixels`}
                      onClick={() => onPrefs({ sizeIdx: i })}
                      className={cn(
                        'grid size-8 place-items-center rounded-wobbly-sm transition-colors',
                        active ? 'bg-postit text-postit-ink' : 'text-muted hover:bg-raise hover:text-ink',
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn('rounded-full', prefs.tool === 'eraser' ? 'border-[1.5px] border-current' : 'bg-current')}
                        style={{ width: dot, height: dot }}
                      />
                    </button>
                  </Tooltip>
                )
              })}
            </div>
          </Row>
        )}

        {/* Opacity */}
        {opacityTool && opacityRange && (
          <Row label="Opacity">
            <input
              type="range"
              min={opacityRange.min}
              max={opacityRange.max}
              step={0.05}
              value={opacityValue}
              onChange={(e) =>
                onPrefs(
                  opacityTool === 'pencil'
                    ? { pencilOpacity: Number(e.target.value) }
                    : { hlOpacity: Number(e.target.value) },
                )
              }
              aria-label={`${opacityTool === 'pencil' ? 'Pencil' : 'Highlighter'} opacity`}
              className="ink-slider h-6 flex-1"
            />
            <span className="w-9 text-right text-xs tabular-nums text-muted">
              {Math.round(opacityValue * 100)}%
            </span>
          </Row>
        )}

        {prefs.tool === 'select' && (
          <p className="text-xs leading-snug text-muted">
            Draw a loop around handwriting to select it. Tap a stroke to pick just that one;
            hold Shift to add more.
          </p>
        )}

        {/* Recent combinations */}
        {prefs.recents.length > 0 && (
          <Row label="Recent">
            <div className="flex flex-wrap gap-1">
              {prefs.recents.map((r, i) => {
                const Icon = TOOL_BY_ID[r.tool].icon
                const px = sizesForTool(r.tool)[r.sizeIdx] ?? 4
                const active =
                  drawing &&
                  prefs.preset === r.preset &&
                  prefs.color.toLowerCase() === r.color.toLowerCase() &&
                  prefs.sizeIdx === r.sizeIdx
                return (
                  <Tooltip key={`${r.preset}-${r.color}-${r.sizeIdx}-${i}`} label={`${INK_PRESETS[r.preset].label} · ${SIZE_LABELS[r.sizeIdx]}`}>
                    <button
                      type="button"
                      onClick={() => pickRecent(r)}
                      aria-label={`Use ${INK_PRESETS[r.preset].label}, ${SIZE_LABELS[r.sizeIdx]}`}
                      aria-pressed={active}
                      className={cn(
                        'flex h-8 items-center gap-1.5 rounded-wobbly-sm border px-2 transition-colors',
                        active ? 'border-line bg-postit' : 'border-lineSoft hover:border-line hover:bg-raise',
                      )}
                    >
                      <Icon size={14} style={{ color: r.color }} aria-hidden="true" />
                      <svg width="26" height="10" viewBox="0 0 26 10" aria-hidden="true">
                        <path
                          d="M2 6 C 8 2, 14 9, 24 4"
                          fill="none"
                          stroke={r.color}
                          strokeOpacity={r.opacity ?? 1}
                          strokeWidth={Math.min(Math.max(px * (r.tool === 'highlighter' ? 0.35 : 0.9), 1.2), 7)}
                          strokeLinecap="round"
                        />
                      </svg>
                    </button>
                  </Tooltip>
                )
              })}
            </div>
          </Row>
        )}
      </div>

      {/* Apple Pencil */}
      <div className="mt-3 border-t border-lineSoft pt-2">
        <button
          type="button"
          onClick={() => setStylusOpen((o) => !o)}
          aria-expanded={stylusOpen}
          className="flex w-full items-center gap-2 rounded-wobbly-sm px-1 py-1 text-left text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          <ChevronDown size={14} className={cn('transition-transform', !stylusOpen && '-rotate-90')} aria-hidden="true" />
          Apple Pencil &amp; stylus
          <span className="ml-auto text-[11px] font-normal text-faint">
            {caps.stylusSeen ? 'Detected' : 'Not detected yet'}
          </span>
        </button>
        {stylusOpen && <StylusSettings caps={caps} settings={prefs.pencil} onChange={(pencil) => onPrefs({ pencil })} />}
      </div>
    </Popover>
  )
}

/* ----------------------------- Stylus settings ---------------------------- */

function StylusSettings({
  caps,
  settings,
  onChange,
}: {
  caps: ReturnType<typeof usePencilCapabilities>
  settings: PencilSettings
  onChange: (patch: Partial<PencilSettings>) => void
}): ReactNode {
  const status = (seen: boolean): ReactNode => (
    <span className={cn('text-[11px]', seen ? 'text-ballpoint' : 'text-faint')}>
      {seen ? 'detected' : '—'}
    </span>
  )

  return (
    <div className="mt-1 space-y-2 px-1 pb-1 animate-fade-in">
      <ToggleRow
        label="Pressure"
        hint={status(caps.pressure)}
        checked={settings.pressure}
        onChange={(pressure) => onChange({ pressure })}
      />
      <ToggleRow
        label="Tilt shading (pencil)"
        hint={status(caps.tilt)}
        checked={settings.tilt}
        onChange={(tilt) => onChange({ tilt })}
      />
      <ToggleRow
        label="Hover preview"
        hint={status(caps.hover)}
        checked={settings.hoverPreview}
        onChange={(hoverPreview) => onChange({ hoverPreview })}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs">Finger</span>
        <div role="radiogroup" aria-label="Finger behaviour" className="inline-flex rounded-wobbly-sm border border-lineSoft p-0.5">
          {(
            [
              { v: true, label: 'Draws' },
              { v: false, label: 'Scrolls' },
            ] as const
          ).map((o) => (
            <button
              key={String(o.v)}
              type="button"
              role="radio"
              aria-checked={settings.touchDraws === o.v}
              onClick={() => onChange({ touchDraws: o.v })}
              className={cn(
                'rounded-[6px_3px_7px_3px] px-2.5 py-1 text-xs transition-colors',
                settings.touchDraws === o.v ? 'bg-postit text-postit-ink' : 'text-muted hover:text-ink',
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </div>

      {caps.gestureBridge ? (
        <>
          <ActionRow label="Double-tap" value={settings.doubleTap} onChange={(doubleTap) => onChange({ doubleTap })} />
          <ActionRow label="Squeeze (Pro)" value={settings.squeeze} onChange={(squeeze) => onChange({ squeeze })} />
        </>
      ) : (
        <p className="text-[11px] leading-snug text-faint">
          Double-tap and squeeze aren&rsquo;t exposed to web apps by iPadOS. They become configurable
          here when Tala runs in its native iPad shell.
        </p>
      )}
    </div>
  )
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: ReactNode
  checked: boolean
  onChange: (v: boolean) => void
}): ReactNode {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-xs">
        {label}
        {hint}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative h-5 w-9 shrink-0 rounded-full border border-line transition-colors',
          checked ? 'bg-accent' : 'bg-canvas',
        )}
      >
        <span
          className={cn(
            'absolute left-[2px] top-[2px] size-3.5 rounded-full border border-line bg-panel transition-transform',
            checked && 'translate-x-4',
          )}
        />
      </button>
    </div>
  )
}

function ActionRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: PencilAction
  onChange: (v: PencilAction) => void
}): ReactNode {
  return (
    <label className="flex items-center justify-between gap-2 text-xs">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as PencilAction)}
        className="h-7 max-w-[160px] rounded-wobbly-sm border border-lineSoft bg-canvas px-1.5 text-xs text-ink"
      >
        {PENCIL_ACTIONS.map((a) => (
          <option key={a} value={a}>
            {PENCIL_ACTION_LABELS[a]}
          </option>
        ))}
      </select>
    </label>
  )
}
