/* ---------------------------------------------------------------------------
   Pure page/screen geometry. One coordinate system everywhere: page units are
   PDF points with the origin top-left; only a View knows screen pixels.
   Zoom, lasso, export and thumbnails all go through these helpers.
--------------------------------------------------------------------------- */

export interface Pt {
  x: number
  y: number
}

/** `scale` = screen px per page unit, `tx`/`ty` = screen position of page origin. */
export interface View {
  scale: number
  tx: number
  ty: number
}

export const MIN_ZOOM = 1
export const MAX_ZOOM = 4

export const clampZoom = (z: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

export const screenToPage = (v: View, p: Pt): Pt => ({ x: (p.x - v.tx) / v.scale, y: (p.y - v.ty) / v.scale })

export const pageToScreen = (v: View, p: Pt): Pt => ({ x: p.x * v.scale + v.tx, y: p.y * v.scale + v.ty })

/**
 * Change the scale while the page point under `focus` (screen px) stays put.
 * The scale is clamped; the translation follows the clamped value.
 */
export function zoomAbout(v: View, focus: Pt, nextScale: number, min = 0, max = Infinity): View {
  const scale = Math.min(max, Math.max(min, nextScale))
  const page = screenToPage(v, focus)
  return { scale, tx: focus.x - page.x * scale, ty: focus.y - page.y * scale }
}

/** Scale that fits a page of `pageW` units across `viewW` screen px. */
export const fitWidth = (viewW: number, pageW: number): number => (pageW > 0 ? viewW / pageW : 1)

/** Distance and midpoint of two touch points — the whole pinch gesture is these two numbers. */
export const pinchOf = (a: Pt, b: Pt): { dist: number; mid: Pt } => ({
  dist: Math.hypot(b.x - a.x, b.y - a.y),
  mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
})

/**
 * Scroll offset that keeps the content point under `focus` fixed when a
 * zoomable column grows from `prev` to `next`. `offset` is the current
 * scrollLeft/Top, `focus` the pointer position inside the scroller viewport.
 */
export const scrollAfterZoom = (offset: number, focus: number, prev: number, next: number): number =>
  ((offset + focus) / prev) * next - focus

/** Even-odd point-in-polygon test (ray casting) for lasso selection. */
export function pointInPolygon(p: Pt, poly: readonly Pt[]): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!
    const b = poly[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}
