import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { InkDoc, InkPointerMode } from '@/types/ink'
import { DEFAULT_GESTURE_CONFIG } from '@/utils/gestures'
import { InkLayer, type InkLayerHandle, type InkPrefsSnapshot } from './InkLayer'

/* ---------------------------------------------------------------------------
   Gesture integration through the real InkLayer: pointer events in, ink
   docs out. jsdom has no layout, so the SVG rect is stubbed to a 600×600
   box at the origin — capture coordinates then equal client coordinates.
--------------------------------------------------------------------------- */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

if (typeof PointerEvent === 'undefined') {
  // jsdom ships MouseEvent only; a minimal PointerEvent is enough for the layer.
  class PE extends MouseEvent {
    pointerId: number
    pointerType: string
    pressure: number
    isPrimary: boolean
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 1
      this.pointerType = init.pointerType ?? 'mouse'
      this.pressure = init.pressure ?? 0.5
      this.isPrimary = init.isPrimary ?? true
    }
  }
  ;(globalThis as { PointerEvent: unknown }).PointerEvent = PE
}

const prefs = (tool: InkPointerMode, gestures = DEFAULT_GESTURE_CONFIG): InkPrefsSnapshot => ({
  tool,
  color: '#123456',
  sizeIdx: 2,
  eraserMode: 'stroke',
  gestures,
})

interface Harness {
  root: Root
  ref: React.RefObject<InkLayerHandle | null>
  docs: InkDoc[]
  svg: () => SVGSVGElement
  setProps: (p: Partial<{ prefs: InkPrefsSnapshot; active: boolean }>) => void
  selection: number[]
  requestedTools: InkPointerMode[]
}

function mount(initial: InkDoc | null, tool: InkPointerMode = 'pen'): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const ref = createRef<InkLayerHandle | null>()
  const docs: InkDoc[] = []
  const selection: number[] = []
  const requestedTools: InkPointerMode[] = []
  let current: InkDoc | null = initial
  let props = { prefs: prefs(tool), active: true }
  const render = (): void => {
    act(() => {
      root.render(
        <InkLayer
          ref={ref}
          ink={current}
          onChange={(d) => {
            current = d
            docs.push(d)
            render()
          }}
          scrollRef={{ current: null }}
          active={props.active}
          prefs={props.prefs}
          onSelectionChange={(n) => selection.push(n)}
          onRequestTool={(t) => requestedTools.push(t)}
        />,
      )
    })
  }
  // Fake layout: the observed box is 600×600 and the svg sits at the origin
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 600 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
  render()
  const svg = (): SVGSVGElement => {
    const el = host.querySelector('svg')
    if (!el) throw new Error('svg not mounted')
    el.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: 600, height: 600, right: 600, bottom: 600, toJSON: () => ({}) }) as DOMRect
    return el as SVGSVGElement
  }
  return {
    root,
    ref,
    docs,
    svg,
    selection,
    requestedTools,
    setProps: (p) => {
      props = { ...props, ...p }
      render()
    },
  }
}

function pointer(el: Element, type: string, x: number, y: number, extra: Record<string, unknown> = {}): void {
  act(() => {
    el.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: 'mouse',
        isPrimary: true,
        button: type === 'pointerdown' ? 0 : -1,
        buttons: type === 'pointerup' ? 0 : 1,
        clientX: x,
        clientY: y,
        pressure: 0.5,
        ...extra,
      }),
    )
  })
}

function drawPath(h: Harness, pts: Array<[number, number]>): void {
  const el = h.svg()
  pointer(el, 'pointerdown', pts[0]![0], pts[0]![1])
  for (const [x, y] of pts.slice(1)) pointer(el, 'pointermove', x, y)
}

function lift(h: Harness, x: number, y: number): void {
  pointer(h.svg(), 'pointerup', x, y)
}

const rectPath = (): Array<[number, number]> => {
  const out: Array<[number, number]> = []
  const seg = (x0: number, y0: number, x1: number, y1: number): void => {
    for (let i = 0; i <= 15; i++) {
      const t = i / 15
      out.push([x0 + (x1 - x0) * t + ((i * 7) % 3) - 1, y0 + (y1 - y0) * t + ((i * 5) % 3) - 1])
    }
  }
  seg(100, 100, 300, 100)
  seg(300, 100, 300, 220)
  seg(300, 220, 100, 220)
  seg(100, 220, 100, 104)
  return out
}

const last = (docs: InkDoc[]): InkDoc => docs[docs.length - 1]!

const empty = (): InkDoc => ({ v: 1, width: 600, height: 600, strokes: [] })

