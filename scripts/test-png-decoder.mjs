/* Validates measure-png's decoder + artworkBBox: builds synthetic PNGs
 * exercising every scanline filter (0–4) with known ground-truth rects, plus
 * a two-cluster case (centred glyph + edge slab) that must keep only the
 * centred glyph. Run from repo root. */
import fs from 'node:fs'
import zlib from 'node:zlib'
import { decodePng, alphaAt } from './measure-png.mjs'

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** Builds an RGBA PNG where every row is genuinely filtered with type f and
 *  the given rects [x0,y0,x1,y1] (inclusive) have alpha=255. */
function synth(w, h, f, rects) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const bpp = 4
  const stride = w * bpp
  const plain = Buffer.alloc(h * stride)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inside = rects.some(([rx0, ry0, rx1, ry1]) => x >= rx0 && x <= rx1 && y >= ry0 && y <= ry1)
      const o = y * stride + x * bpp
      const v = ((x * 37 + y * 91) % 251) + 1
      plain[o] = v
      plain[o + 1] = 255 - v
      plain[o + 2] = v >> 1
      plain[o + 3] = inside ? 255 : 0
    }
  }
  const raw = Buffer.alloc(h * (stride + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = f
    for (let x = 0; x < stride; x++) {
      const cur = plain[y * stride + x]
      const left = x >= bpp ? plain[y * stride + x - bpp] : 0
      const up = y > 0 ? plain[(y - 1) * stride + x] : 0
      const upleft = y > 0 && x >= bpp ? plain[(y - 1) * stride + x - bpp] : 0
      let filtered = cur
      if (f === 1) filtered = cur - left
      else if (f === 2) filtered = cur - up
      else if (f === 3) filtered = cur - ((left + up) >> 1)
      else if (f === 4) {
        const p = left + up - 2 * upleft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upleft)
        filtered = cur - (pa <= pb && pa <= pc ? left : pb <= pc ? up : upleft)
      }
      raw[y * (stride + 1) + 1 + x] = filtered & 255
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

let failed = 0
const cases = []
for (let f = 0; f <= 4; f++) {
  cases.push([64, 64, f, [[10, 20, 40, 55]], [10, 20, 40, 55]]) // interior rect, filters 0-4
}
cases.push([37, 23, 4, [[0, 0, 36, 22]], [0, 0, 36, 22]]) // odd size, full canvas
cases.push([100, 7, 2, [[98, 5, 99, 6]], [98, 5, 99, 6]]) // bottom-right corner pixel
// Stray export slab hugging the right edge + small centred glyph:
// artworkBBox must report ONLY the centred glyph.
cases.push([256, 256, 4, [[40, 96, 120, 160], [230, 32, 255, 224]], [40, 96, 120, 160]])
// Glyph fragment slightly off-centre (dashed ring) still within merge radius
cases.push([256, 256, 1, [[104, 104, 152, 152], [170, 120, 178, 136]], [104, 104, 178, 152]])

for (const [w, h, f, rects, expect] of cases) {
  const png = decodePng(synth(w, h, f, rects))
  const bb = (await import('./measure-png.mjs')).artworkBBox(png)
  const got = [
    Math.round(bb.l * w),
    Math.round(bb.t * h),
    Math.round(bb.r * w) - 1,
    Math.round(bb.b * h) - 1,
  ]
  const ok =
    got[0] === expect[0] && got[1] === expect[1] && got[2] === expect[2] && got[3] === expect[3]
  if (!ok) failed++
  console.log(
    `${ok ? 'PASS' : 'FAIL'} filter=${f} ${w}x${h} rects=${JSON.stringify(rects)} expect=${expect} got=${got}`,
  )
}
console.log(failed === 0 ? 'DECODER + BBOX VALID' : `${failed} FAILURES`)
process.exit(failed ? 1 : 0)
