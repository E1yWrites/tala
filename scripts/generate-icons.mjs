/* Rasterizes the Tala brand mark into public/app-icon.png.
 * Run: node scripts/generate-icons.mjs
 * Then regenerate platform icons: npm run tauri icon public/app-icon.png */
import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'

const SIZE = 512

const svg = `<svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M31.2 13.1C42.2 11.9 50.3 19.6 50.4 30.2C50.5 40.3 42.7 48.3 32.1 48.4C21.6 48.5 13.5 40.5 13.4 30.3C13.3 20.6 20.8 14.2 31.2 13.1Z" fill="#E8B84A" stroke="#171717" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <g stroke="#171717" stroke-width="4" stroke-linecap="round">
    <path d="M31.4 8.4L30.9 3.4"/><path d="M44.6 13.9L47.9 10.1"/><path d="M52.6 29.8L57.6 29.4"/><path d="M45.9 44.3L49.3 48"/><path d="M31.8 53.2L31.5 58.2"/><path d="M17.6 44.6L14.2 48.3"/><path d="M10.4 30L5.4 29.6"/><path d="M17.9 15.2L14.6 11.3"/>
  </g>
  <path d="M56.2 39.4C56.8 42.2 57.7 43.1 60.6 43.7C57.7 44.3 56.8 45.2 56.2 48C55.6 45.2 54.7 44.3 51.8 43.7C54.7 43.1 55.6 42.2 56.2 39.4Z" fill="#E8B84A" stroke="#171717" stroke-width="3" stroke-linejoin="round"/>
</svg>`

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
await page.setContent(
  `<!doctype html><html><body style="margin:0;background:transparent;display:grid;place-items:center;">
     <div style="width:${SIZE * 0.86}px;height:${SIZE * 0.86}px;">${svg}</div>
   </body></html>`,
)
await page.screenshot({ path: '/dev/null' }).catch(() => {})
const buf = await page.screenshot({ omitBackground: true })
await writeFile('public/app-icon.png', buf)
console.log(`Wrote public/app-icon.png (${SIZE}px)`)
await browser.close()
