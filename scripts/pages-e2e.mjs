/* End-to-end for pages, PDFs, backups, tasks and Bituin: per-page typed text,
 * PDF import and on-demand render (also offline), a .tala backup round trip that
 * carries the PDF, continuous scroll (pages mount near the screen, insert between
 * pages, reopen where you left off), the Tasks view, the journal (quick capture, entry chips,
 * suggestions), Today/Upcoming, Money (balances, set balance, accounts, transfers), Habits, Workouts, ink tools (zoom, wet ink, lasso and lasso-to-entry, page strip, PDF
 * export), lecture audio (chunks on disk, stroke timestamps, replay, crash recovery)
 * and the backup nudge (snooze, Quiet mode).
 * Run: node scripts/pages-e2e.mjs  (requires `npm run preview` running on :4173)
 * Headless-shell needs: LD_LIBRARY_PATH=/tmp/opencode/nssroot/usr/lib/x86_64-linux-gnu */
import { chromium } from 'playwright-core'
import JSZip from 'jszip'
import { PDFDocument } from '@cantoo/pdf-lib'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.SMOKE_URL ?? 'http://localhost:4173'
let failures = 0
const check = (name, ok, extra = '') => {
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`)
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

/** A tiny valid PDF: one line of text per page. */
function makePdf(texts) {
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>']
  const kids = texts.map((_, i) => `${4 + i * 2} 0 R`).join(' ')
  objs.push(`<< /Type /Pages /Kids [${kids}] /Count ${texts.length} >>`)
  objs.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>')
  texts.forEach((t, i) => {
    objs.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`,
    )
    const body = `BT /F1 48 Tf 60 600 Td (${t}) Tj ET`
    objs.push(`<< /Length ${body.length} >>\nstream\n${body}\nendstream`)
  })
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => {
    offsets.push(out.length)
    out += `${i + 1} 0 obj\n${o}\nendobj\n`
  })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

async function onboard(p) {
  const start = p.locator('button:has-text("Get Started")')
  if (!(await start.count())) return
  await start.click()
  await wait(400)
  await p.fill('input', 'E2E Tester').catch(() => {})
  await p.click('button:has-text("Continue")')
  await wait(500)
  const skip = p.locator('button:has-text("Skip")')
  if (await skip.count()) await skip.first().click()
  await wait(400)
  // Phones and tablets in a browser tab get a Home Screen step before the end
  if (await p.isVisible('h1:has-text("Add Tala to your Home Screen")')) {
    onboard.sawSafetyStep = true
    await p.click('button:has-text("Continue")')
    await wait(300)
  }
  await p.click('button:has-text("Start Using Tala")').catch(() => {})
  await wait(600)
}

const ready = async (p) => {
  await p.waitForSelector('#splash', { state: 'detached', timeout: 15000 }).catch(() => {})
}
const newNote = async (p) => {
  await p.click('text=All Notes').catch(() => {})
  await wait(300)
  await p.click('button[aria-label="New note"]:visible')
  await wait(400)
}
const editorText = async (p) => (await p.textContent('.ProseMirror')) ?? ''
/** Every page sits in one scroll; these reach page `i` (0-based). */
const pageSlot = (p, i) => p.locator('[data-page-id]').nth(i)
const pageText = async (p, i) => (await pageSlot(p, i).locator('.ProseMirror').textContent()) ?? ''
const counter = (p) => p.textContent('[role="group"][aria-label="Page"] .sr-only')
const searchHits = async (p, q) => {
  await p.keyboard.press('Control+k')
  await wait(350)
  await p.fill('input[aria-label="Search notes"]', q)
  await wait(450)
  const n = await p.locator('[role="listbox"] button').count()
  return n
}
/** Opens the first search hit for `q`. */
const openFromSearch = async (p, q) => {
  const n = await searchHits(p, q)
  if (n > 0) await p.keyboard.press('Enter')
  await wait(600)
  return n
}
/** True when the `i`th mounted PDF canvas has any dark (text) pixel. */
const canvasHasInk = (p, i = 0) =>
  p.evaluate((i) => {
    const c = document.querySelectorAll('canvas[role="img"]')[i]
    if (!c || c.width === 0) return false
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] < 100 && d[i + 1] < 100) return true
    return false
  }, i)

// A fake microphone, so lecture recording runs for real in headless Chromium
const browser = await chromium.launch({
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
})
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ['microphone'] })
const page = await ctx.newPage()
page.on('pageerror', (err) => {
  failures++
  console.log('FAIL  page error —', err.message)
})

await page.goto(BASE, { waitUntil: 'networkidle' })
await ready(page)
await onboard(page)

/* ---- 1. Each page owns its text -------------------------------------------- */
await newNote(page)
await page.locator('text=Blank note').first().click()
await wait(700)
await page.click('.ProseMirror')
await page.keyboard.type('PAGEONE-ALPHA')
await wait(900)
await page.locator('button:has-text("Add page")').first().click()
await wait(500)
check('new page starts empty, below page 1 in the same scroll', (await page.locator('[data-page-id]').count()) === 2 && !(await pageText(page, 1)).includes('PAGEONE-ALPHA'))
check('Add page scrolls to the new page', (await counter(page)) === 'Page 2 of 2', await counter(page))
await pageSlot(page, 1).locator('.ProseMirror').click()
await page.keyboard.type('PAGETWO-BETA')
await wait(900)
const textTops = await page.evaluate(() =>
  [...document.querySelectorAll('[data-page-id]')].map((el) => Math.round(el.querySelector('.ProseMirror').getBoundingClientRect().top - el.getBoundingClientRect().top)),
)
check('typed text starts at the same height on every page (where its ink was drawn)', textTops[0] === textTops[1], JSON.stringify(textTops))
const shownToolbars = await page.evaluate(() => [...document.querySelectorAll('[data-toolbar]')].filter((el) => getComputedStyle(el).visibility === 'visible').length)
check('one formatting toolbar on screen at a time', shownToolbars === 1, `${shownToolbars}`)
await page.click('button[aria-label="Previous page"]')
await wait(500)
let t = await pageText(page, 0)
check('page 1 keeps only its own text', t.includes('PAGEONE-ALPHA') && !t.includes('PAGETWO-BETA'))

await page.reload({ waitUntil: 'networkidle' })
await ready(page)
check('search finds text typed on page 2', (await openFromSearch(page, 'pagetwo-beta')) > 0)
t = await editorText(page)
check('reopened note shows page 1', t.includes('PAGEONE-ALPHA'))
await page.click('button[aria-label="Next page"]')
await wait(400)
check('page 2 text survives reload', (await pageText(page, 1)).includes('PAGETWO-BETA'))

