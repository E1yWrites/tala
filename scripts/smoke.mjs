/* Smoke test: boots the built app in headless Chromium and exercises core flows.
 * Run: node scripts/smoke.mjs  (requires `npm run preview` running on :4173) */
import { chromium } from 'playwright-core'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173'
let failures = 0

function check(name, ok, extra = '') {
  const tag = ok ? 'PASS' : 'FAIL'
  if (!ok) failures++
  console.log(`${tag}  ${name}${extra ? ` — ${extra}` : ''}`)
}

const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (err) => {
  failures++
  console.log('FAIL  page error —', err.message)
})
page.on('console', (msg) => {
  if (msg.type() === 'error' && !msg.text().includes('favicon')) {
    console.log('WARN  console.error:', msg.text())
  }
})

// ---- Boot ------------------------------------------------------------------
await page.goto(BASE, { waitUntil: 'networkidle' })
await page.waitForSelector('#splash', { state: 'detached', timeout: 15000 }).catch(() => {})
check('splash dismissed after boot', !(await page.$('#splash')))

// Sidebar should list seeded folders
await page.waitForSelector('text=School', { timeout: 10000 }).catch(() => {})
const folderVisible = await page.isVisible('text=School')
check('seeded folders visible in sidebar', folderVisible)

// Dashboard greeting
const dashOk = await page.isVisible('text=Good')
check('home dashboard renders greeting', dashOk)

// ---- Open a seeded note ----------------------------------------------------
await page.click('text=All Notes')
await page.waitForTimeout(300)
await page.waitForSelector('[role="button"]:has-text("Lecture")', { timeout: 5000 }).catch(() => {})
const rows = page.locator('aside [role="button"], [role="list"] [role="button"]')
const rowCount = await rows.count()
check('note list has seeded rows', rowCount > 0, `${rowCount} rows`)
if (rowCount > 0) await rows.first().click()
await page.waitForTimeout(600)
check('note opens in editor', await page.isVisible('.ProseMirror'))

// ---- Type into the editor ---------------------------------------------------
await page.click('.ProseMirror')
await page.keyboard.type(' SMOKE-TEST-EDIT')
await page.waitForTimeout(900) // debounce + save

// ---- Create a new note via template modal -----------------------------------
await page.click('button[aria-label="New note"]').catch(() => {})
await page.waitForTimeout(400)
const modalOpen = await page.isVisible('text=Blank note')
check('new-note modal opens', modalOpen)
if (modalOpen) {
  await page.click('text=To-Do List')
  await waitFor(500)
  check('template created note with checklist', await page.isVisible('.ProseMirror ul[data-type="taskList"]'))
}
await waitFor(700)

// ---- Command palette ---------------------------------------------------------
await page.keyboard.press('Control+Shift+p')
await waitFor(400)
check('command palette opens', await page.isVisible('input[aria-label="Command palette"]'))
await page.fill('input[aria-label="Command palette"]', 'trash')
await waitFor(250)
await page.keyboard.press('Enter') // Go to Trash
await waitFor(400)
check('palette navigates to Trash', await page.isVisible('text=Trash'))

// ---- Search modal -------------------------------------------------------------
await page.keyboard.press('Control+k')
await waitFor(400)
await page.fill('input[aria-label="Search notes"]', 'merge sort')
await waitFor(450)
const searchHit = await page.locator('[role="listbox"] button').count()
check('search finds "merge sort" in body text', searchHit > 0, `${searchHit} hits`)
await page.keyboard.press('Escape')

// ---- Reload → persistence -----------------------------------------------------
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('#splash', { state: 'detached', timeout: 15000 }).catch(() => {})
await page.click('text=All Notes').catch(() => {})
await waitFor(600)
await page.keyboard.press('Control+k')
await waitFor(400)
await page.fill('input[aria-label="Search notes"]', 'smoke test edit')
await waitFor(450)
const persistedHits = await page.locator('[role="listbox"] button').count()
check('edits persist across reload (IndexedDB)', persistedHits > 0, `${persistedHits} hits`)
// open the persisted note and confirm editor shows it
if (persistedHits > 0) {
  await page.keyboard.press('Enter')
  await waitFor(500)
  check('reopened note contains edit in editor', (await page.textContent('.ProseMirror'))?.includes('SMOKE-TEST-EDIT') ?? false)
}

// ---- Dark mode ---------------------------------------------------------------
const wasDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
await page.keyboard.press('Control+Shift+d')
await waitFor(300)
let nowDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
check('Ctrl+Shift+D toggles dark mode', nowDark !== wasDark)
await page.reload({ waitUntil: 'networkidle' })
await page.waitForSelector('#splash', { state: 'detached', timeout: 15000 }).catch(() => {})
nowDark = await page.evaluate(() => document.documentElement.classList.contains('dark'))
check('theme choice persists after reload', nowDark === !wasDark)
// restore
await page.keyboard.press('Control+Shift+d')
await waitFor(200)

// ---- Mobile layout -------------------------------------------------------------
const mobile = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
})
const mpage = await mobile.newPage()
mpage.on('pageerror', (err) => {
  failures++
  console.log('FAIL  mobile page error —', err.message)
})
await mpage.goto(BASE, { waitUntil: 'networkidle' })
await mpage.waitForSelector('#splash', { state: 'detached', timeout: 15000 }).catch(() => {})
await waitFor(400)

check('mobile: bottom nav visible', await mpage.isVisible('nav[aria-label="Primary"]'))
check('mobile: sidebar not docked', !(await mpage.isVisible('text=Quick actions')))

// Drawer opens from the list header hamburger
await mpage.click('nav[aria-label="Primary"] >> text=Notes')
await waitFor(350)
await mpage.click('[aria-label="Open navigation"]')
await waitFor(350)
check('mobile: drawer shows folders', await mpage.isVisible('text=School'))
await mpage.keyboard.press('Escape')
await waitFor(250)
check('mobile: Esc closes drawer', !(await mpage.isVisible('text=Quick actions')))

// Note opens fullscreen; bottom nav hides
await mpage.waitForTimeout(300)
const mrows = mpage.locator('[role="button"]:has-text("Lecture")')
if ((await mrows.count()) > 0) await mrows.first().click()
await waitFor(500)
check('mobile: editor opens fullscreen', await mpage.isVisible('.ProseMirror'))
check('mobile: bottom nav hidden in editor', !(await mpage.isVisible('nav[aria-label="Primary"]')))
await mpage.click('[aria-label="Back to list"]')
await waitFor(300)
check('mobile: back returns to list + nav', await mpage.isVisible('nav[aria-label="Primary"]'))
await mobile.close()

async function waitFor(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

await browser.close()
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
