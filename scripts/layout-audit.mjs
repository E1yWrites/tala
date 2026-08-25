/* Settings layout audit: measures real geometry of the app shell + settings
 * cards/rows/controls to find the element responsible for off-grid rendering.
 * Also validates doodle raster geometry (loaded, centred, unclipped).
 * Run: node scripts/layout-audit.mjs  (requires `npm run preview` on :4173) */
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'

/** Same table the shim consumes — single source of truth for artwork bounds. */
const RASTER_META = JSON.parse(
  readFileSync(new URL('../src/assets/icons/raster-meta.json', import.meta.url), 'utf8'),
)

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173'
const HEADLESS =
  process.env.CHROME_BIN ??
  '/home/e1yu/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell'

const browser = await chromium.launch({
  executablePath: HEADLESS,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

/** In-page probe: returns shell adjacency, card alignment, row/control grid,
 *  horizontal overflow offenders, and any element poking outside the viewport. */
const PROBE = () => {
  const vw = innerWidth
  const out = { vw, docScrollW: document.documentElement.scrollWidth, scrollX: window.scrollX, issues: [], geo: {} }

  const aside = [...document.querySelectorAll('body aside')].find((a) => a.querySelector('nav'))
  const handle = document.querySelector('[role="separator"]')
  const main = document.querySelector('main')
  const r = (el) => {
    if (!el) return null
    const b = el.getBoundingClientRect()
    return { left: +b.left.toFixed(1), right: +b.right.toFixed(1), width: +b.width.toFixed(1) }
  }
  out.geo.sidebar = r(aside)
  out.geo.handle = r(handle)
  out.geo.main = r(main)

  // Sidebar → main adjacency (handle w-1.5 overlaps the seam by design)
  if (aside && main) {
    const gap = +(main.getBoundingClientRect().left - aside.getBoundingClientRect().right).toFixed(1)
    out.geo.seamGap = gap
    if (gap > 8) out.issues.push(`gap between sidebar and main: ${gap}px`)
    if (gap < -2) out.issues.push(`main overlaps sidebar by ${Math.abs(gap)}px`)
  }

  // Cards must share edges
  const sections = [...(main?.querySelectorAll('section') ?? [])]
  out.geo.sections = sections.map((s) => r(s))
  if (sections.length > 1) {
    const lefts = new Set(out.geo.sections.map((s) => s.left))
    const rights = new Set(out.geo.sections.map((s) => s.right))
    // The About post-it rotates slightly; allow 2px tolerance there.
    if (lefts.size > 2) out.issues.push(`cards have ${lefts.size} distinct left edges: ${[...lefts].join(', ')}`)
    if (rights.size > 2) out.issues.push(`cards have ${rights.size} distinct right edges: ${[...rights].join(', ')}`)
  }

  // Rows: label column left-aligned; control column right edge consistent per card
  const rows = [...(main?.querySelectorAll('section [data-row]') ?? [])]
  const controlRights = []
  for (const row of rows) {
    const kids = [...row.children]
    if (kids.length < 2) continue
    controlRights.push(+kids[kids.length - 1].getBoundingClientRect().right.toFixed(1))
  }
  if (controlRights.length) {
    const uniqRight = Math.round(Math.max(...controlRights))
    const off = controlRights.filter((cr) => Math.abs(cr - uniqRight) > 2).length
    out.geo.controlColumnRight = uniqRight
    out.geo.controlsOffColumn = off
    if (off > 0) out.issues.push(`${off}/${controlRights.length} row controls not flush to the shared right edge`)
  }

  // Horizontal overflow: any descendant wider than its scroll container or viewport
  let widest = null
  for (const el of document.querySelectorAll('main *')) {
    const b = el.getBoundingClientRect()
    if (b.width === 0) continue
    if (b.right > vw + 0.5 || b.left < -0.5) {
      const id = `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 3).join('.')}`
      if (!widest || b.right > widest.right) widest = { id, left: +b.left.toFixed(1), right: +b.right.toFixed(1) }
      if (out.issues.length < 12)
        out.issues.push(`outside viewport: ${id} [${b.left.toFixed(0)} … ${b.right.toFixed(0)}] vw=${vw}`)
    }
  }
  out.geo.widestOffender = widest

  // Scroll-container overflow inside settings
  const scroller = main?.querySelector(':scope > div')
  if (scroller) {
    out.geo.scroller = {
      clientW: scroller.clientWidth,
      scrollW: scroller.scrollWidth,
      overflowX: scroller.scrollWidth > scroller.clientWidth + 1,
    }
  }
  if (document.documentElement.scrollWidth > innerWidth + 1)
    out.issues.push(`page-level horizontal overflow: scrollWidth=${document.documentElement.scrollWidth} > vw=${vw}`)
  return out
}

/** Doodle rasters: every image must load, its measured artwork must sit dead
 *  centre in the icon box, fill ~88% of the larger axis, and never escape. */
const DOODLE_PROBE = (meta) => {
  const issues = []
  const geo = { doodles: 0 }
  for (const span of document.querySelectorAll('[data-doodle]')) {
    const slot = span.getAttribute('data-doodle')
    const img = span.querySelector('img')
    if (!img) continue
    const s = span.getBoundingClientRect()
    if (s.width === 0 && s.height === 0) continue // hidden (drawer etc.)
    geo.doodles++
    const slotIssues = []
    if (!img.naturalWidth) slotIssues.push('image failed to load')
    const base = img.getAttribute('data-doodle-base') ?? ''
    const i = img.getBoundingClientRect()
    if (i.width === 0 || i.height === 0) {
      issues.push(`doodle ${slot}: zero-sized img`)
      continue
    }
    const m = meta[base]
    if (!m) {
      slotIssues.push(`no raster-meta entry for "${base}"`)
    } else {
      const art = {
        l: i.left + m.l * i.width,
        t: i.top + m.t * i.height,
        r: i.left + m.r * i.width,
        b: i.top + m.b * i.height,
      }
      const TOL = 1.5
      if (art.l < s.left - TOL || art.t < s.top - TOL || art.r > s.right + TOL || art.b > s.bottom + TOL)
        slotIssues.push(
          `artwork escapes box [${(art.l - s.left).toFixed(1)}, ${(art.t - s.top).toFixed(1)} → ${(art.r - s.right).toFixed(1)}, ${(art.b - s.bottom).toFixed(1)}] rel`,
        )
      const cxOff = Math.abs((art.l + art.r) / 2 - (s.left + s.right) / 2)
      const cyOff = Math.abs((art.t + art.b) / 2 - (s.top + s.bottom) / 2)
      if (cxOff > Math.max(2, s.width * 0.06) || cyOff > Math.max(2, s.height * 0.06))
        slotIssues.push(`off-centre by (${cxOff.toFixed(1)}px, ${cyOff.toFixed(1)}px)`)
      const fill = Math.max(art.r - art.l, art.b - art.t) / s.width
      if (fill < 0.8 || fill > 0.96) slotIssues.push(`unexpected fill ${fill.toFixed(2)}`)
    }
    for (const p of slotIssues) issues.push(`doodle ${slot} (${base || '?'}): ${p}`)
  }
  return { issues, geo }
}

async function freshProfileWithSettings(width, height, sidebarWidth) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.waitForSelector('#splash', { state: 'detached', timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(300)
  const onboarded = !(await page.isVisible('text=Welcome to Notely'))
  if (!onboarded) {
    await page.click('text=Get Started')
    await page.fill('input[aria-label="Your name"]', 'Alex')
    await page.press('input[aria-label="Your name"]', 'Enter')
    await page.click('text=Skip for now')
    await page.click('text=Start Using Notely')
    await page.waitForTimeout(400)
  }
  // Docked sidebar on desktop; drawer + Ctrl+, hotkey on tablet widths.
  const docked = await page.locator('nav button[aria-label="Settings"]').count()
  if (docked > 0) {
    await page.evaluate(() => document.querySelector('nav button[aria-label="Settings"]')?.click())
  } else {
    await page.keyboard.press('Control+,')
  }
  await page.waitForSelector('h1:text("Settings")', { timeout: 5000 })
  await page.waitForTimeout(350)
  if (sidebarWidth) {
    // Drive the real slider so we test the production code path.
    await page.locator('input[aria-label="Sidebar width"]').evaluate((el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(el, String(v))
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }))
    }, sidebarWidth)
    await page.waitForTimeout(350)
  }
  return { ctx, page }
}

let failures = 0
function report(label, data) {
  const ok = data.issues.length === 0
  if (!ok) failures++
  console.log(`\n=== ${label} → ${ok ? 'CLEAN' : 'ISSUES'} ===`)
  console.log(JSON.stringify(data.geo))
  for (const i of data.issues) console.log('  ⚠ ' + i)
}

for (const [w, h, sb] of [
  [1440, 900, null],
  [1440, 900, 342],
  [1280, 800, 280],
  [1280, 800, 380],
  [1024, 768, null],
  [820, 900, null], // tablet: drawer sidebar, stacked rows (<640 grid collapse)
]) {
  const label = `viewport ${w}x${h}${sb ? `, sidebarWidth=${sb}` : ', default width'}`
  const { ctx, page } = await freshProfileWithSettings(w, h, sb)
  report(label, await page.evaluate(PROBE))
  const doodle = await page.evaluate(DOODLE_PROBE, RASTER_META)
  report(`${label} — doodles`, doodle)
  await ctx.close()
}

await browser.close()
console.log(failures === 0 ? '\nLAYOUT AUDIT CLEAN' : `\n${failures} SCENARIO(S) WITH ISSUES`)
process.exit(failures === 0 ? 0 : 1)