/* ---- 2. PDF import, render on demand, offline ------------------------------- */
await newNote(page)
const pdf = makePdf(['QUARTZ-LECTURE-ONE', 'QUARTZ-LECTURE-TWO'])
await page.setInputFiles('input[type="file"][accept*="pdf"]', { name: 'lecture.pdf', mimeType: 'application/pdf', buffer: pdf })
await page.waitForSelector('canvas[role="img"]', { timeout: 20000 }).catch(() => {})
await wait(1200)
check('PDF note opens with a rendered page', await page.isVisible('canvas[role="img"]'))
check('PDF page 1 has visible text pixels', await canvasHasInk(page))
check('PDF note lists 2 pages', (await page.textContent('body'))?.includes('Page 1 of 2') ?? false)
await page.click('button[aria-label="Next page"]')
await wait(1000)
check('PDF page 2 renders', await canvasHasInk(page, 1))
await page.click('button:has-text("Pages")')
await wait(1500)
check('PDF pages get real thumbnails in the strip', (await page.locator('[aria-label="Pages"] img').count()) === 2)
await page.click('button:has-text("Pages")')
await wait(400)
check('PDF text layer is searchable', (await searchHits(page, 'quartz-lecture-two')) > 0)
await page.keyboard.press('Escape')

/* ---- 2b. Continuous scroll: a long PDF, pages added in between ----------------- */
await newNote(page)
await page.setInputFiles('input[type="file"][accept*="pdf"]', {
  name: 'long.pdf',
  mimeType: 'application/pdf',
  buffer: makePdf(Array.from({ length: 8 }, (_, i) => `LONG-SLIDE-${i + 1}`)),
})
await page.waitForSelector('canvas[role="img"]', { timeout: 20000 }).catch(() => {})
await wait(1200)
const mounted = () => page.evaluate(() => document.querySelectorAll('canvas[role="img"]').length)
check('only pages near the screen are rendered', (await page.locator('[data-page-id]').count()) === 8 && (await mounted()) <= 5, `${await mounted()} of 8`)
await page.evaluate(() => {
  const sc = document.querySelector('.editor-scroll')
  sc.scrollTop = sc.scrollHeight
})
await wait(800)
check('scrolling to the end shows the last page', (await counter(page)) === 'Page 8 of 8' && (await canvasHasInk(page, (await mounted()) - 1)), await counter(page))
await page.click('button[aria-label="Previous page"]')
await page.click('button[aria-label="Previous page"]')
await wait(500)
check('Previous scrolls to the page above', (await counter(page)) === 'Page 6 of 8', await counter(page))
await page.click('button[aria-label="Insert a page after page 6"]')
await wait(700)
const inserted = await page.evaluate(() => {
  const slot = document.querySelectorAll('[data-page-id]')[6]
  return { typed: !!slot?.querySelector('.ProseMirror'), slots: document.querySelectorAll('[data-page-id]').length }
})
check('"+" inserts a blank page between PDF pages and scrolls to it', inserted.typed && inserted.slots === 9 && (await counter(page)) === 'Page 7 of 9', `${JSON.stringify(inserted)} ${await counter(page)}`)
await pageSlot(page, 6).locator('.ProseMirror').click()
await page.keyboard.type('BETWEEN-SLIDES')
await wait(900)
await openFromSearch(page, 'pagetwo-beta') // another note, so this one really closes
await openFromSearch(page, 'long-slide-1')
await wait(900)
check('a note reopens on the page you left it at', (await counter(page)) === 'Page 7 of 9' && (await pageText(page, 6)).includes('BETWEEN-SLIDES'), await counter(page))

// Service worker must hold the pdf.js worker, then PDF import works with no network
await page.evaluate(() => navigator.serviceWorker.ready)
await wait(2500)
await ctx.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {})
await ready(page)
await wait(800)
check('PDF note opens offline', (await openFromSearch(page, 'quartz-lecture')) > 0)
await wait(1200)
check('PDF page renders offline (worker served from cache)', (await canvasHasInk(page)))
await newNote(page)
await page.setInputFiles('input[type="file"][accept*="pdf"]', {
  name: 'offline.pdf',
  mimeType: 'application/pdf',
  buffer: makePdf(['OFFLINE-IMPORT']),
})
await wait(2500)
check('PDF import works offline', (await searchHits(page, 'offline-import')) > 0)
await page.keyboard.press('Escape')
await ctx.setOffline(false)

/* ---- 3. Backup round trip carries the PDF ----------------------------------- */
await page.keyboard.press('Control+Shift+p')
await wait(300)
await page.fill('input[aria-label="Command palette"]', 'settings')
await wait(250)
await page.keyboard.press('Enter')
await wait(500)
const [download] = await Promise.all([page.waitForEvent('download'), page.click('button:has-text("Export .tala")')])
const file = join(tmpdir(), `tala-e2e-${process.pid}.tala`) // importBackupFile keys off the .tala extension
await download.saveAs(file)
const zip = await JSZip.loadAsync(await readFile(file))
const names = Object.keys(zip.files)
check('backup is a .tala zip with blobs', names.includes('backup.json') && names.some((n) => n.startsWith('blobs/') && !n.endsWith('/')), `${names.length} entries`)
const backup = JSON.parse(await zip.file('backup.json').async('string'))
check('backup is v3 with pdf rows', backup.version === 3 && backup.pdfs.length === 3 && backup.pages.some((p) => p.pdfPage === 2))

await page.setInputFiles('input[type="file"][accept*=".tala"]', file)
await wait(500)
await page.click('button:has-text("Replace everything")')
await wait(1500)
await page.click('text=All Notes').catch(() => {})
check('restore brings the PDF note back', (await openFromSearch(page, 'quartz-lecture')) > 0)
await wait(1200)
check('restored PDF renders from the restored blob', await canvasHasInk(page))


/* ---- 4. A v1.0.0-style export (inline ink, text on the note) still imports --- */
const legacy = {
  app: 'tala',
  version: 1,
  exportedAt: 1,
  settings: null,
  folders: [],
  tags: [],
  notes: [
    {
      id: 'legacy-1',
      title: 'Legacy lecture',
      content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'LEGACY-TEXT-V1' }] }] },
      ink: {
        v: 1,
        width: 700,
        height: 400,
        strokes: [{ id: 's1', tool: 'pen', color: '#2563eb', size: 4, points: [{ x: 10, y: 10 }, { x: 200, y: 80 }, { x: 300, y: 30 }] }],
      },
      folderId: null,
      tagIds: [],
      isPinned: false,
      isFavorite: false,
      isArchived: false,
      isDeleted: false,
      deletedAt: null,
      createdAt: 1,
      updatedAt: 2,
    },
  ],
}
await page.keyboard.press('Control+Shift+p')
await wait(300)
await page.fill('input[aria-label="Command palette"]', 'settings')
await wait(250)
await page.keyboard.press('Enter')
await wait(500)
await page.setInputFiles('input[type="file"][accept*=".json"]', {
  name: 'v1-export.json',
  mimeType: 'application/json',
  buffer: Buffer.from(JSON.stringify(legacy)),
})
await wait(400)
await page.click('button:has-text("Merge into library")')
await wait(1500)
await page.click('text=All Notes').catch(() => {})
check('legacy note is searchable', (await openFromSearch(page, 'legacy-text-v1')) > 0)
check('legacy text lands on page 1', (await editorText(page)).includes('LEGACY-TEXT-V1'))
const legacyInk = await page.evaluate(
  () =>
    new Promise((res) => {
      const r = indexedDB.open('tala')
      r.onsuccess = () => {
        const q = r.result.transaction('inkDocs').objectStore('inkDocs').get('legacy-1')
        q.onsuccess = () => res(q.result?.doc?.strokes?.length ?? 0)
      }
    }),
)
check('legacy ink is kept under page 1 (id === note id)', legacyInk === 1)

