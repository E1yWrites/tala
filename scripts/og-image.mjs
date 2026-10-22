/*
  Renders public/og-image.jpg (1200×630, the Open Graph and Twitter card) from
  the HTML below, in the app's own colours, font and Bituin. No preview needed:
    node scripts/og-image.mjs
  The headless shell needs LD_LIBRARY_PATH as in pages-e2e.mjs.
*/
import { chromium } from 'playwright-core'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = pathToFileURL(resolve(import.meta.dirname, '..')).href
const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:H;src:url(${ROOT}/node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-wght-normal.woff2) format('woff2');font-weight:100 900}
@font-face{font-family:H;src:url(${ROOT}/node_modules/@fontsource-variable/hanken-grotesk/files/hanken-grotesk-latin-ext-wght-normal.woff2) format('woff2');font-weight:100 900;unicode-range:U+0100-024F,U+20B1}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;font-family:H,system-ui,sans-serif;background:#1f4a2b;color:#eef6ee;overflow:hidden;position:relative}
.grid{position:absolute;inset:0;background-image:radial-gradient(rgba(238,246,238,.10) 1.2px,transparent 1.3px);background-size:24px 24px}
.left{position:absolute;left:72px;top:64px;width:560px}
.brand{display:flex;align-items:center;gap:14px}
.brand img{width:64px;height:64px;border-radius:14px}
.brand span{font-size:44px;font-weight:800;letter-spacing:-.02em}
h1{margin-top:58px;font-size:64px;line-height:1.04;font-weight:800;letter-spacing:-.03em}
h1 em{font-style:normal;color:#f6c845}
p.sub{margin-top:24px;font-size:24px;line-height:1.35;color:#b7cfba;font-weight:500}
p.foot{position:absolute;left:72px;bottom:52px;font-size:19px;color:#b7cfba;font-weight:600;letter-spacing:.01em}
.card{position:absolute;right:64px;top:92px;width:470px;background:#fff;color:#14261a;border-radius:18px;box-shadow:0 2px 4px rgba(0,0,0,.15),0 24px 60px rgba(0,0,0,.30);overflow:hidden}
.cap{display:flex;align-items:center;gap:12px;padding:20px 22px;border-bottom:1px solid #d6e1d4;font-size:21px;color:#57695c}
.cap b{width:3px;height:26px;background:#2a52c9;border-radius:2px;margin-left:-6px}
.row{padding:16px 22px;border-bottom:1px solid #d6e1d4}
.row:last-child{border-bottom:0}
.t{font-size:21px;font-weight:600}
.chip{display:inline-block;margin-top:8px;padding:3px 12px;border-radius:999px;font-size:16px;font-weight:700;background:#e1efe0;color:#23562e}
.money{background:#e4ede3;color:#14261a}.event{background:#e4ebfc;color:#2a52c9}
.star{position:absolute;right:28px;bottom:26px;width:118px}
</style></head><body><div class="grid"></div>
<div class="left">
  <div class="brand"><img src="${ROOT}/public/app-icon-192.png"><span>Tala</span></div>
  <h1>Write it once.<br><em>Tala</em> sorts it out.</h1>
  <p class="sub">Type a line about your day. Money, workouts, habits and plans file themselves. Notes, pen and PDFs too.</p>
</div>
<p class="foot">Free · no account · works offline · Pagtatala, made simple.</p>
<div class="card">
  <div class="cap"><b></b>Write anything…</div>
  <div class="row"><div class="t">lunch sa jollibee 189</div><span class="chip money">−₱189 · Food › Eating out · Jollibee</span></div>
  <div class="row"><div class="t">bench 40kg 3x10</div><span class="chip">3×10 · 40kg · PR</span></div>
  <div class="row"><div class="t">dentist fri 2pm</div><span class="chip event">Fri, Oct 24 · 2pm</span></div>
  <div class="row"><div class="t">water 3</div><span class="chip">✓ water ×3</span></div>
</div>
<img class="star" src="${ROOT}/src/assets/bituin/bituin-512.png">
</body></html>
`

const file = join(tmpdir(), 'tala-og.html')
await writeFile(file, html)
const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.goto(pathToFileURL(file).href)
await page.waitForTimeout(600)
await page.screenshot({ path: resolve(import.meta.dirname, '../public/og-image.jpg'), type: 'jpeg', quality: 88 })
await browser.close()
console.log('wrote public/og-image.jpg')
