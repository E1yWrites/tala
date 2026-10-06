/* Builds the app icons from src/assets/brand/app-icon-source.png (the star-with-pencil
 * tile on a white margin). The tile is cut out of the margin (flood fill + a clean
 * anti-aliased edge), then written as:
 *   public/app-icon.png (512) and app-icon-192.png   rounded tile, transparent corners (any purpose, favicon, desktop)
 *   public/apple-touch-icon.png (180)                full-bleed square: iOS applies its own rounding
 *   public/app-icon-maskable-512.png                 full-bleed, art kept inside the safe zone (Android masks it)
 *   $ICON_MASTER (default none)                      1024 rounded tile for `npm run tauri icon`
 * Run: node scripts/generate-icons.mjs
 * Then regenerate the desktop icons: node scripts/generate-icons.mjs --master /tmp/master.png && npm run tauri icon /tmp/master.png */
import { chromium } from 'playwright-core'
import { readFile, writeFile } from 'node:fs/promises'

const masterOut = process.argv.includes('--master') ? process.argv[process.argv.indexOf('--master') + 1] : null
const src = `data:image/png;base64,${(await readFile('src/assets/brand/app-icon-source.png')).toString('base64')}`

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()

const outputs = await page.evaluate(async ({ src, sizes }) => {
  const img = new Image()
  img.src = src
  await img.decode()
  const W = img.width
  const H = img.height
  const c = document.createElement('canvas')
  c.width = W
  c.height = H
  const x = c.getContext('2d', { willReadFrequently: true })
  x.drawImage(img, 0, 0)
  const im = x.getImageData(0, 0, W, H)
  const d = im.data

  // 1. The white margin: every near-white pixel connected to the border
  const near = (i) => Math.min(d[i], d[i + 1], d[i + 2]) > 228 || d[i + 3] < 8
  const bg = new Uint8Array(W * H)
  const stack = []
  const push = (px, py) => {
    if (px < 0 || py < 0 || px >= W || py >= H) return
    const k = py * W + px
    if (bg[k] || !near(k * 4)) return
    bg[k] = 1
    stack.push(k)
  }
  for (let i = 0; i < W; i++) { push(i, 0); push(i, H - 1) }
  for (let j = 0; j < H; j++) { push(0, j); push(W - 1, j) }
  while (stack.length) {
    const k = stack.pop()
    const px = k % W
    const py = (k / W) | 0
    push(px + 1, py); push(px - 1, py); push(px, py + 1); push(px, py - 1)
  }

  // 2. Clean edge: pixels touching the margin are green blended with white; recover coverage and colour
  const GREEN_MIN = 70 // the tile's darkest channel (its green is ~ rgb(63,109,71))
  let x0 = W, y0 = H, x1 = 0, y1 = 0
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const k = py * W + px
      const i = k * 4
      if (bg[k]) { d[i + 3] = 0; continue }
      let edge = false
      for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2; dx++) {
        const qx = px + dx, qy = py + dy
        if (qx >= 0 && qy >= 0 && qx < W && qy < H && bg[qy * W + qx]) { edge = true; break }
      }
      if (edge) {
        const t = Math.max(0.05, Math.min(1, (255 - Math.min(d[i], d[i + 1], d[i + 2])) / (255 - GREEN_MIN)))
        for (let ch = 0; ch < 3; ch++) d[i + ch] = Math.max(0, Math.min(255, (d[i + ch] - 255 * (1 - t)) / t))
        d[i + 3] = Math.round(255 * t)
      }
      if (d[i + 3] > 128) { x0 = Math.min(x0, px); y0 = Math.min(y0, py); x1 = Math.max(x1, px); y1 = Math.max(y1, py) }
    }
  }
  x.putImageData(im, 0, 0)
  const tile = { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }

  const make = (size, paint) => {
    const o = document.createElement('canvas')
    o.width = o.height = size
    const ox = o.getContext('2d')
    ox.imageSmoothingQuality = 'high'
    paint(ox, size)
    return o.toDataURL('image/png')
  }
  // rounded tile: the cut-out, scaled to fill the square
  const rounded = (ox, size) => ox.drawImage(c, tile.x0, tile.y0, tile.w, tile.h, 0, 0, size, size)
  // full bleed: only the part of the tile that is fully green (the corners are rounded), scaled up
  const INSET = 0.08
  const fullBleed = (ox, size, scale = 1) => {
    const sx = tile.x0 + tile.w * INSET
    const sy = tile.y0 + tile.h * INSET
    const sw = tile.w * (1 - 2 * INSET)
    const sh = tile.h * (1 - 2 * INSET)
    if (scale < 1) {
      // padding for a maskable icon: a smooth blend of the art's four (pure green) corners, so no seam shows
      const patch = Math.round(sw * 0.04)
      const tiny = document.createElement('canvas')
      tiny.width = tiny.height = 2
      const tx = tiny.getContext('2d')
      tx.imageSmoothingQuality = 'high'
      for (const [cx, cy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        tx.drawImage(c, cx ? sx + sw - patch : sx, cy ? sy + sh - patch : sy, patch, patch, cx, cy, 1, 1)
      }
      ox.drawImage(tiny, 0, 0, size, size)
    }
    const s = size * scale
    ox.drawImage(c, sx, sy, sw, sh, (size - s) / 2, (size - s) / 2, s, s)
  }
  const out = {}
  for (const [name, size] of Object.entries(sizes.rounded)) out[name] = make(size, rounded)
  out.apple = make(sizes.apple, (ox, size) => fullBleed(ox, size))
  out.maskable = make(sizes.maskable, (ox, size) => fullBleed(ox, size, 0.8))
  out.master = make(1024, rounded)
  return out
}, { src, sizes: { rounded: { 'public/app-icon.png': 512, 'public/app-icon-192.png': 192 }, apple: 180, maskable: 512 } })

const write = (file, dataUrl) => writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64')).then(() => console.log(`Wrote ${file}`))
await write('public/app-icon.png', outputs['public/app-icon.png'])
await write('public/app-icon-192.png', outputs['public/app-icon-192.png'])
await write('public/apple-touch-icon.png', outputs.apple)
await write('public/app-icon-maskable-512.png', outputs.maskable)
if (masterOut) await write(masterOut, outputs.master)
await browser.close()