/* ---- 5. Upgrading a real v3 (pages-build) database in the browser ------------ */
const old = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const op = await old.newPage()
op.on('pageerror', (err) => {
  failures++
  console.log('FAIL  page error —', err.message)
})
// A static same-origin URL: lets us write IndexedDB before the app ever opens it
await op.goto(`${BASE}/manifest.webmanifest`)
await op.evaluate(
  () =>
    new Promise((resolve, reject) => {
      const req = indexedDB.open('tala', 30) // Dexie stores version n as n * 10
      req.onupgradeneeded = () => {
        const db = req.result
        const mk = (name, key, idx = []) => {
          const st = db.createObjectStore(name, { keyPath: key })
          for (const [n, kp] of idx) st.createIndex(n, kp)
          return st
        }
        mk('notes', 'id', [['folderId', 'folderId'], ['updatedAt', 'updatedAt'], ['isDeleted', 'isDeleted']])
        mk('folders', 'id', [['name', 'name'], ['parentId', 'parentId']])
        mk('tags', 'id', [['name', 'name']])
        mk('settings', 'key')
        mk('inkDocs', 'noteId')
        mk('pages', 'id', [['noteId', 'noteId'], ['[noteId+index]', ['noteId', 'index']]])
        mk('pdfs', 'noteId')
      }
      req.onerror = () => reject(req.error)
      req.onsuccess = () => {
        const db = req.result
        const tx = db.transaction(['notes', 'pages', 'inkDocs'], 'readwrite')
        const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
        tx.objectStore('notes').put({
          id: 'v3-note', title: 'Upgraded v3 note',
          content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'V3-UPGRADE-TEXT' }] }] },
          ink: null, folderId: null, tagIds: [], isPinned: false, isFavorite: false, isArchived: false,
          isDeleted: false, deletedAt: null, createdAt: 1, updatedAt: 2,
        })
        tx.objectStore('pages').put({ id: 'v3-note', noteId: 'v3-note', index: 0, template: 'blank', createdAt: 1, updatedAt: 1 })
        tx.objectStore('pages').put({ id: 'v3-p2', noteId: 'v3-note', index: 1, template: 'blank', background: png, createdAt: 1, updatedAt: 1 })
        tx.objectStore('inkDocs').put({
          noteId: 'v3-p2',
          doc: { v: 1, width: 700, height: 300, strokes: [{ id: 's', tool: 'pen', color: '#2563eb', size: 4, points: [{ x: 5, y: 5 }, { x: 90, y: 40 }] }] },
        })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    }),
)
await op.goto(BASE, { waitUntil: 'networkidle' })
await ready(op)
await onboard(op)
await op.click('text=All Notes').catch(() => {})
check('v3 note survives the v4 upgrade', (await openFromSearch(op, 'v3-upgrade-text')) > 0)
check('v3 text now lives on page 1', (await editorText(op)).includes('V3-UPGRADE-TEXT'))
await op.click('button[aria-label="Next page"]')
await wait(800)
const bgOk = await op.evaluate(() => {
  const img = document.querySelector('img[alt^="Page 2"]')
  return !!img && img.naturalWidth > 0
})
check('v3 data-URL background became a blob and still shows', bgOk)
const safety = await op.evaluate(
  () =>
    new Promise((res) => {
      const r = indexedDB.open('tala-safety')
      r.onerror = () => res(null)
      r.onsuccess = () => {
        const db = r.result
        if (!db.objectStoreNames.contains('copies')) return res(null)
        const q = db.transaction('copies').objectStore('copies').get('pre-v4')
        q.onsuccess = () => res(q.result ? { bytes: q.result.zip.size, boots: q.result.boots } : null)
      }
    }),
)
check('a pre-upgrade safety copy was kept', !!safety && safety.bytes > 100, JSON.stringify(safety))
await old.close()

/* ---- 6. Tasks view: tick a task from the list, see it ticked in the note ------ */
await newNote(page)
await page.locator('text=Blank note').first().click()
await wait(600)
await page.click('.ProseMirror')
await page.keyboard.type('[ ] TASK-ALPHA')
await page.keyboard.press('Enter')
await page.keyboard.type('TASK-BETA')
await wait(900)
await page.click('nav >> text=Tasks')
await wait(500)
check('Tasks view lists checklist items from notes', (await page.locator('section[aria-label="Tasks"] >> text=TASK-ALPHA').count()) > 0)
await page.click('section[aria-label="Tasks"] button[role="checkbox"][aria-label*="TASK-ALPHA"]')
await wait(500)
check('ticked task moves to Done', (await page.locator('section[aria-label="Tasks"] >> text=Done (').count()) > 0)
await page.click('section[aria-label="Tasks"] >> text=Done (')
await page.click('section[aria-label="Tasks"] button:has-text("TASK-ALPHA")')
await wait(700)
check('the note shows the task ticked', (await page.locator('.ProseMirror li[data-checked="true"]').count()) > 0)

/* ---- 6a. Pagtatala: quick capture writes today's journal page; lines become entries -- */
await page.click('nav >> text=Tasks')
await wait(500)
const capture = 'input[aria-label="Write a line in today’s journal page"]'
await page.fill(capture, 'P150 lunch gcash')
check('capture previews what the line becomes', ((await page.locator('form .entry-chip-money').textContent()) ?? '').includes('₱150'))
await page.keyboard.press('Enter')
await wait(400)
await page.fill(capture, '[ ] JOURNAL-TASK due fri')
await page.keyboard.press('Enter')
await wait(600)
check('a captured task shows in Tasks', (await page.locator('section[aria-label="Tasks"] >> text=JOURNAL-TASK').count()) > 0)
await page.click('[data-sonner-toast][data-front="true"] button:has-text("Open")')
await wait(900)
const month = await page.evaluate(() => new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date()))
check('the journal is this month’s note', (await page.locator(`text=${month}`).count()) > 0, month)
check('captured lines carry their chips', (await page.locator('.ProseMirror .entry-chip-money').count()) === 1 && (await page.locator('.ProseMirror .entry-chip-task').count()) === 1)
check('entry lines are pinned to their day', (await page.locator('.ProseMirror p[data-at]').count()) >= 2)
await page.locator('.ProseMirror').last().click()
await page.keyboard.press('Control+End')
await page.keyboard.press('Enter')
await page.keyboard.type('85 jeep')
await wait(400)
check('an unmarked look-alike gets a suggestion on a journal page', (await page.locator('.ProseMirror .entry-chip-suggest').count()) === 1)
await page.click('.ProseMirror .entry-chip-suggest')
await wait(400)
check('accepting the suggestion marks the line', (await editorText(page)).includes('P85 jeep') && (await page.locator('.ProseMirror .entry-chip-money').count()) === 2)
await newNote(page)
await page.locator('text=Blank note').first().click()
await wait(600)
await page.click('.ProseMirror')
await page.keyboard.type('150 students attended')
await page.keyboard.press('Enter')
await page.keyboard.type('@ fri 2pm dentist')
await wait(500)
check('ordinary notes get no suggestions', (await page.locator('.ProseMirror .entry-chip-suggest').count()) === 0)
check('a marked event line gets its chip anywhere', (await page.locator('.ProseMirror .entry-chip-event').count()) === 1)

