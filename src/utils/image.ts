/** Hard ceiling before base64 inflation into IndexedDB (~10 MB on disk). */
const MAX_FILE_BYTES = 8 * 1024 * 1024

/** Reads a File into a data URL. */
function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not decode image'))
    img.src = src
  })
}

/**
 * Converts an image file to an inline data URL, downscaling large images so
 * notes stay performant and IndexedDB-friendly.
 * Throws when the file is not a decodable image or exceeds the size cap —
 * callers surface that as an insert-failure toast instead of embedding a
 * permanently broken <img> into the note.
 */
export async function processImageFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Unsupported file type')
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new Error('Image is too large (max 8 MB)')
  }
  const dataUrl = await readAsDataURL(file)

  const img = await loadImage(dataUrl)
  // SVGs without intrinsic width/height would collapse to 0×0 on canvas —
  // pass them through untouched.
  if (img.width === 0 || img.height === 0) return dataUrl
  // Animated GIFs and SVGs are passed through untouched: re-encoding would
  // flatten animation / bake in a background.
  if (file.type === 'image/gif' || file.type === 'image/svg+xml') return dataUrl

  const MAX_DIM = 1600
  const SMALL_ENOUGH_BYTES = 350_000
  const needsResize =
    img.width > MAX_DIM || img.height > MAX_DIM || file.size > SMALL_ENOUGH_BYTES
  if (!needsResize) return dataUrl

  const scale = Math.min(1, MAX_DIM / Math.max(img.width, img.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(img.width * scale))
  canvas.height = Math.max(1, Math.round(img.height * scale))
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  // Preserve transparency: PNG/WebP keep an alpha-capable format;
  // everything else (JPEG etc.) re-encodes as JPEG.
  const keepAlpha = ['image/png', 'image/webp'].includes(file.type)
  return canvas.toDataURL(keepAlpha ? 'image/png' : 'image/jpeg', keepAlpha ? undefined : 0.85)
}
