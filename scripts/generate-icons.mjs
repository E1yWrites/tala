/* Builds the PWA / app icons from the Bituin mascot art: Bituin centred on a
 * soft green tile, inside the maskable safe zone (iOS and Android crop it).
 * Writes public/app-icon.png (512) and public/app-icon-192.png.
 * Run: node scripts/generate-icons.mjs
 * Then regenerate the desktop icons: npm run tauri icon public/app-icon.png */
import { chromium } from 'playwright-core'
import { readFile, writeFile } from 'node:fs/promises'

const art = `data:image/png;base64,${(await readFile('src/assets/bituin/bituin-512.png')).toString('base64')}`

const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage()
for (const [size, file] of [
  [512, 'public/app-icon.png'],
  [192, 'public/app-icon-192.png'],
]) {
  const dataUrl = await page.evaluate(
    async ({ art, size }) => {
      const img = new Image()
      img.src = art
      await img.decode()
      const c = document.createElement('canvas')
      c.width = c.height = size
      const x = c.getContext('2d')
      x.fillStyle = '#e3f3e6'
      x.fillRect(0, 0, size, size)
      const s = size * 0.66
      x.imageSmoothingQuality = 'high'
      x.drawImage(img, (size - s) / 2, (size - s) / 2 + size * 0.01, s, s)
      return c.toDataURL('image/png')
    },
    { art, size },
  )
  await writeFile(file, Buffer.from(dataUrl.split(',')[1], 'base64'))
  console.log(`Wrote ${file} (${size}px)`)
}
await browser.close()