/* ---- 6a2. Agenda: Today and Upcoming read the lines; Skip and Done write lines -- */
await page.click('nav >> text=Today')
await wait(400)
for (const l of ['@ 11:59pm AGENDA-LATE !30m', '@ daily 6am AGENDA-GYM', '@ AGENDA-HAIRCUT every ~1d kahapon']) {
  await page.fill(capture, l)
  await page.keyboard.press('Enter')
  await wait(250)
}
await wait(600)
const today = page.locator('section[aria-label="Today"]')
check('Today lists what the lines put on today', (await today.locator('text=AGENDA-LATE').count()) === 1 && (await today.locator('text=AGENDA-GYM').count()) === 1)
check('a due-again item done yesterday, every day, is due today', ((await today.locator('li:has-text("AGENDA-HAIRCUT")').textContent()) ?? '').includes('due today'))
check('a reminder shows its bell', (await today.locator('li:has-text("AGENDA-LATE") [aria-label="reminder set"]').count()) === 1)
await page.click('nav >> text=Upcoming')
await wait(500)
const upcoming = page.locator('section[aria-label="Upcoming"]')
check('Upcoming repeats a daily line on every day', (await upcoming.locator('text=AGENDA-GYM').count()) === 14)
check('a due-again item waits in its own list', (await upcoming.locator('li:has-text("AGENDA-HAIRCUT")').count()) === 1)
await upcoming.locator('li:has-text("AGENDA-GYM") button:has-text("Skip")').nth(1).click()
await wait(900)
check('Skip writes "skip" into the line and drops that day', (await upcoming.locator('text=AGENDA-GYM').count()) === 13)
await upcoming.locator('button[aria-label="Done today: AGENDA-HAIRCUT"]').click()
await wait(900)
const haircut = ((await upcoming.locator('li:has-text("AGENDA-HAIRCUT")').textContent()) ?? '')
check('Done writes a tick and pushes the next due date out', !haircut.includes('due today') && haircut.includes('due '), haircut)
await page.click('[data-sonner-toast][data-front="true"] button:has-text("Open")').catch(() => {})
await upcoming.locator('li:has-text("AGENDA-GYM") button:not(:has-text("Skip"))').first().click()
await wait(900)
check('the journal holds the skip and the tick', /AGENDA-GYM skip \w{3} \d+/.test(await editorText(page)) && (await editorText(page)).includes('✓ AGENDA-HAIRCUT'))

/* ---- 6a3. Money: balances from the ₱ lines, set balance, a new account, safe to spend -- */
await page.click('nav >> text=Today')
await wait(400)
check('Today shows safe to spend once money lines exist', (await page.locator('section[aria-labelledby="home-money"] >> text=Safe to spend today').count()) === 1)
await page.click('nav >> text=Money')
await wait(500)
const money = page.locator('section[aria-label="Money"]')
const accountRow = (name) => money.locator(`section[aria-labelledby="money-accounts"] > ul > li:has-text("${name}")`).first()
const rowText = async (name) => (await accountRow(name).locator('button').first().textContent()) ?? ''
check('each account adds up its lines', (await rowText('GCash')).includes('−₱150') && (await rowText('Cash')).includes('−₱85'), `${await rowText('GCash')} | ${await rowText('Cash')}`)
check('spending is grouped by category', (await money.locator('section[aria-labelledby="money-month"] li:has-text("Food")').count()) === 1)
await accountRow('GCash').locator('button').first().click()
await money.locator('input[aria-label="What GCash has now"]').fill('1000')
await money.locator('button:has-text("Save")').click()
await wait(400)
check('"Has now" sets the balance', (await rowText('GCash')).includes('₱1,000'), await rowText('GCash'))
await money.locator('input[aria-label="New account name"]').fill('BPI Savings')
await page.keyboard.press('Enter')
await wait(300)
await page.fill(capture, 'P200 gcash>bpi')
check('a new account is a word lines can use', ((await page.locator('form .entry-chip-money').textContent()) ?? '').includes('BPI Savings'))
await page.keyboard.press('Enter')
await wait(900)
check('a transfer moves money between accounts', (await rowText('BPI Savings')).includes('₱200') && (await rowText('GCash')).includes('₱800'), `${await rowText('BPI Savings')} | ${await rowText('GCash')}`)
check('safe to spend shows today’s share', /a day until|over today’s share/.test((await money.textContent()) ?? ''))

/* ---- 6a4. Habits: Study first, Done writes ✓ lines, +1 counts up one line, Today lists what's left -- */
await page.click('nav >> text=Habits')
await wait(500)
const habitsView = page.locator('section[aria-label="Habits"]')
check('Study is habit #1', ((await habitsView.locator('section[aria-labelledby="habits-list"] li').first().textContent()) ?? '').includes('Study'))
const addHabitNamed = async (name, target) => {
  await habitsView.locator('button:has-text("Add a habit")').click()
  await habitsView.locator('input[aria-label="Habit name"]').last().fill(name)
  if (target) await habitsView.locator('input[aria-label="How many make a day done"]').last().fill(String(target))
  await habitsView.locator('button:has-text("Add habit")').click()
  await wait(300)
}
await addHabitNamed('water', 3)
await addHabitNamed('gym')
await habitsView.locator('button[aria-label^="water: one more"]').click()
await wait(700)
await habitsView.locator('button[aria-label^="water: one more"]').click()
await wait(700)
check('+1 counts up', ((await habitsView.locator('button[aria-label^="water: one more"]').textContent()) ?? '').includes('2/3'))
await page.click('nav >> text=Today')
await wait(400)
const homeHabits = page.locator('section[aria-labelledby="home-habits"]')
check('Today lists the habits still to do', (await homeHabits.locator('li:has-text("water")').count()) === 1 && (await homeHabits.locator('li:has-text("gym")').count()) === 1)
await homeHabits.locator('button[aria-label="gym: done today?"]').click()
await wait(700)
check('Done on Today takes it off the list', (await homeHabits.locator('li:has-text("gym")').count()) === 0)
await page.fill(capture, 'x water')
check('"x" ticks a habit by name', ((await page.locator('form .entry-chip-tick').textContent()) ?? '').includes('water'))
await page.keyboard.press('Enter')
await wait(800)
check('a typed tick completes the day', (await homeHabits.locator('text=All done for today').count()) === 1)
await page.click('[data-sonner-toast][data-front="true"] button:has-text("Open")')
await wait(900)
const journalText = await editorText(page)
check('the journal holds one counted line per habit', journalText.includes('✓ water 2') && journalText.includes('✓ gym') && journalText.includes('x water'), journalText.slice(-120))

