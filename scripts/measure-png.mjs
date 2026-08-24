/* Measures the opaque (alpha > threshold) bounding box of every icon raster
 * and writes src/assets/icons/raster-meta.json — the geometry table the
 * lucideShim uses to center artwork exactly inside its clip box.
 *
 * Pure node (zlib PNG decoder), no dependencies.
 * Run: node scripts/measure-png.mjs            # scan src/assets/icons/**
 *      node scripts/measure-png.mjs <dir> ...  # custom roots
 */
import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const ROOTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['src/assets/icons']
const OUT = 'src/assets/icons/raster-meta.json'

/**
 * Hand-curated glyph bboxes [l, t, r, b] as canvas fractions.
 *
 * Several source assets were exported with a stray duplicate of the artwork
 * shifted right/down (amputated by the canvas edge), plus ghost fill layers.
 * The automatic centre-cluster heuristic cannot separate a duplicate that
 * touches the glyph, so these were read off pixel maps by eye
 * (scripts/view-png.mjs) and win over the automatic scan.
 */
const MANUAL_BBOXES = {
  app_archive: [0.155, 0.17, 0.675, 0.8],
  app_check: [0.185, 0.165, 0.625, 0.8],
  app_edit: [0.31, 0.085, 0.505, 0.93],
  app_folder: [0.12, 0.17, 0.7, 0.8],
  app_new: [0.155, 0.135, 0.565, 0.8],
  app_note: [0.245, 0.185, 0.905, 0.805],
  app_pin: [0.175, 0.16, 0.7, 0.845],
  app_recent: [0.145, 0.17, 0.705, 0.78],
  app_search: [0.15, 0.165, 0.625, 0.86],
  app_star: [0.105, 0.095, 0.735, 0.88],
  app_trash: [0.185, 0.16, 0.75, 0.835],
  back: [0.155, 0.31, 0.585, 0.66],
  desktop_setting: [0.195, 0.235, 0.635, 0.735],
  dropdown: [0.295, 0.33, 0.6, 0.665],
  expand: [0.22, 0.27, 0.505, 0.715],
  filled_pin: [0.085, 0.065, 0.7, 0.925],
  filled_sort: [0.085, 0.065, 0.7, 0.925],
  filled_star: [0.085, 0.065, 0.7, 0.925],
  gear: [0.29, 0.29, 0.72, 0.71],
  night_halfmoon: [0.175, 0.2, 0.68, 0.78],
  notely_set_n: [0.155, 0.165, 0.565, 0.835],
  panel: [0.205, 0.335, 0.375, 0.625],
  reading_layout: [0.15, 0.23, 0.575, 0.74],
  saved_check: [0.125, 0.36, 0.52, 0.82],
  sun: [0.29, 0.285, 0.775, 0.715],
  ui_check: [0.155, 0.165, 0.625, 0.8],
  ui_filter: [0.15, 0.16, 0.645, 0.835],
  ui_info: [0.195, 0.235, 0.565, 0.74],
  ui_sort: [0.105, 0.16, 0.59, 0.835],
  ui_star: [0.165, 0.2, 0.575, 0.775],
}

/** Decodes a PNG's pixel data (non-interlaced, 8-bit) — enough for bbox scans. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let pos = 8
  let w = 0
  let h = 0
  let colorType = 0
  const idat = []
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos)
    const type = buf.toString('ascii', pos + 4, pos + 8)
    if (type === 'IHDR') {
      w = buf.readUInt32BE(pos + 8)
      h = buf.readUInt32BE(pos + 12)
      colorType = buf[pos + 17]
      if (buf[pos + 16] !== 8) throw new Error('unsupported bit depth')
      if (buf[pos + 20] !== 0) throw new Error('interlaced PNG unsupported')
    } else if (type === 'IDAT') {
      idat.push(buf.slice(pos + 8, pos + 8 + len))
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + len
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType]
  if (!channels) throw new Error(`unsupported color type ${colorType}`)
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = w * channels
  const out = Buffer.alloc(h * stride)
  let rp = 0
  for (let y = 0; y < h; y++) {
    const filter = raw[rp++]
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride)
    const cur = out.slice(y * stride, (y + 1) * stride)
    for (let x = 0; x < stride; x++) {
      // Per PNG spec: a = left, b = above, c = upper-left (all in bytes).
      const a = x >= channels ? cur[x - channels] : 0
      const b = y > 0 ? prev[x] : 0
      const c = y > 0 && x >= channels ? prev[x - channels] : 0
      let v = raw[rp + x]
      if (filter === 1) v += a
      else if (filter === 2) v += b
      else if (filter === 3) v += (a + b) >> 1
      else if (filter === 4) {
        const p = a + b - 2 * c
        const pa = Math.abs(p - a)
        const pb = Math.abs(p - b)
        const pc = Math.abs(p - c)
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
      }
      cur[x] = v & 255
    }
    rp += stride
  }
  return { w, h, colorType, channels, px: out }
}

export function alphaAt(png, x, y) {
  const { colorType, channels, px, w } = png
  if (colorType === 6) return px[y * w * 4 + x * 4 + 3]
  if (colorType === 4) return px[y * w * 2 + x * 2 + 1]
  if (colorType === 3) {
    // Palette: find PLTE alpha via tRNS if present; conservative fallback 255
    return png.trns?.[px[y * w + x]] ?? 255
  }
  return 255 // grayscale / RGB have no alpha
}

function measure(file, base) {
  const manual = MANUAL_BBOXES[base]
  if (manual) {
    const [l, t, r, b] = manual
    return { file, l, t, r, b, clusters: 0 }
  }
  const buf = fs.readFileSync(file)
  const png = decodePng(buf)
  // tRNS chunk for palette images
  if (png.colorType === 3) {
    let pos = 8
    while (pos < buf.length) {
      const len = buf.readUInt32BE(pos)
      const type = buf.toString('ascii', pos + 4, pos + 8)
      if (type === 'tRNS') png.trns = [...buf.slice(pos + 8, pos + 8 + len)]
      else if (type === 'IEND') break
      pos += 12 + len
    }
  }
  return { file, ...artworkBBox(png) }
}

/**
 * Bounding box of the actual hand-drawn glyph.
 *
 * Source assets sometimes carry stray export layers (e.g. a mint-green fill
 * rectangle hugging an edge). A raw alpha bbox includes them and would
 * mis-center every icon. Instead: connected components of opaque cells,
 * then keep the cluster that surrounds the canvas centre — glyph fragments
 * (dashes, dots, stars) live near the middle; junk slabs hug the edges.
 */
