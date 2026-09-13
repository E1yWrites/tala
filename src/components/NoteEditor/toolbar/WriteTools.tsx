import { useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import {
  Check,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Eraser,
  Lasso,
  Maximize2,
  Minimize2,
  Palette,
  PaintBucket,
  PenLine,
  Redo2,
  RotateCcw,
  RotateCw,
  Scissors,
  Trash2,
  Undo2,
  X,
} from 'lucide-react'
import type { InkPointerMode } from '@/types/ink'
import { PEN_SIZES } from '@/types/ink'
import { useInkClipboardSize } from '@/lib/inkSession'
import { cn } from '@/utils/cn'
import { Popover } from '../../UI/Popover'
import { Tooltip } from '../../UI/Tooltip'
import { INK_SWATCHES } from '../ink/PenPopover'
import { DrawControl } from './DrawControl'
import { ToolButton, ToolSeparator, type ToolButtonSize } from './ToolButton'

/* ---------------------------------------------------------------------------
   Writing-mode and selection-mode tool groups. Both start with the Draw
   control so the live tool is always visible and one tap away from the full
   palette; everything else is the handful of actions the moment calls for.
--------------------------------------------------------------------------- */

export interface InkToolbarState {
  tool: InkPointerMode
  color: string
  paletteOpen: boolean
  canUndo: boolean
  canRedo: boolean
}

export interface InkToolbarActions {
  /** Toggle the Draw popover anchored to the given control. */
  onTogglePalette: (anchor: HTMLElement) => void
  onTool: (tool: InkPointerMode) => void
  onUndo: () => void
  onRedo: () => void
}

interface WriteToolsProps {
  size?: ToolButtonSize
  state: InkToolbarState
  actions: InkToolbarActions
  /** Leave handwriting for typing; omitted = no button. */
  onDone?: () => void
  drawRef?: RefObject<HTMLButtonElement | null>
  noTooltips?: boolean
}

export function WriteTools({
  size = 'sm',
  state,
  actions,
  onDone,
  drawRef,
  noTooltips = false,
}: WriteToolsProps): ReactNode {
  const localRef = useRef<HTMLButtonElement>(null)
  const ref = drawRef ?? localRef
  const tip = size === 'lg' ? 'top' : 'bottom'
  return (
    <>
      <DrawControl
        ref={ref}
        active
        tool={state.tool}
        color={state.color}
        open={state.paletteOpen}
        size={size}
        noTooltip={noTooltips}
        onClick={() => ref.current && actions.onTogglePalette(ref.current)}
      />
      <ToolButton
        icon={Eraser}
        label="Eraser (E)"
        size={size}
        active={state.tool === 'eraser'}
        noTooltip={noTooltips}
        tooltipSide={tip}
        onClick={() => actions.onTool('eraser')}
      />
      <ToolButton
        icon={Lasso}
        label="Lasso (L)"
        size={size}
        active={state.tool === 'select'}
        noTooltip={noTooltips}
        tooltipSide={tip}
        onClick={() => actions.onTool('select')}
      />
      <ToolSeparator size={size} />
      <ToolButton icon={Undo2} label="Undo" size={size} disabled={!state.canUndo} noTooltip={noTooltips} tooltipSide={tip} onClick={actions.onUndo} />
      <ToolButton icon={Redo2} label="Redo" size={size} disabled={!state.canRedo} noTooltip={noTooltips} tooltipSide={tip} onClick={actions.onRedo} />
      {onDone && (
        <>
          <ToolSeparator size={size} />
          <ToolButton icon={Check} label="Done drawing (Esc)" size={size} noTooltip={noTooltips} tooltipSide={tip} onClick={onDone} className="text-ballpoint hover:text-ballpoint" />
        </>
      )}
    </>
  )
}

/* ------------------------------ Selection mode ---------------------------- */

export interface SelectionActions {
  duplicate: () => void
  copy: () => void
  cut: () => void
  paste: () => void
  rotate: (deg: number) => void
  recolor: (color: string) => void
  remove: () => void
  clear: () => void
  /** Outline width / colour / fill (fill applies to closed shapes only). */
  setStyle: (patch: { size?: number; color?: string; fill?: string | null }) => void
  /** Scale about the centre (1.15 = 15 % larger). */
  resize: (factor: number) => void
  /** How many selected strokes are recognised shapes — enables fill/outline. */
  shapes: number
}

interface SelectionToolsProps {
  size?: ToolButtonSize
  count: number
  state: InkToolbarState
  actions: InkToolbarActions
  selection: SelectionActions
  drawRef?: RefObject<HTMLButtonElement | null>
  noTooltips?: boolean
}

export function SelectionTools({
  size = 'sm',
  count,
  state,
  actions,
  selection,
  drawRef,
  noTooltips = false,
}: SelectionToolsProps): ReactNode {
  const localRef = useRef<HTMLButtonElement>(null)
  const ref = drawRef ?? localRef
  const rotateRef = useRef<HTMLButtonElement>(null)
  const colorRef = useRef<HTMLButtonElement>(null)
  const fillRef = useRef<HTMLButtonElement>(null)
  const widthRef = useRef<HTMLButtonElement>(null)
  const [menu, setMenu] = useState<'rotate' | 'color' | 'fill' | 'width' | null>(null)
  const clip = useInkClipboardSize()
  const tip = size === 'lg' ? 'top' : 'bottom'
  const popSide = size === 'lg' ? 'top' : 'bottom'

  return (
    <>
      <DrawControl
        ref={ref}
        active
        tool={state.tool}
        color={state.color}
        open={state.paletteOpen}
        size={size}
        noTooltip={noTooltips}
        onClick={() => ref.current && actions.onTogglePalette(ref.current)}
      />
      <span
        className={cn('shrink-0 px-1 text-xs tabular-nums text-muted', size === 'lg' && 'text-[13px]')}
        aria-live="polite"
      >
        {count} selected
      </span>
      <ToolSeparator size={size} />
      <ToolButton icon={CopyPlus} label="Duplicate — Ctrl+D" size={size} noTooltip={noTooltips} tooltipSide={tip} onClick={selection.duplicate} />
      <ToolButton icon={Copy} label="Copy — Ctrl+C" size={size} noTooltip={noTooltips} tooltipSide={tip} onClick={selection.copy} />
      <ToolButton icon={Scissors} label="Cut — Ctrl+X" size={size} noTooltip={noTooltips} tooltipSide={tip} onClick={selection.cut} />
      <ToolButton icon={ClipboardPaste} label="Paste — Ctrl+V" size={size} disabled={clip === 0} noTooltip={noTooltips} tooltipSide={tip} onClick={selection.paste} />
      <ToolSeparator size={size} />
      <ToolButton
        ref={rotateRef}
        icon={RotateCw}
        label="Rotate"
        size={size}
        menu
        active={menu === 'rotate'}
        aria-haspopup="dialog"
        aria-expanded={menu === 'rotate'}
        noTooltip={noTooltips}
        tooltipSide={tip}
        onClick={() => setMenu((m) => (m === 'rotate' ? null : 'rotate'))}
      />
      <ToolButton
        ref={colorRef}
        icon={Palette}
        label="Recolour"
        size={size}
        menu
        active={menu === 'color'}
        aria-haspopup="dialog"
        aria-expanded={menu === 'color'}
        noTooltip={noTooltips}
        tooltipSide={tip}
        onClick={() => setMenu((m) => (m === 'color' ? null : 'color'))}
      />
      <ToolButton icon={Maximize2} label="Larger" size={size} noTooltip={noTooltips} tooltipSide={tip} onClick={() => selection.resize(1.15)} />
      <ToolButton icon={Minimize2} label="Smaller" size={size} noTooltip={noTooltips} tooltipSide={tip} onClick={() => selection.resize(1 / 1.15)} />
      {selection.shapes > 0 && (
        <>
          <ToolButton
            ref={widthRef}
            icon={PenLine}
            label="Outline width"
            size={size}
            menu
            active={menu === 'width'}
            aria-haspopup="dialog"
            aria-expanded={menu === 'width'}
            noTooltip={noTooltips}
            tooltipSide={tip}
            onClick={() => setMenu((m) => (m === 'width' ? null : 'width'))}
          />
          <ToolButton
            ref={fillRef}
            icon={PaintBucket}
            label="Fill"
            size={size}
            menu
            active={menu === 'fill'}
            aria-haspopup="dialog"
            aria-expanded={menu === 'fill'}
            noTooltip={noTooltips}
            tooltipSide={tip}
            onClick={() => setMenu((m) => (m === 'fill' ? null : 'fill'))}
          />
        </>
      )}
      <ToolSeparator size={size} />
      <ToolButton icon={Trash2} label="Delete — ⌫" size={size} noTooltip={noTooltips} tooltipSide={tip} onClick={selection.remove} className="hover:text-accent" />
      <ToolButton icon={X} label="Deselect (Esc)" size={size} noTooltip={noTooltips} tooltipSide={tip} onClick={selection.clear} />

      <Popover open={menu === 'rotate'} anchor={rotateRef.current} onClose={() => setMenu(null)} ariaLabel="Rotate selection" side={popSide} className="p-1.5">
        <div className="flex items-center gap-0.5">
          {(
            [
              { deg: -90, icon: RotateCcw, label: 'Rotate left 90°' },
              { deg: -15, icon: RotateCcw, label: 'Rotate left 15°' },
              { deg: 15, icon: RotateCw, label: 'Rotate right 15°' },
              { deg: 90, icon: RotateCw, label: 'Rotate right 90°' },
            ] as const
          ).map((r) => (
            <ToolButton
              key={r.deg}
              icon={r.icon}
              label={r.label}
              tooltipSide="top"
              data-autofocus={r.deg === 15 || undefined}
              onClick={() => selection.rotate(r.deg)}
              className={cn(Math.abs(r.deg) === 90 && 'font-bold')}
            >
              <span className="relative grid place-items-center">
                <r.icon size={17} />
                <span className="absolute -bottom-1.5 text-[8px] font-semibold tabular-nums">{Math.abs(r.deg)}</span>
              </span>
            </ToolButton>
          ))}
        </div>
      </Popover>

      <Popover open={menu === 'width'} anchor={widthRef.current} onClose={() => setMenu(null)} ariaLabel="Outline width" side={popSide} className="p-1.5">
        <div role="group" aria-label="Outline width" className="flex items-center gap-0.5">
          {PEN_SIZES.map((px, i) => (
            <ToolButton
              key={px}
              label={`${Math.round(px)} px outline`}
              tooltipSide="top"
              data-autofocus={i === 2 || undefined}
              onClick={() => {
                selection.setStyle({ size: px })
                setMenu(null)
              }}
            >
              <span className="rounded-full bg-current" style={{ width: Math.max(3, px + 2), height: Math.max(3, px + 2) }} />
            </ToolButton>
          ))}
        </div>
      </Popover>

      <Popover open={menu === 'fill'} anchor={fillRef.current} onClose={() => setMenu(null)} ariaLabel="Fill colour" side={popSide} className="p-2">
        <div role="group" aria-label="Fill colour" className="flex items-center gap-1">
          <Tooltip label="No fill">
            <button
              type="button"
              aria-label="No fill"
              data-autofocus
              onClick={() => {
                selection.setStyle({ fill: null })
                setMenu(null)
              }}
              className="grid size-[22px] place-items-center rounded-full border border-dashed border-line text-[10px] text-muted hover:scale-110"
            >
              <X size={11} />
            </button>
          </Tooltip>
          {INK_SWATCHES.map((s) => (
            <Tooltip key={s.color} label={s.label}>
              <button
                type="button"
                aria-label={`Fill with ${s.label}`}
                onClick={() => {
                  selection.setStyle({ fill: s.color + '55' })
                  setMenu(null)
                }}
                className="size-[22px] rounded-full border border-black/10 transition-transform hover:scale-110 active:scale-95 dark:border-white/15"
                style={{ backgroundColor: s.color + '55' }}
              />
            </Tooltip>
          ))}
        </div>
      </Popover>

      <Popover open={menu === 'color'} anchor={colorRef.current} onClose={() => setMenu(null)} ariaLabel="Recolour selection" side={popSide} className="p-2">
        <div role="group" aria-label="Ink colour" className="flex items-center gap-1">
          {INK_SWATCHES.map((s, i) => (
            <Tooltip key={s.color} label={s.label}>
              <button
                type="button"
                aria-label={`Recolour to ${s.label}`}
                data-autofocus={i === 0 || undefined}
                onClick={() => {
                  selection.recolor(s.color)
                  setMenu(null)
                }}
                className="size-[22px] rounded-full border border-black/10 transition-transform hover:scale-110 active:scale-95 dark:border-white/15"
                style={{ backgroundColor: s.color }}
              />
            </Tooltip>
          ))}
        </div>
      </Popover>
    </>
  )
}