/* ---- 6a5. Workouts: lift lines on journal pages, best e1RM, rest timer, Strong CSV -- */
await page.click('nav >> text=Workouts')
await wait(500)
const workouts = page.locator('section[aria-label="Workouts"]')
check('Workouts explains the lift line when there are none', (await workouts.locator('text=No lifts yet').count()) === 1)
await page.fill(capture, 'bench 60x5x3 @8')
check('a lift line previews as sets × reps', ((await page.locator('form .entry-chip-lift').textContent()) ?? '').startsWith('3×5 · 60kg · RPE 8'))
await page.keyboard.press('Enter')
await wait(800)
const benchRow = ((await workouts.locator('li:has-text("bench")').textContent()) ?? '')
check('the exercise shows its best estimated 1RM', benchRow.includes('74kg'), benchRow)
const [csvDownload] = await Promise.all([page.waitForEvent('download'), workouts.locator('button:has-text("Export for Strong")').click()])
const csvFile = join(tmpdir(), `tala-e2e-${process.pid}.csv`)
await csvDownload.saveAs(csvFile)
const csvRows = (await readFile(csvFile, 'utf8')).trim().split('\n')
check('the Strong CSV has one row per set', csvRows[0].startsWith('Date,Workout Name,') && csvRows.length === 4 && csvRows[3].includes(',bench,3,60,5,'), csvRows.join(' | '))
await rm(csvFile, { force: true })
await workouts.locator('button[aria-label="Rest 1:30"]').click()
await wait(1200)
check('the rest timer counts down', /^1:2\d$/.test(((await workouts.locator('[role="timer"]').textContent()) ?? '').trim()))
await workouts.locator('button:has-text("Stop")').click()
check('Stop ends it', (await workouts.locator('[role="timer"]').count()) === 0)
await page.click('[data-sonner-toast][data-front="true"] button:has-text("Open")')
await wait(900)
check('the journal line carries its lift chip', (await page.locator('.ProseMirror .entry-chip-lift').count()) === 1)

/* ---- 6b. Ink tools: zoom, wet ink, lasso, undo across pages, strip, PDF export -- */
await newNote(page)
await page.locator('text=Blank note').first().click()
await wait(700)
await page.click('.ProseMirror')
await page.keyboard.type('INK-EXPORT-TEXT')
await wait(900)
const columnTransform = () =>
  page.evaluate(() => document.querySelector('.editor-scroll').firstElementChild.firstElementChild.style.transform)
await page.click('button[aria-label="Zoom in"]')
await wait(300)
check('zoom in scales the page column', (await columnTransform()) === 'scale(1.25)')
await page.click('button[aria-label="Zoom in"]')
await page.click('button[aria-label="Zoom in"]')
await wait(250)
await page.click('button[aria-label="Fit page to width"]')
await wait(250)
check('"Fit" returns to 100%', (await columnTransform()) === '')
const wheelBox = await page.locator('.editor-scroll').boundingBox()
await page.mouse.move(wheelBox.x + 300, wheelBox.y + 300)
await page.keyboard.down('Control')
await page.mouse.wheel(0, -150)
await page.keyboard.up('Control')
await wait(250)
check('ctrl+wheel zooms like a trackpad pinch', (await columnTransform()).startsWith('scale('))
await page.click('button[aria-label="Fit page to width"]')
await wait(250)

// Ink is positioned from the column's top-left and scales with its width, so
// switching modes must not move or resize the text under it.
const textFrame = () =>
  page.evaluate(() => {
    const ink = document.querySelector('.ink-layer').getBoundingClientRect()
    const text = document.querySelector('.ProseMirror').getBoundingClientRect()
    return { dy: Math.round(text.top - ink.top), dx: Math.round(text.left - ink.left), w: Math.round(ink.width) }
  })
const typeFrame = await textFrame()
await page.click('button[aria-label="Write"]')
await wait(300)
const writeFrame = await textFrame()
check('Type and Write keep the text where the ink expects it', JSON.stringify(typeFrame) === JSON.stringify(writeFrame), `${JSON.stringify(typeFrame)} vs ${JSON.stringify(writeFrame)}`)
await page.click('button[aria-label="Zoom in"]')
await page.click('button[aria-label="Zoom in"]')
await wait(300)
const inkSvg = await page.locator('svg.ink-svg').boundingBox()
const sx = Math.max(inkSvg.x, wheelBox.x) + 120
const sy = wheelBox.y + 300
await page.mouse.move(sx, sy)
await page.mouse.down()
await page.mouse.move(sx + 100, sy + 50, { steps: 8 })
await wait(120)
const wetPixels = await page.evaluate(() => {
  const c = document.querySelector('.ink-layer canvas')
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
  return n
})
check('the stroke under the pen is painted on the wet canvas', wetPixels > 200, `${wetPixels}px`)
await page.mouse.up()
await wait(1200)
const wetAfter = await page.evaluate(() => {
  const c = document.querySelector('.ink-layer canvas')
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++
  return n
})
check('the wet canvas hands over to the committed SVG path', wetAfter === 0 && (await page.locator('svg.ink-svg path').count()) >= 1)
// iPadOS Scribble/selection/scroll must not claim the Pencil: stylus touches are cancelled, fingers are not
const touchPrevented = await page.evaluate(() => {
  const svg = document.querySelector('.ink-layer svg')
  const fire = (touchType) => {
    const t = new Touch({ identifier: 1, target: svg, clientX: 10, clientY: 10 })
    // Chromium has no Touch.touchType (WebKit only), so stamp it on as iPadOS would report it
    Object.defineProperty(t, 'touchType', { value: touchType })
    const e = new TouchEvent('touchstart', { touches: [t], changedTouches: [t], cancelable: true, bubbles: true })
    svg.dispatchEvent(e)
    return e.defaultPrevented
  }
  return { stylus: fire('stylus'), finger: fire('direct') }
})
check('a stylus touch on the ink layer is kept from the OS, a finger is not', touchPrevented.stylus && !touchPrevented.finger, JSON.stringify(touchPrevented))
const inkRows = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('tala')
        r.onsuccess = () => {
          const g = r.result.transaction('inkDocs').objectStore('inkDocs').getAll()
          g.onsuccess = () => res(g.result)
        }
      }),
  )
const firstDoc = (await inkRows()).find((r) => r.doc.strokes.length)?.doc
const dot = firstDoc?.strokes[0]?.points[0]
const wantX = ((sx - inkSvg.x) * firstDoc.width) / inkSvg.width
check('ink lands under the pen while zoomed in', !!dot && Math.abs(dot.x - wantX) < 3, `x=${dot?.x} want≈${wantX.toFixed(1)}`)
await page.click('button[aria-label="Fit page to width"]')
await wait(300)

// A second stroke, then lasso only the first
const svg1 = await page.locator('svg.ink-svg').boundingBox()
const ax = svg1.x + 150
const ay = wheelBox.y + 200
const draw = async (x, y, dx, dy) => {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 6 })
  await page.mouse.up()
  await wait(300)
}
await draw(ax, ay, 80, 40)
await draw(ax, ay + 110, 80, 30)
await wait(900)
const countStrokes = async () => (await inkRows()).reduce((n, r) => n + r.doc.strokes.length, 0)
const before = await countStrokes()
await page.keyboard.press('v')
await wait(200)
await page.mouse.move(ax - 20, ay - 25)
await page.mouse.down()
for (const [x, y] of [[ax + 100, ay - 25], [ax + 100, ay + 65], [ax - 20, ay + 65], [ax - 20, ay - 15]]) await page.mouse.move(x, y, { steps: 4 })
await page.mouse.up()
await wait(300)
check('lasso selects just the strokes inside the loop', (await page.locator('button[aria-label="Delete 1 selected stroke"]').count()) === 1)
await page.click('button[aria-label="Duplicate selection"]')
await wait(1000)
check('Duplicate adds a copy', (await countStrokes()) === before + 1)
await page.click('button[aria-label="Undo handwriting"]')
await wait(900)
check('Undo removes the copy', (await countStrokes()) === before)

