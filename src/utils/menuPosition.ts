/**
 * Horizontal nudge (px) that keeps a dropdown inside the viewport. The menu
 * hangs from its trigger: `end` lines up right edges, `start` left edges.
 */
export function menuShift(
  align: 'start' | 'end',
  trigger: { left: number; right: number },
  menuW: number,
  viewportW: number,
  pad = 8,
): number {
  const left = align === 'end' ? trigger.right - menuW : trigger.left
  const right = left + menuW
  if (left < pad) return pad - left
  if (right > viewportW - pad) return viewportW - pad - right
  return 0
}
