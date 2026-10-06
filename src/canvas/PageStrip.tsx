import { useEffect, useRef, useState } from 'react'
import type { InkDoc } from '@/types/ink'
import type { PageRecord } from '@/types/models'
import { useNoteStore } from '@/store/noteStore'
import { movePage } from '@/library/notes'
import { pageSize } from '@/library/pageSize'
import { cn } from '@/utils/cn'
import { hasThumbnailArt, renderThumbnail } from './thumbnail'

/* ---------------------------------------------------------------------------
   Horizontal strip of page cards. Tap selects; drag reorders (mouse/pen:
   move past a few px, touch: press and hold, so a plain swipe still scrolls
   the strip). The page menu has move left/right for anyone who cannot drag.
--------------------------------------------------------------------------- */

const CARD_W = 56
const GAP = 8
const HOLD_MS = 280
const MOVE_PX = 6

/** Thumbnail URL for a page, redrawn (debounced) when its ink or background changes. */
function useThumb(page: PageRecord, ink: InkDoc | null): string | null {
  const [url, setUrl] = useState<string | null>(null)
  const urlRef = useRef<string | null>(null)
  const art = hasThumbnailArt(page, ink)

  const swap = (next: string | null): void => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    urlRef.current = next
    setUrl(next)
  }

  useEffect(() => {
    if (!art) {
      swap(null)
      return
    }
    let stale = false
    const timer = window.setTimeout(() => {
      renderThumbnail(page, ink, CARD_W)
        .then((blob) => {
          if (!stale && blob) swap(URL.createObjectURL(blob))
        })
        .catch((err) => console.error('[tala] thumbnail failed', err))
    }, 400)
    return () => {
      stale = true
      window.clearTimeout(timer)
    }
  }, [art, page, ink])

  useEffect(() => () => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current)
  }, [])
  return url
}

interface DragState {
  id: string
  from: number
  dx: number
}

export function PageStrip({
  noteId,
  pages,
  activeIndex,
  onSelect,
}: {
  noteId: string
  pages: PageRecord[]
  activeIndex: number
  onSelect: (index: number) => void
}): React.ReactNode {
  const inkDocs = useNoteStore((s) => s.inkDocs)
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const press = useRef<{ id: string; from: number; x: number; type: string; timer: number | null } | null>(null)
  const suppressClick = useRef(false)
  const rowRef = useRef<HTMLDivElement>(null)

  const setDragState = (d: DragState | null): void => {
    dragRef.current = d
    setDrag(d)
  }

  // Once a touch drag has started the strip must stop scrolling under the finger.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const block = (e: TouchEvent): void => {
      if (dragRef.current) e.preventDefault()
    }
    row.addEventListener('touchmove', block, { passive: false })
    return () => row.removeEventListener('touchmove', block)
  }, [])

  const targetOf = (d: DragState): number =>
    Math.max(0, Math.min(pages.length - 1, d.from + Math.round(d.dx / (CARD_W + GAP))))

  const endPress = (commit: boolean): void => {
    const p = press.current
    press.current = null
    if (p?.timer != null) window.clearTimeout(p.timer)
    const d = dragRef.current
    setDragState(null)
    if (commit && d) {
      suppressClick.current = true
      const to = targetOf(d)
      if (to !== d.from) {
        movePage(noteId, d.id, to)
        // keep the page being edited selected: it shifts by one unless it was the one moved
        const activeId = pages[activeIndex]?.id
        const order = pages.map((pg) => pg.id)
        order.splice(to, 0, ...order.splice(d.from, 1))
        const next = order.indexOf(activeId ?? '')
        if (next >= 0) onSelect(next)
      }
    }
  }

  return (
    <div
      ref={rowRef}
      role="list"
      aria-label="Pages"
      className="no-scrollbar flex gap-2 overflow-x-auto px-6 py-2"
    >
      {pages.map((page, i) => {
        const ink = inkDocs[page.id] ?? null
        const { w, h } = pageSize(page)
        const dragging = drag?.id === page.id
        const target = drag ? targetOf(drag) : -1
        return (
          <div role="listitem" key={page.id} className="shrink-0">
            <button
              type="button"
              aria-label={`Page ${i + 1}`}
              aria-current={i === activeIndex ? 'page' : undefined}
              style={{
                width: CARD_W,
                aspectRatio: `${w} / ${h}`,
                transform: dragging ? `translateX(${drag.dx}px)` : undefined,
                touchAction: 'pan-x',
              }}
              className={cn(
                'relative block overflow-hidden rounded-control border bg-white text-left shadow-rest',
                i === activeIndex ? 'border-accent ring-2 ring-accent/40' : 'border-lineSoft',
                dragging && 'z-10 shadow-float',
                !dragging && drag && target === i && 'ring-2 ring-gold',
              )}
              onClick={() => {
                if (suppressClick.current) suppressClick.current = false
                else onSelect(i)
              }}
              onPointerDown={(e) => {
                if (e.button !== 0) return
                e.currentTarget.setPointerCapture(e.pointerId)
                const entry = { id: page.id, from: i, x: e.clientX, type: e.pointerType, timer: null as number | null }
                if (e.pointerType === 'touch') {
                  entry.timer = window.setTimeout(() => {
                    entry.timer = null
                    if (press.current === entry) setDragState({ id: page.id, from: i, dx: 0 })
                  }, HOLD_MS)
                }
                press.current = entry
              }}
              onPointerMove={(e) => {
                const p = press.current
                if (!p) return
                const dx = e.clientX - p.x
                if (dragRef.current) setDragState({ ...dragRef.current, dx })
                else if (p.type === 'touch') {
                  // moved before the hold elapsed: it is a scroll, not a drag
                  if (Math.abs(dx) > MOVE_PX && p.timer != null) {
                    window.clearTimeout(p.timer)
                    p.timer = null
                  }
                } else if (Math.abs(dx) > MOVE_PX) setDragState({ id: p.id, from: p.from, dx })
              }}
              onPointerUp={() => endPress(true)}
              onPointerCancel={() => endPress(false)}
            >
              <PageCardFace page={page} ink={ink} />
              <span className="absolute bottom-0.5 right-0.5 rounded-sm bg-panel/80 px-1 text-[10px] tabular-nums text-muted">
                {i + 1}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}

function PageCardFace({ page, ink }: { page: PageRecord; ink: InkDoc | null }): React.ReactNode {
  const url = useThumb(page, ink)
  if (url) return <img src={url} alt="" draggable={false} className="size-full object-cover" />
  if (hasThumbnailArt(page, ink)) return <span className="block size-full bg-white" />
  // Typed text is not drawn into thumbnails: show the opening words instead
  return (
    <span className="block size-full overflow-hidden p-1 text-[7px] leading-[9px] text-faint">
      {page.text?.slice(0, 90) || ''}
    </span>
  )
}
