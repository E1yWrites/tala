import { chromium } from 'playwright-core'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } })
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e)))
await page.goto('http://localhost:5173')
await page.waitForSelector('text=All Notes', { timeout: 20000 })
await page.waitForTimeout(500)

async function pinStroke(page) {
  return page.evaluate(() => {
    // find a doodle-wrapped pin (span whose inner svg has our hand-drawn path)
    const spans = [...document.querySelectorAll('span[aria-hidden]')]
    for (const el of spans) {
      const svg = el.querySelector(':scope > svg')
      if (svg && !svg.classList.contains('lucide') && svg.getAttribute('stroke') === '#e8590c') return 'light-orange'
      if (svg && !svg.classList.contains('lucide') && svg.getAttribute('stroke') === '#74c0fc') return 'dark-blue'
    }
    return null
  })
}
const lightMode = await pinStroke(page)
await page.keyboard.press('Control+Shift+d')
await page.waitForTimeout(400)
const darkMode = await pinStroke(page)
console.log(`light mode → ${lightMode}; dark mode → ${darkMode}`)
console.log(lightMode === 'light-orange' && darkMode === 'dark-blue' ? 'PASS theme variants swap' : 'FAIL')
await browser.close()