describe('InkLayer gestures', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // rAF → run immediately so live rendering does not need a frame loop
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(performance.now())
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('a stroke without a pause stays handwriting', () => {
    const h = mount(empty())
    drawPath(h, rectPath())
    lift(h, 100, 104)
    const doc = last(h.docs)
    expect(doc.strokes).toHaveLength(1)
    expect(doc.strokes[0]!.shape).toBeUndefined()
    act(() => h.root.unmount())
  })

  it('hold-to-shape snaps a rectangle and commits one undoable shape', () => {
    const h = mount(empty())
    drawPath(h, rectPath())
    act(() => {
      vi.advanceTimersByTime(DEFAULT_GESTURE_CONFIG.holdMs + 50)
    })
    lift(h, 100, 104)
    const doc = last(h.docs)
    expect(doc.strokes).toHaveLength(1)
    const s = doc.strokes[0]!
    expect(s.shape?.kind).toBe('rect')
    expect(s.points).toHaveLength(5)
    expect(s.points[0]!.x).toBeCloseTo(99, -1)
    expect(s.points[2]!.y).toBeCloseTo(221, -1)
    // Undo removes the whole shape in one step; redo brings it back
    act(() => h.ref.current!.undo())
    expect(last(h.docs).strokes).toHaveLength(0)
    act(() => h.ref.current!.redo())
    expect(last(h.docs).strokes[0]!.shape?.kind).toBe('rect')
    act(() => h.root.unmount())
  })

  it('continuing to draw after a snap cancels recognition', () => {
    const h = mount(empty())
    drawPath(h, rectPath())
    act(() => {
      vi.advanceTimersByTime(DEFAULT_GESTURE_CONFIG.holdMs + 50)
    })
    // Keep going well away from the snap point
    pointer(h.svg(), 'pointermove', 140, 140)
    pointer(h.svg(), 'pointermove', 200, 180)
    lift(h, 200, 180)
    const s = last(h.docs).strokes[0]!
    expect(s.shape).toBeUndefined()
    expect(s.points.length).toBeGreaterThan(5)
    act(() => h.root.unmount())
  })

  it('a straight-ish line held still becomes a two-point line', () => {
    const h = mount(empty())
    const pts: Array<[number, number]> = []
    for (let i = 0; i <= 40; i++) pts.push([50 + i * 6, 300 + ((i * 3) % 3) - 1])
    drawPath(h, pts)
    act(() => {
      vi.advanceTimersByTime(700)
    })
    lift(h, 290, 300)
    const s = last(h.docs).strokes[0]!
    expect(s.shape?.kind).toBe('line')
    expect(s.points).toHaveLength(2)
    act(() => h.root.unmount())
  })

  it('shape snap can be disabled', () => {
    const h = mount(empty())
    h.setProps({ prefs: prefs('pen', { ...DEFAULT_GESTURE_CONFIG, shapeSnap: false }) })
    drawPath(h, rectPath())
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    lift(h, 100, 104)
    expect(last(h.docs).strokes[0]!.shape).toBeUndefined()
    act(() => h.root.unmount())
  })

  it('scribbling over ink erases it in one undo step; a low-confidence scribble stays ink', () => {
    const target: InkDoc = {
      v: 1,
      width: 600,
      height: 600,
      strokes: [
        { id: 'word', tool: 'pen', color: '#000', size: 3, points: Array.from({ length: 30 }, (_, i) => ({ x: 120 + i * 5, y: 200 + (i % 2) * 4 })) },
        { id: 'far', tool: 'pen', color: '#000', size: 3, points: [{ x: 120, y: 400 }, { x: 270, y: 400 }] },
      ],
    }
    const h = mount(target)
    const scribble: Array<[number, number]> = []
    for (let p = 0; p < 8; p++) {
      const y = 186 + p * 4
      for (let i = 0; i <= 10; i++) {
        const t = i / 10
        scribble.push([p % 2 === 0 ? 110 + 170 * t : 280 - 170 * t, y])
      }
    }
    drawPath(h, scribble)
    lift(h, scribble[scribble.length - 1]![0], scribble[scribble.length - 1]![1])
    let doc = last(h.docs)
    expect(doc.strokes.map((s) => s.id)).toEqual(['far'])
    act(() => h.ref.current!.undo())
    doc = last(h.docs)
    expect(doc.strokes.map((s) => s.id)).toEqual(['word', 'far'])

    // Two gentle crossings are not a scribble: the stroke is kept as ink
    drawPath(h, [[110, 195], [280, 200], [120, 205], [150, 206]])
    lift(h, 150, 206)
    doc = last(h.docs)
    expect(doc.strokes).toHaveLength(3)
    act(() => h.root.unmount())
  })

  it('tapping a shape with the pen selects it and asks for the select tool', () => {
    const h = mount({
      v: 1,
      width: 600,
      height: 600,
      strokes: [
        {
          id: 'box',
          tool: 'pen',
          color: '#000',
          size: 3,
          shape: { kind: 'rect', closed: true },
          points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 100, y: 200 }, { x: 100, y: 100 }],
        },
      ],
    })
    pointer(h.svg(), 'pointerdown', 100, 150)
    lift(h, 100, 150)
    expect(h.selection[h.selection.length - 1]).toBe(1)
    expect(h.requestedTools).toEqual(['select'])
    expect(h.docs).toHaveLength(0) // no dot was added
    // A dot on empty paper is still a dot
    pointer(h.svg(), 'pointerdown', 400, 400)
    lift(h, 400, 400)
    expect(last(h.docs).strokes).toHaveLength(2)
    act(() => h.root.unmount())
  })

  it('lasso selects enclosed strokes; corner drag resizes; rotate handle rotates', () => {
    const h = mount(
      {
        v: 1,
        width: 600,
        height: 600,
        strokes: [
          { id: 'in', tool: 'pen', color: '#000', size: 3, points: [{ x: 150, y: 150 }, { x: 200, y: 160 }] },
          { id: 'out', tool: 'pen', color: '#000', size: 3, points: [{ x: 450, y: 450 }, { x: 500, y: 460 }] },
        ],
      },
      'select',
    )
    drawPath(h, [[100, 100], [260, 100], [260, 220], [100, 220], [100, 110]])
    lift(h, 100, 110)
    expect(h.selection[h.selection.length - 1]).toBe(1)
    const handles = h.svg().querySelectorAll('.ink-handle[data-corner]')
    expect(handles).toHaveLength(4)
    const se = h.svg().querySelector('.ink-handle[data-corner="se"]')!
    const cx = Number(se.getAttribute('cx'))
    const cy = Number(se.getAttribute('cy'))
    pointer(h.svg(), 'pointerdown', cx, cy)
    pointer(h.svg(), 'pointermove', cx + 50, cy + 50)
    lift(h, cx + 50, cy + 50)
    const grown = last(h.docs).strokes.find((s) => s.id === 'in')!
    expect(grown.points[1]!.x).toBeGreaterThan(200)
    expect(last(h.docs).strokes.find((s) => s.id === 'out')!.points[0]!.x).toBe(450)

    const rot = h.svg().querySelector('.ink-handle-rotate')!
    const rx = Number(rot.getAttribute('cx'))
    const ry = Number(rot.getAttribute('cy'))
    pointer(h.svg(), 'pointerdown', rx, ry)
    pointer(h.svg(), 'pointermove', rx + 80, ry + 80)
    lift(h, rx + 80, ry + 80)
    const rotated = last(h.docs).strokes.find((s) => s.id === 'in')!
    expect(rotated.points[0]!.y).not.toBeCloseTo(grown.points[0]!.y, 0)
    act(() => h.ref.current!.undo())
    expect(last(h.docs).strokes.find((s) => s.id === 'in')!.points[0]!.y).toBeCloseTo(grown.points[0]!.y, 0)
    act(() => h.root.unmount())
  })

  it('shape style edits (outline width, fill) and resize go through undo', () => {
    const h = mount(
      {
        v: 1,
        width: 600,
        height: 600,
        strokes: [
          {
            id: 'box',
            tool: 'pen',
            color: '#000',
            size: 3,
            shape: { kind: 'rect', closed: true },
            points: [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 100, y: 200 }, { x: 100, y: 100 }],
          },
        ],
      },
      'select',
    )
    act(() => h.ref.current!.selectAll())
    act(() => h.ref.current!.setShapeStyle({ size: 6, fill: '#ff000055', color: '#00ff00' }))
    let box = last(h.docs).strokes[0]!
    expect(box.size).toBe(6)
    expect(box.shape?.fill).toBe('#ff000055')
    expect(box.color).toBe('#00ff00')
    act(() => h.ref.current!.resizeSelection(2))
    box = last(h.docs).strokes[0]!
    expect(box.points[1]!.x - box.points[0]!.x).toBeCloseTo(400, -1)
    act(() => h.ref.current!.undo())
    expect(last(h.docs).strokes[0]!.points[1]!.x - last(h.docs).strokes[0]!.points[0]!.x).toBeCloseTo(200, -1)
    act(() => h.ref.current!.setShapeStyle({ fill: null }))
    expect(last(h.docs).strokes[0]!.shape?.fill).toBeUndefined()
    act(() => h.root.unmount())
  })
})
