import type { ReactNode, RefObject } from 'react'
import type { Editor } from '@tiptap/core'
import { cn } from '@/utils/cn'
import { DrawControl } from './DrawControl'
import { TextTools, type TextDensity } from './TextTools'
import { ToolSeparator } from './ToolButton'
import {
  SelectionTools,
  WriteTools,
  type InkToolbarActions,
  type InkToolbarState,
  type SelectionActions,
} from './WriteTools'

/* ---------------------------------------------------------------------------
   Mode-driven toolbar. One row, whose contents follow what the user is doing:

     text    — typing: style, strokes, lists, insert (+ the way into Draw)
     write   — handwriting: Draw control, eraser, lasso, undo/redo, done
     select  — lasso has strokes: duplicate / clipboard / rotate / recolour /
               delete

   `variant` decides where it lives: inline inside the editor header (wide
   panes) or as its own slim row beneath it (narrow panes). Touch layouts do
   not use this for write/select — they get FloatingInkToolbar instead.
   A future PDF surface slots in as another mode here.
--------------------------------------------------------------------------- */

export type EditorMode = 'text' | 'write' | 'select'

export interface InkToolbarBundle {
  state: InkToolbarState
  actions: InkToolbarActions
  selection: SelectionActions
  selectionCount: number
}

interface AdaptiveToolbarProps {
  mode: EditorMode
  variant: 'inline' | 'row'
  editor: Editor | null
  density?: TextDensity
  ink: InkToolbarBundle
  /** Text mode: enter handwriting. */
  onEnterDraw: () => void
  /** Write/select mode: back to typing. */
  onDone: () => void
  drawRef: RefObject<HTMLButtonElement | null>
  /** Text mode only — whether to append the Draw entry control. */
  showDraw?: boolean
}

export function AdaptiveToolbar({
  mode,
  variant,
  editor,
  density = 'full',
  ink,
  onEnterDraw,
  onDone,
  drawRef,
  showDraw = true,
}: AdaptiveToolbarProps): ReactNode {
  let content: ReactNode = null
  if (mode === 'text') {
    content = (
      <>
        {editor && <TextTools editor={editor} density={density} />}
        {showDraw && (
          <>
            <ToolSeparator />
            <DrawControl
              ref={drawRef}
              active={false}
              tool={ink.state.tool}
              color={ink.state.color}
              open={false}
              onClick={onEnterDraw}
            />
          </>
        )}
      </>
    )
  } else if (mode === 'write') {
    content = <WriteTools state={ink.state} actions={ink.actions} onDone={onDone} drawRef={drawRef} />
  } else {
    content = (
      <SelectionTools
        count={ink.selectionCount}
        state={ink.state}
        actions={ink.actions}
        selection={ink.selection}
        drawRef={drawRef}
      />
    )
  }

  if (variant === 'inline') {
    return (
      <div role="toolbar" aria-label={TOOLBAR_LABEL[mode]} className="flex min-w-0 items-center gap-0.5">
        {content}
      </div>
    )
  }
  return (
    <div
      role="toolbar"
      aria-label={TOOLBAR_LABEL[mode]}
      className={cn(
        'no-scrollbar flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-lineSoft px-3 py-1',
      )}
    >
      {content}
    </div>
  )
}

const TOOLBAR_LABEL: Record<EditorMode, string> = {
  text: 'Formatting',
  write: 'Drawing tools',
  select: 'Selection tools',
}