// Lasso → Turn into: the handwriting becomes an expense without being read
await page.mouse.move(ax - 20, ay - 25)
await page.mouse.down()
for (const [x, y] of [[ax + 100, ay - 25], [ax + 100, ay + 65], [ax - 20, ay + 65], [ax - 20, ay - 15]]) await page.mouse.move(x, y, { steps: 4 })
await page.mouse.up()
await wait(300)
await page.click('button[aria-label="Turn selected handwriting into an entry"]')
await page.fill('input[aria-label="What it says"]', '85 jeep')
await page.click('button:has-text("Save")')
await wait(900)
check('a lassoed line becomes an entry, labelled beside it', ((await page.locator('svg.ink-svg text.ink-entry').first().textContent()) ?? '').includes('₱85'))
check('…and is stored on the ink doc', (await inkRows()).some((r) => r.doc.entries?.[0]?.line === 'P85 jeep'))

// Undo covers the whole note: a stroke on page 2 is undone from page 1
await page.click('button:has-text("Add page")')
await wait(600)
await page.keyboard.press('v') // back to the pen
const p2 = await pageSlot(page, 1).boundingBox()
await draw(p2.x + 150, p2.y + 260, 80, 30)
await wait(900)
const page2Id = await pageSlot(page, 1).getAttribute('data-page-id')
const strokesOn = async (id) => (await inkRows()).find((r) => r.noteId === id)?.doc.strokes.length ?? 0
check('a stroke lands on the page under the pen', (await strokesOn(page2Id)) === 1)
await page.click('button[aria-label="Previous page"]')
await wait(600)
await page.click('button[aria-label="Undo handwriting"]')
await wait(900)
check('Undo reaches a change on another page', (await strokesOn(page2Id)) === 0)

// Page strip: thumbnails and drag reorder
await page.click('button:has-text("Add page")')
await wait(400)
await page.click('button[aria-label="Type"]')
await pageSlot(page, 2).locator('.ProseMirror').click()
await page.keyboard.type('INK-PAGE-THREE')
await wait(900)
await page.click('button:has-text("Pages")')
await wait(900)
check('the page strip shows every page', (await page.locator('[aria-label="Pages"] button').count()) === 3)
check('a page with ink gets a thumbnail', (await page.locator('[aria-label="Pages"] img').count()) >= 1)
const cards = await page.locator('[aria-label="Pages"] button').all()
const last = await cards[2].boundingBox()
const first = await cards[0].boundingBox()
await page.mouse.move(last.x + 20, last.y + 30)
await page.mouse.down()
await page.mouse.move(first.x + 8, last.y + 30, { steps: 10 })
await page.mouse.up()
await wait(500)
check('dragging a card reorders the pages', (await page.locator('[aria-label="Pages"] button').first().textContent()).includes('INK-PAGE') || (await editorText(page)).includes('INK-PAGE-THREE'))
check('the page you are editing stays selected after a reorder', (await page.locator('[aria-label="Pages"] button[aria-current="page"]').count()) === 1)

// PDF export
await page.click('button[aria-label="Share & export"]')
await wait(500)
const pdfDownload = page.waitForEvent('download', { timeout: 20000 })
await page.click('button:has-text("PDF with handwriting")')
const pdfFile = await pdfDownload
const pdfPath = join(tmpdir(), `tala-e2e-export-${Date.now()}.pdf`)
await pdfFile.saveAs(pdfPath)
const exported = await PDFDocument.load(await readFile(pdfPath))
check('PDF export has one sheet per page', exported.getPageCount() >= 3, `${exported.getPageCount()} pages, ${pdfFile.suggestedFilename()}`)
await rm(pdfPath, { force: true })
await page.keyboard.press('Escape')
await wait(300)

/* ---- 6c. Lecture audio: record, write, replay, save, survive a crash ----------- */
await newNote(page)
await page.locator('text=Blank note').first().click()
await wait(700)
await page.click('.ProseMirror')
await page.keyboard.type('AUDIO-LECTURE-NOTE')
await wait(900)
const audioRows = () =>
  page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('tala')
        r.onsuccess = () => {
          const out = {}
          const t = r.result.transaction(['recordings', 'audioChunks', 'inkDocs'])
          t.objectStore('recordings').getAll().onsuccess = (e) => (out.rec = e.target.result)
          t.objectStore('audioChunks').count().onsuccess = (e) => (out.chunks = e.target.result)
          t.objectStore('inkDocs').getAll().onsuccess = (e) => (out.ink = e.target.result)
          t.oncomplete = () => res(out)
        }
      }),
  )
const lastRec = (r) => [...r.rec].sort((x, y) => x.startedAt - y.startedAt).at(-1)
await page.click('button[aria-label="Lecture audio"]')
await wait(400)
await page.click('button[aria-label="Start recording"]')
await wait(1500)
check('Stop shows while a lecture records', await page.locator('button[aria-label="Stop recording"]').isVisible())
await page.click('button[aria-label="Write"]')
await wait(300)
const audioSvg = await page.locator('svg.ink-svg').boundingBox()
const ax2 = Math.max(audioSvg.x, 700) + 100
const ay2 = 520
await page.mouse.move(ax2, ay2)
await page.mouse.down()
await page.mouse.move(ax2 + 90, ay2 + 30, { steps: 6 })
await page.mouse.up()
await wait(7500)
let audio = await audioRows()
check('a 5 s chunk is on disk while still recording', audio.chunks >= 1 && lastRec(audio).status === 'recording', `${audio.chunks} chunk(s)`)
check('handwriting written during a lecture carries a timestamp', audio.ink.some((r) => typeof r.doc.strokes[0]?.ts === 'number'))
await page.click('button[aria-label="Type"]')
await page.click('button[aria-label="Stop recording"]')
await wait(1500)
audio = await audioRows()
check('the lecture finishes complete with audio and a duration', lastRec(audio).status === 'complete' && audio.chunks >= 2 && lastRec(audio).durationMs > 7000, `${lastRec(audio).durationMs} ms ${lastRec(audio).mime}`)
await page.click('button[aria-label="Play"]')
await wait(1500)
check('Play shows a pause button and a scrubber', (await page.locator('button[aria-label="Pause"]').count()) === 1 && (await page.locator('input[aria-label="Playback position"]').count()) === 1)
await page.click('button[aria-label="Pause"]')
await page.click('button[aria-label="Write"]')
await page.keyboard.press('v')
await wait(200)
// the panel grows once the lecture is listed, which moves the page under the pen
const shiftY = (await page.locator('svg.ink-svg').boundingBox()).y - audioSvg.y
await page.mouse.move(ax2 + 45, ay2 + 15 + shiftY)
await page.mouse.down()
await page.mouse.up()
await wait(1500)
check('tapping the stroke with the lasso plays the lecture from then', (await page.locator('button[aria-label="Pause"]').count()) === 1)
await page.click('button[aria-label="Type"]')
const audioFile = page.waitForEvent('download', { timeout: 10000 })
await page.click('button[aria-label="Save audio file"]')
check('Save audio downloads the recording', /\.(webm|m4a|ogg)$/.test((await audioFile).suggestedFilename()))
await page.click('button[aria-label="Start recording"]')
await wait(6500)
await page.reload({ waitUntil: 'networkidle' }) // kills the recorder mid-lecture, like a crash
await ready(page)
const crashed = lastRec(await audioRows())
check('after a crash the lecture is interrupted but its audio is kept', crashed.status === 'interrupted' && crashed.chunkCount >= 1, `${crashed.chunkCount} chunk(s)`)
check('boot tells the owner about it', await page.locator('text=A recording was interrupted').first().waitFor({ timeout: 4000 }).then(() => true, () => false))

