/* Renders an icon PNG as ASCII with fraction rulers so a human can read off
 * the true glyph bbox. Usage: node scripts/view-png.mjs <file> [cols]
 * Symbols: '#' a>200 · '+' a>120 · '.' a>40 · ',' a>10 · space else */
import fs from 'node:fs'
import { decodePng, alphaAt } from './measure-png.mjs'

const file = process.argv[2]
const COLS = Number(process.argv[3] ?? 76)
if (!file) {
  console.error('usage: node scripts/view-png.mjs <file.png> [cols]')
  process.exit(1)
}
const png = decodePng(fs.readFileSync(file))
const { w, h } = png
const ROWS = Math.max(8, Math.round((COLS * h) / w / 2.2))

const ruler = (n, label) => {
  let s = ''
  for (let i = 0; i < n; i++) s += i % 10 === 0 ? label : ' '
  return s
}

console.log('        ' + ruler(COLS, '|').replace(/./g, (c, i) => (i % Math.round(COLS / 10) === 0 && i > 0 ? '|' : c)))
console.log('        0%        20%       40%       60%       80%      100%'.slice(0, COLS + 8))
for (let gy = 0; gy < ROWS; gy++) {
  let line = ''
  for (let gx = 0; gx < COLS; gx++) {
    let mx = 0
    const x0 = Math.floor((gx * w) / COLS)
    const x1 = Math.max(x0 + 1, Math.floor(((gx + 1) * w) / COLS))
    const y0 = Math.floor((gy * h) / ROWS)
    const y1 = Math.max(y0 + 1, Math.floor(((gy + 1) * h) / ROWS))
    for (let y = y0; y < y1; y += 1)
      for (let x = x0; x < x1; x += 2) {
        const a = alphaAt(png, x, y)
        if (a > mx) mx = a
      }
    line += mx > 200 ? '#' : mx > 120 ? '+' : mx > 40 ? '.' : mx > 10 ? ',' : ' '
  }
  console.log(`${Math.round((gy / ROWS) * 100).toString().padStart(3)}%    ` + line)
}
