/* Visual QA: fresh-profile onboarding walkthrough + rendered icon audit.
 * Run: node scripts/visual-qa.mjs  (requires `npm run preview` on :4173) */
import { chromium } from 'playwright-core'
import fs from 'node:fs'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173'
const OUT = '/tmp/opencode/notely-qa'
fs.mkdirSync(OUT, { recursive: true })

const HEADLESS = process.env.CHROME_BIN ?? '/home/e1yu/.cache/ms-playwright/chromium_headless_shell-1148/chrome-linux/headless_shell'
const browser = await chromium.launch({
  executablePath: HEADLESS,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await ctx.newPage()
let failures = 0
function check(name, ok, extra = '') {
  const tag = ok ? 'PASS' : 'FAIL'
  if (!ok) failures++
  console.log(`${tag}  ${name}${extra ? ` — ${extra}` : ''}`)
}
page.on('pageerror', (e) => { failures++; console.log('FAIL page error —', e.message) })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('#splash', { state: 'detached', timeout: 15000 }).catch(() => {})
await page.waitForTimeout(400)

// ---- Phase 6: first-launch onboarding --------------------------------------
check('fresh profile shows Welcome screen', await page.isVisible('text=Welcome to Notely'))
check('brand mark renders on welcome', await page.isVisible('img[src*="notely_set_N"]'))
await page.screenshot({ path: `${OUT}/01-onboarding-welcome.png` })

await page.click('text=Get Started')
await page.waitForTimeout(250)
check('name step requires input (Continue disabled)', await page.isDisabled('button[type="submit"]'))
await page.fill('input[aria-label="Your name"]', 'Alex')
await page.screenshot({ path: `${OUT}/02-onboarding-name.png` })
await page.press('input[aria-label="Your name"]', 'Enter') // Enter submits
await page.waitForTimeout(250)
check('Enter advances to picture step', await page.isVisible('text=Add a profile picture'))
// Placeholder avatar visible before upload
const placeholderVisible = await page.locator('div.rounded-full svg[viewBox="0 0 24 24"]').count()
check('default placeholder avatar visible on picture step', placeholderVisible > 0)
await page.screenshot({ path: `${OUT}/03-onboarding-picture.png` })
await page.click('text=Skip for now')
await page.waitForTimeout(250)
check('completion screen greets by name', await page.isVisible("text=You're all set, Alex!"))
await page.screenshot({ path: `${OUT}/04-onboarding-complete.png` })
await page.click('text=Start Using Notely')
await page.waitForTimeout(500)

// ---- Dashboard --------------------------------------------------------------
check('dashboard greeting uses profile name', await page.isVisible('text=Hey, Alex'))
await page.screenshot({ path: `${OUT}/05-dashboard.png` })

// ---- Sidebar visual audit ----------------------------------------------------
const sidebar = page.locator('aside').first()
await sidebar.screenshot({ path: `${OUT}/06-sidebar.png` })

// Programmatic doodle audit: every doodle <img> must be drawn larger than its
// clipping box and use object-fit contain/cover (never 'none').
const imgAudit = await page.evaluate(() => {
  const imgs = [...document.querySelectorAll('span[aria-hidden] img[src*="/assets/"], span[aria-hidden] img[src*="icons/"]')]
  return imgs.slice(0, 40).map((img) => {
    const box = img.parentElement.getBoundingClientRect()
    const cs = getComputedStyle(img)
    return {
      src: img.src.split('/').pop(),
      boxW: Math.round(box.width),
      imgW: Math.round(parseFloat(cs.width)),
      objectFit: cs.objectFit,
      ok: parseFloat(cs.width) >= Math.round(box.width) && cs.objectFit !== 'none',
    }
  })
})
const badImgs = imgAudit.filter((i) => !i.ok)
check('doodle imgs scaled to fill their boxes (no objectFit:none)', badImgs.length === 0, JSON.stringify(badImgs))

// Visible-artwork sanity: sidebar nav icons should have a real painted area.
// Sample one known slot via the All Notes row icon.
const navIconBox = await page.evaluate(() => {
  const btns = [...document.querySelectorAll('nav button')]
  const allNotes = btns.find((b) => b.textContent?.includes('All Notes'))
  if (!allNotes) return null
  const img = allNotes.querySelector('img')
  if (!img) return null
  return { w: img.getBoundingClientRect().width, parentW: img.parentElement.getBoundingClientRect().width }
})
check('sidebar doodle artwork fills ≥80% of its box', !!navIconBox && navIconBox.w >= navIconBox.parentW * 0.8, JSON.stringify(navIconBox))

// ---- Tooltip -----------------------------------------------------------------
// (Expanded sidebar shows plain labels — its tooltips appear only when
//  collapsed. Use the list panel's New-note button, which always has one.)
await page.click('text=All Notes')
await page.waitForTimeout(400)
const tipTarget = page.locator('button[aria-label="New note"]').first()
await tipTarget.hover()
await page.waitForTimeout(350)
const tipBox = await page.evaluate(() => {
  const t = document.querySelector('[role="tooltip"]')
  if (!t) return null
  const r = t.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight }
})
check('tooltip appears for icon-only button', !!tipBox)
check(
  'tooltip stays inside viewport',
  !!tipBox && tipBox.x >= 0 && tipBox.y >= 0 && tipBox.x + tipBox.w <= tipBox.vw && tipBox.y + tipBox.h <= tipBox.vh,
  JSON.stringify(tipBox),
)
if (tipBox) {
  await page.screenshot({ path: `${OUT}/07-tooltip.png` })
  // Collapsed rail: tooltips must escape the sidebar (portal + clamping).
  const collapseBtn = page.locator('nav button[aria-label="Collapse sidebar"]')
  if ((await collapseBtn.count()) > 0) {
    await collapseBtn.click()
    await page.waitForTimeout(450)
    const railBtn = page.locator('nav button[aria-label="Settings"]')
    await railBtn.hover()
    await page.waitForTimeout(350)
    const escaped = await page.evaluate(() => {
      const t = document.querySelector('[role="tooltip"]')
      const aside = document.querySelector('aside')
      if (!t || !aside) return false
      const tr = t.getBoundingClientRect()
      const ar = aside.getBoundingClientRect()
      return getComputedStyle(t).visibility === 'visible' && tr.left >= ar.right - 2
    })
    check('collapsed-rail tooltip renders outside sidebar bounds', escaped)
    await page.screenshot({ path: `${OUT}/07b-tooltip-collapsed.png` })
    const expandBtn = page.locator('nav button[aria-label="Expand sidebar"]')
    if ((await expandBtn.count()) > 0) { await expandBtn.click(); await page.waitForTimeout(450) }
  }
}
await page.mouse.move(720, 300)
const rows = page.locator('[role="button"][tabindex="0"]')
if ((await rows.count()) > 0) {
  await rows.first().click()
  await page.waitForTimeout(600)
  check('note opens in editor', await page.isVisible('.ProseMirror'))
  await page.screenshot({ path: `${OUT}/08-editor.png` })
}

// ---- Settings + profile modal ---------------------------------------------------
await page.click('nav button[aria-label="Settings"]')
await page.waitForTimeout(400)
check('settings opens', await page.isVisible('h1:has-text("Settings")'))
await page.screenshot({ path: `${OUT}/09-settings.png` })
// Avatar click must open the picture modal (single edit path)
await page.click('button[aria-label="Change profile picture"] >> nth=0')
await page.waitForTimeout(350)
check('profile picture modal opens from avatar click', await page.isVisible('text=Profile Picture'))
await page.screenshot({ path: `${OUT}/10-profile-modal.png` })
await page.keyboard.press('Escape')
await page.waitForTimeout(200)

// Re-run wizard entry exists
check('re-run setup wizard action present', await page.isVisible('text=Re-run setup wizard'))

// ---- Dark mode ------------------------------------------------------------------
await page.keyboard.press('Control+Shift+d')
await page.waitForTimeout(350)
const dark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
check('dark mode toggles', dark)
await page.goto(`${BASE}`, { waitUntil: 'networkidle' })
await page.waitForSelector('#splash', { state: 'detached', timeout: 15000 }).catch(() => {})
await page.waitForTimeout(400)
const darkPersist = await page.evaluate(() => document.documentElement.classList.contains('dark'))
check('dark persists across reload', darkPersist)
await page.screenshot({ path: `${OUT}/11-dark-settings.png`, fullPage: false })

// setupCompleted persisted?
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('#splash', { state: 'detached', timeout: 15000 }).catch(() => {})
await page.waitForTimeout(400)
check('onboarding does not reappear after reload', !(await page.isVisible('text=Welcome to Notely')))

check('no console errors', errors.length === 0, errors.slice(0, 3).join(' | '))

await browser.close()
console.log(failures === 0 ? '\nALL VISUAL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
