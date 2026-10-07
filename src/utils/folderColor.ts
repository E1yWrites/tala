/**
 * A folder's dot colour, derived from its id so it is stable without a schema
 * field. The hues read on the green rail and on white; green (the rail) and
 * gold (stars only) are left out on purpose.
 */
const FOLDER_DOTS = ['#f08a5d', '#7d9cf0', '#d18ae0', '#5cc8d8', '#f07aa0', '#d9b38c'] as const

export function folderColor(id: string): string {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return FOLDER_DOTS[Math.abs(h) % FOLDER_DOTS.length]!
}
