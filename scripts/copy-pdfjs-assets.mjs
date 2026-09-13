/* Copies pdf.js's standard fonts + CMaps into public/pdfjs so the viewer can
 * resolve them at runtime (pdf.js loads them by file name, which hashed Vite
 * assets would break). Runs before dev/build; output is git-ignored. */
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = join(root, 'node_modules', 'pdfjs-dist')
const dest = join(root, 'public', 'pdfjs')

if (!existsSync(src)) {
  console.warn('[tala] pdfjs-dist not installed — skipping asset copy')
  process.exit(0)
}
mkdirSync(dest, { recursive: true })
for (const dir of ['standard_fonts', 'cmaps', 'wasm']) {
  const from = join(src, dir)
  if (!existsSync(from)) continue
  cpSync(from, join(dest, dir), { recursive: true, force: true })
}
console.log('[tala] pdf.js assets copied to public/pdfjs')