/* ---- 6d. Snap-to-shape: hold the pen still at the end of a stroke ------------------ */
await newNote(page)
await page.locator('text=Blank note').first().click()
await wait(700)
await page.click('button[aria-label="Write"]')
await wait(300)
const snapBox = await page.locator('svg.ink-svg').boundingBox()
const px = Math.max(snapBox.x, 480) + 140
const py = 330
let seed = 11
const jitter = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648
  return (seed / 2147483648 - 0.5) * 5
}
const strokeDocs = async () => {
  const rows = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('tala')
        r.onsuccess = () => {
          const g = r.result.transaction('inkDocs').objectStore('inkDocs').getAll()
          g.onsuccess = () => res(g.result)
        }
      }),
  )
  return rows.flatMap((r) => r.doc.strokes)
}
const drag = async (pts, holdMs) => {
  await page.mouse.move(pts[0].x, pts[0].y)
  await page.mouse.down()
  for (const q of pts.slice(1)) await page.mouse.move(q.x, q.y)
  if (holdMs) await wait(holdMs)
  await page.mouse.up()
  await wait(400)
}
const circle = (cx, cy, r) => Array.from({ length: 41 }, (_, i) => ({ x: cx + r * Math.cos((i / 40) * 2 * Math.PI) + jitter(), y: cy + r * Math.sin((i / 40) * 2 * Math.PI) + jitter() }))
const ringError = (pts, cx, cy) => {
  const rs = pts.map((q) => Math.hypot(q.x - cx, q.y - cy))
  const mean = rs.reduce((a, b) => a + b, 0) / rs.length
  return Math.max(...rs.map((r) => Math.abs(r - mean)))
}

const drawn = async (pts, holdMs) => {
  const known = new Set((await strokeDocs()).map((st) => st.id))
  await drag(pts, holdMs)
  await wait(900)
  return (await strokeDocs()).find((st) => !known.has(st.id))?.points ?? []
}
const centre = (pts) => {
  const xs = pts.map((q) => q.x)
  const ys = pts.map((q) => q.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

const snappedCircle = await drawn(circle(px, py, 60), 900)
const sc = centre(snappedCircle)
check('holding the pen still turns a rough circle into a true one', ringError(snappedCircle, sc.x, sc.y) < 1.5, `ring error ${ringError(snappedCircle, sc.x, sc.y).toFixed(2)}, ${snappedCircle.length} pts`)

const lastFree = await drawn(circle(px + 220, py, 60), 0)
const lc = centre(lastFree)
check('without holding, the stroke stays as drawn', ringError(lastFree, lc.x, lc.y) > 1.8, `ring error ${ringError(lastFree, lc.x, lc.y).toFixed(2)}`)

const rx0 = px - 60
const ry0 = py + 150
const corners = [[rx0, ry0], [rx0 + 160, ry0 + 3], [rx0 + 158, ry0 + 90], [rx0 + 2, ry0 + 88], [rx0 + 1, ry0 + 2]]
const edge = []
for (let i = 0; i < corners.length - 1; i++) {
  for (let k = 0; k < 10; k++) {
    edge.push({ x: corners[i][0] + ((corners[i + 1][0] - corners[i][0]) * k) / 10 + jitter() / 2, y: corners[i][1] + ((corners[i + 1][1] - corners[i][1]) * k) / 10 + jitter() / 2 })
  }
}
const rect = await drawn(edge, 900)
const xs = [...new Set(rect.map((q) => Math.round(q.x)))]
const ys = [...new Set(rect.map((q) => Math.round(q.y)))]
check('a rough rectangle becomes an exact one', rect.length <= 6 && xs.length === 2 && ys.length === 2, `${rect.length} points, ${xs.length}x${ys.length} distinct`)
await page.click('button[aria-label="Type"]')

/* ---- 7. Bituin: weekly backup nudge, snooze, Quiet mode ----------------------- */
const weekOld = JSON.stringify({ state: { coach: { firstSeenAt: Date.now() - 10 * 86400000 } }, version: 1 })
async function nudgeSession(prefs) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  await c.addInitScript((v) => { if (!localStorage.getItem('tala:prefs')) localStorage.setItem('tala:prefs', v) }, prefs)
  const pg = await c.newPage()
  pg.on('pageerror', (err) => { failures++; console.log('FAIL  page error —', err.message) })
  await pg.goto(BASE, { waitUntil: 'networkidle' })
  await ready(pg)
  await onboard(pg)
  await newNote(pg)
  await pg.locator('text=Blank note').first().click()
  await wait(600)
  await pg.click('.ProseMirror')
  await pg.keyboard.type('Something worth backing up')
  await wait(1000)
  await pg.click('text=All Notes').catch(() => {})
  await wait(500)
  return { c, pg }
}
{
  const { c, pg } = await nudgeSession(weekOld)
  check('Bituin offers a backup after a week', await pg.isVisible('text=Back up your notes?'))
  const [dl] = await Promise.all([pg.waitForEvent('download'), pg.click('button:has-text("Back up now")')])
  check('"Back up now" saves a .tala file', /\.tala$/.test(dl.suggestedFilename()))
  await wait(600)
  check('the reminder rests once a backup is made', !(await pg.isVisible('text=Back up your notes?')))
  await c.close()
}
{
  const { c, pg } = await nudgeSession(weekOld)
  await pg.click('button:has-text("Later")')
  await pg.reload({ waitUntil: 'networkidle' })
  await ready(pg)
  await pg.click('text=All Notes').catch(() => {})
  await wait(500)
  check('"Later" snoozes the reminder across reloads', !(await pg.isVisible('text=Back up your notes?')))
  await c.close()
}
{
  const quiet = JSON.stringify({ state: { quietMode: true, coach: { firstSeenAt: Date.now() - 10 * 86400000 } }, version: 1 })
  const { c, pg } = await nudgeSession(quiet)
  check('Quiet mode silences Bituin', !(await pg.isVisible('text=Back up your notes?')))
  await c.close()
}

/* ---- 8. Data safety on iPad Safari and the phone's corner chip ---------------- */
{
  const IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  const c = await browser.newContext({ viewport: { width: 1180, height: 820 }, userAgent: IPAD, hasTouch: true })
  const pg = await c.newPage()
  pg.on('pageerror', (err) => { failures++; console.log('FAIL  page error —', err.message) })
  await pg.goto(BASE, { waitUntil: 'networkidle' })
  await ready(pg)
  await onboard(pg)
  check('iPad tab: onboarding adds the Home Screen step', onboard.sawSafetyStep === true)
  await newNote(pg)
  await pg.locator('text=Blank note').first().click()
  await wait(600)
  await pg.click('.ProseMirror')
  await pg.keyboard.type('iPad note')
  await wait(1000)
  await pg.click('text=All Notes').catch(() => {})
  await wait(500)
  check('iPad tab: Bituin asks to add Tala to the Home Screen', await pg.isVisible('text=Keep your notes safe'))
  await pg.click('button:has-text("Show me how")')
  await wait(400)
  check('the install guide shows the Share steps', await pg.isVisible('text=Add to Home Screen'))
  await pg.click('button:has-text("Got it")')
  await pg.click('button:has-text("Not now")')
  await wait(300)
  check('"Not now" puts the install card away', !(await pg.isVisible('text=Keep your notes safe')))
  await c.close()
}
{
  const c = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  await c.addInitScript((v) => { if (!localStorage.getItem('tala:prefs')) localStorage.setItem('tala:prefs', v) }, weekOld)
  const pg = await c.newPage()
  pg.on('pageerror', (err) => { failures++; console.log('FAIL  page error —', err.message) })
  await pg.goto(BASE, { waitUntil: 'networkidle' })
  await ready(pg)
  await onboard(pg)
  await pg.click('nav[aria-label="Primary"] button[aria-label="New note"]')
  await wait(400)
  await pg.locator('text=Blank note').first().click()
  await wait(600)
  await pg.click('.ProseMirror')
  await pg.keyboard.type('Writing on the phone')
  check('phone: Bituin stays out of the way while typing', !(await pg.isVisible('[role="status"] >> text=Back up your notes?')))
  await wait(2800)
  check('phone: Bituin\'s corner chip appears once writing rests', await pg.isVisible('[role="status"] >> text=Back up your notes?'))
  await pg.keyboard.type('x')
  await wait(200)
  check('phone: the chip steps aside the moment writing resumes', !(await pg.isVisible('[role="status"] >> text=Back up your notes?')))
  await c.close()
}

/* ---- 8. Coach loop: wrap-up, weekly goal, resurfacing --------------------------- */
async function coachSession(setup, { clock = false } = {}) {
  const c = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const pg = await c.newPage()
  pg.on('pageerror', (err) => { failures++; console.log('FAIL  page error —', err.message) })
  if (clock) await pg.clock.install() // time still flows; fastForward jumps it
  await pg.goto(BASE, { waitUntil: 'networkidle' })
  await ready(pg)
  await onboard(pg)
  await setup?.(pg)
  return { c, pg }
}
const putRows = (pg, tables) =>
  pg.evaluate(
    (t) =>
      new Promise((res, rej) => {
        const r = indexedDB.open('tala')
        r.onerror = () => rej(r.error)
        r.onsuccess = () => {
          const tx = r.result.transaction(Object.keys(t), 'readwrite')
          for (const [name, rows] of Object.entries(t)) rows.forEach((row) => tx.objectStore(name).put(row))
          tx.oncomplete = () => res()
        }
      }),
    tables,
  )
const textDoc = (t) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: t }] }] })
const oldNote = (id, title, ageDays) => {
  const at = Date.now() - ageDays * 86400000
  return {
    note: { id, title, content: null, ink: null, folderId: null, tagIds: [], isPinned: false, isFavorite: false, isArchived: false, isDeleted: false, deletedAt: null, createdAt: at, updatedAt: at },
    page: { id, noteId: id, index: 0, template: 'blank', content: textDoc('enzymes and substrates'), text: 'enzymes and substrates', size: { w: 595, h: 842, kind: 'a4' }, createdAt: at, updatedAt: at },
  }
}
const goHome = async (pg) => {
  await pg.click('nav >> text=Today').catch(() => {})
  await wait(500)
}

