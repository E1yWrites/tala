/* Pages / PDF / backup end-to-end: per-page typed text, PDF import and on-demand
 * render (also offline), and a .tala backup round trip that carries the PDF.
 * Run: node scripts/pages-e2e.mjs  (requires `npm run preview` running on :4173)
 * Headless-shell needs: LD_LIBRARY_PATH=/tmp/opencode/nssroot/usr/lib/x86_64-linux-gnu */
import { chromium } from 'playwright-core'
import JSZip from 'jszip'
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
  await p.click('button:has-text("Start Using Tala")').catch(() => {})
  await wait(600)
}

const ready = async (p) => {
  await p.waitForSelector('#splash', { state: 'detached', timeout: 15000 }).catch(() => {})
}
const newNote = async (p) => {
  await p.click('text=All Notes').catch(() => {})
  await wait(300)
  await p.click('button[aria-label="New note"]')
  await wait(400)
}
const editorText = async (p) => (await p.textContent('.ProseMirror')) ?? ''
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
/** True when the first PDF canvas has any dark (text) pixel. */
const canvasHasInk = (p) =>
  p.evaluate(() => {
    const c = document.querySelector('canvas[role="img"]')
    if (!c || c.width === 0) return false
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 0 && d[i] < 100 && d[i + 1] < 100) return true
    return false
  })

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
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
check('new page starts empty', !(await editorText(page)).includes('PAGEONE-ALPHA'))
await page.click('.ProseMirror')
await page.keyboard.type('PAGETWO-BETA')
await wait(900)
await page.click('button[aria-label="Previous page"]')
await wait(500)
let t = await editorText(page)
check('page 1 keeps only its own text', t.includes('PAGEONE-ALPHA') && !t.includes('PAGETWO-BETA'))

await page.reload({ waitUntil: 'networkidle' })
await ready(page)
check('search finds text typed on page 2', (await openFromSearch(page, 'pagetwo-beta')) > 0)
t = await editorText(page)
check('reopened note shows page 1', t.includes('PAGEONE-ALPHA'))
await page.click('button[aria-label="Next page"]')
await wait(400)
check('page 2 text survives reload', (await editorText(page)).includes('PAGETWO-BETA'))

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
check('PDF page 2 renders', await canvasHasInk(page))
await wait(400)
check('PDF text layer is searchable', (await searchHits(page, 'quartz-lecture-two')) > 0)
await page.keyboard.press('Escape')

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
check('backup is v3 with pdf rows', backup.version === 3 && backup.pdfs.length === 2 && backup.pages.some((p) => p.pdfPage === 2))

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

await rm(file, { force: true })
await browser.close()
console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
process.exit(failures === 0 ? 0 : 1)