export function artworkBBox(png, opts = {}) {
  const { w, h } = png
  const ALPHA_MIN = opts.alphaMin ?? 60
  const MERGE_RADIUS = opts.mergeRadius ?? 0.29

  // Downsampled opacity grid
  const cell = Math.max(1, Math.ceil(Math.max(w, h) / 220))
  const gw = Math.ceil(w / cell)
  const gh = Math.ceil(h / cell)
  const grid = new Uint8Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let on = 0
      const x1 = Math.min((gx + 1) * cell, w)
      const y1 = Math.min((gy + 1) * cell, h)
      outer: for (let y = gy * cell; y < y1; y++) {
        for (let x = gx * cell; x < x1; x++) {
          if (alphaAt(png, x, y) > ALPHA_MIN) {
            on = 1
            break outer
          }
        }
      }
      grid[gy * gw + gx] = on
    }
  }

  // Connected components (4-neighbour BFS)
  const comp = new Int32Array(gw * gh).fill(-1)
  const stats = []
  for (let i = 0; i < grid.length; i++) {
    if (!grid[i] || comp[i] >= 0) continue
    const id = stats.length
    const queue = [i]
    comp[i] = id
    let n = 0
    let sx = 0
    let sy = 0
    while (queue.length) {
      const c = queue.pop()
      const cx0 = c % gw
      const cy0 = (c / gw) | 0
      n++
      sx += cx0
      sy += cy0
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = cx0 + dx
        const ny = cy0 + dy
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue
        const ni = ny * gw + nx
        if (grid[ni] && comp[ni] < 0) {
          comp[ni] = id
          queue.push(ni)
        }
      }
    }
    stats.push({ n, cx: sx / n / gw, cy: sy / n / gh })
  }
  if (!stats.length) throw new Error('fully transparent')

  // Keep everything clustered around the canvas centre
  const keep = new Set()
  for (let id = 0; id < stats.length; id++) {
    const d = Math.hypot(stats[id].cx - 0.5, stats[id].cy - 0.5)
    if (d <= MERGE_RADIUS) keep.add(id)
  }
  if (!keep.size) {
    // Degenerate canvas — fall back to the largest component
    keep.add(stats.reduce((a, b, i) => (b.n > stats[a].n ? i : a), 0))
  }

  // Precise bbox at full resolution over kept components
  let l = w
  let t = h
  let r = -1
  let b = -1
  for (let y = 0; y < h; y++) {
    const gy = Math.min((y / cell) | 0, gh - 1)
    for (let x = 0; x < w; x++) {
      if (alphaAt(png, x, y) <= 25) continue
      const gx = Math.min((x / cell) | 0, gw - 1)
      if (!keep.has(comp[gy * gw + gx])) continue
      if (x < l) l = x
      if (x > r) r = x
      if (y < t) t = y
      if (y > b) b = y
    }
  }
  return {
    l: +(l / w).toFixed(4),
    t: +(t / h).toFixed(4),
    r: +((r + 1) / w).toFixed(4),
    b: +((b + 1) / h).toFixed(4),
    clusters: stats.length,
  }
}

function walk(dir, acc) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) walk(p, acc)
    else if (/\.(png|webp)$/i.test(e.name)) acc.push(p)
  }
  return acc
}

async function main() {
  const meta = {}
  for (const root of ROOTS) {
    for (const file of walk(root, [])) {
      const base = path
        .basename(file)
        .replace(/\.[^.]+$/, '')
        .replace(/_(light|dark)$/, '')
        .toLowerCase()
      meta[base] = measure(file, base)
      const m = meta[base]
      const cx = ((m.l + m.r) / 2 - 0.5) * 100
      const cy = ((m.t + m.b) / 2 - 0.5) * 100
      const tag =
        m.clusters === 0
          ? '  [manual]'
          : m.clusters > 1
            ? `  [${m.clusters} clusters, kept centre cluster]`
            : ''
      const warn =
        m.r > 0.97 || m.b > 0.97 || m.l < 0.04 || m.t < 0.04 ? '  << CHECK: touches edge' : ''
      console.log(
        `${base.padEnd(32)} art [${m.l}, ${m.t} → ${m.r}, ${m.b}]  centerΔ (${cx >= 0 ? '+' : ''}${cx.toFixed(1)}%, ${cy >= 0 ? '+' : ''}${cy.toFixed(1)}%)${tag}${warn}`,
      )
    }
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify(meta, null, 2) + '\n')
  console.log(`\n${Object.keys(meta).length} entries → ${OUT}`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.url.replace('file://', '')) {
  await main()
}