{
  const { note, page: pageRow } = oldNote('stale-1', 'Organic Chemistry', 10)
  const { c, pg } = await coachSession((p) => putRows(p, { notes: [note], pages: [pageRow] }))
  await pg.reload({ waitUntil: 'networkidle' })
  await ready(pg)
  await goHome(pg)
  check('Bituin brings back a note untouched for 10 days', await pg.isVisible('text=Remember this one?'))
  check('…and names it and the days', await pg.isVisible('text=“Organic Chemistry” hasn’t been opened in 10 days'))
  await pg.click('button:has-text("Not now")')
  await wait(300)
  check('"Not now" rests the reminder', !(await pg.isVisible('text=Remember this one?')))
  await pg.reload({ waitUntil: 'networkidle' })
  await ready(pg)
  await goHome(pg)
  check('…across reloads', !(await pg.isVisible('text=Remember this one?')))
  await c.close()
}

{
  // This week's Monday..Thursday, five minutes each => the default goal of 4
  const monday = new Date()
  monday.setHours(12, 0, 0, 0)
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7))
  const p2 = (n) => String(n).padStart(2, '0')
  const meta = [0, 1, 2, 3].map((i) => {
    const d = new Date(monday)
    d.setDate(monday.getDate() + i)
    return { key: `study:${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, value: 600 }
  })
  const { note, page: pageRow } = oldNote('fresh-1', 'This week', 0)
  const { c, pg } = await coachSession((p) => putRows(p, { notes: [note], pages: [pageRow], meta }))
  await pg.reload({ waitUntil: 'networkidle' })
  await ready(pg)
  await goHome(pg)
  check('Home shows study days this week', await pg.isVisible('text=4 of 4 study days'))
  check('Bituin cheers the weekly goal', await pg.isVisible('text=Weekly goal reached!'))
  await pg.click('button:has-text("Salamat!")')
  await wait(300)
  await pg.reload({ waitUntil: 'networkidle' })
  await ready(pg)
  await goHome(pg)
  check('the cheer comes once per week', !(await pg.isVisible('text=Weekly goal reached!')))
  await pg.click('nav >> text=Settings').catch(() => pg.click('button[aria-label="Settings"]'))
  await wait(500)
  await pg.selectOption('select[aria-label="Weekly study goal"]', '6')
  await wait(400)
  check('handwriting search says so when the browser cannot read handwriting', (await pg.isVisible('text=This browser has no handwriting recognition')) && (await pg.locator('button[aria-label="Handwriting search"]').isDisabled()))
  await pg.reload({ waitUntil: 'networkidle' })
  await ready(pg)
  await goHome(pg)
  check('the weekly goal setting persists', await pg.isVisible('text=4 of 6 study days'))
  await c.close()
}

{
  const { c, pg } = await coachSession(null, { clock: true })
  await newNote(pg)
  await pg.locator('text=Blank note').first().click()
  await wait(700)
  await pg.click('.ProseMirror')
  for (const word of ['one', 'two', 'three', 'four']) {
    await pg.keyboard.type(`${word} `)
    await pg.clock.fastForward(25_000) // under the 30 s gap that counts as a pause
  }
  await pg.clock.fastForward(11 * 60_000) // ten idle minutes end the session
  await pg.clock.fastForward(3000) // and Bituin waits for the pen to rest
  await wait(300)
  check('Bituin wraps up the session after ten idle minutes', await pg.isVisible('text=Galing! Good session.'))
check('…with minutes of writing', await pg.isVisible('text=/\\d+ min of writing/'))
  await c.close()
}

await rm(file, { force: true })
await browser.close()
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
