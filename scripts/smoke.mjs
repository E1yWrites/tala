/* Smoke test: boots the built app in headless Chromium and exercises core flows.
 * Self-contained: walks onboarding and creates its own content on fresh profiles.
 * Run: node scripts/smoke.mjs  (requires `npm run preview` running on :4173)
 * Headless-shell needs: LD_LIBRARY_PATH=/tmp/opencode/nssroot/usr/lib/x86_64-linux-gnu */
import { chromium } from 'playwright-core'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173'
let failures = 0

function check(name, ok, extra = '') {
  const tag = ok ? 'PASS' : 'FAIL'
  if (!ok) failures++
  console.log(`${tag}  ${name}${extra ? ` — ${extra}` : ''}`)
}

async function waitFor(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

/** Fresh IndexedDB lands on the onboarding wizard — walk it through. */
async function completeOnboarding(p) {
  const getStarted = p.locator('button:has-text("Get Started")')
  if (!(await getStarted.count())) return true
  await getStarted.click()
  await waitFor(400)
  await p.fill('input', 'Smoke Tester').catch(() => {})
  await p.click('button:has-text("Continue")')
  await waitFor(500)
  const skip = p.locator('button:has-text("Skip")')
  if (await skip.count()) await skip.first().click()
  await waitFor(400)
  await p.click('button:has-text("Start Using Notely")').catch(() => {})
  await waitFor(600)
  return !(await p.isVisible('text=Get Started'))
}

/** Creates a blank note from the list panel and returns once editor is up.
 *  Works on desktop (sidebar link) and mobile (bottom nav). */
async function createBlankNote(p) {
  const navNotes = p.locator('nav[aria-label="Primary"] >> text=Notes')
  if (await navNotes.count()) {
    await navNotes.click()
    await waitFor(350)
  } else {
    await p.click('text=All Notes').catch(() => {})
    await waitFor(300)
  }
  await p.click('button[aria-label="New note"]').catch(() => {})
  await waitFor(400)
  const modalOpen = await p.isVisible('text=Blank note')
  const card = p.locator('text=Blank note').first()
  if (!modalOpen) return false
  await card.scrollIntoViewIfNeeded().catch(() => {})
  await card.click()
  await waitFor(700)
  return p.isVisible('.ProseMirror')
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
check('onboarding completes on fresh profile', await completeOnboarding(page))

// ---- Baseline content --------------------------------------------------------
check('blank note opens in editor', await createBlankNote(page))
await page.click('.ProseMirror')
await page.keyboard.type('Notes on merge sort. SMOKE-TEST-EDIT')
await waitFor(900) // debounce + save

// ---- Second note via template modal ------------------------------------------
await page.click('button[aria-label="New note"]').catch(() => {})
await waitFor(400)
const modalOpen = await page.isVisible('text=Blank note')
check('new-note modal opens again', modalOpen)
if (modalOpen) {
  await page.click('text=To-Do List')
  await waitFor(500)
  check('template created note with checklist', await page.isVisible('.ProseMirror ul[data-type="taskList"]'))
}

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

check('mobile: onboarding completes', await completeOnboarding(mpage))
check('mobile: bottom nav visible', await mpage.isVisible('nav[aria-label="Primary"]'))

// Drawer opens from the list header hamburger
await mpage.click('nav[aria-label="Primary"] >> text=Notes')
await waitFor(350)
await mpage.click('[aria-label="Open navigation"]')
await waitFor(350)
const drawer = mpage.locator('[role="dialog"][aria-label="Navigation"]')
check('mobile: navigation drawer opens', await drawer.isVisible())
await mpage.keyboard.press('Escape')
await waitFor(250)
check('mobile: Esc closes drawer', (await drawer.count()) === 0 || !(await drawer.isVisible()))

// Note opens fullscreen; bottom nav hides
if (await createBlankNote(mpage)) {
  check('mobile: editor opens fullscreen', await mpage.isVisible('.ProseMirror'))
  check('mobile: bottom nav hidden in editor', !(await mpage.isVisible('nav[aria-label="Primary"]')))
  await mpage.click('[aria-label="Back to list"]').catch(() => {})
  await waitFor(300)
  check('mobile: back returns to list + nav', await mpage.isVisible('nav[aria-label="Primary"]'))
} else {
  failures++
  console.log('FAIL  mobile: could not create a note')
}
await mobile.close()

await browser.close()
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
