import { Capacitor } from '@capacitor/core'

/*
  The App Store build: the same app inside Capacitor's iOS shell. Downloads
  don't exist there, so files go through the share sheet, and Filesystem is how
  the library mirror (library/mirror.ts) reaches the app's own folder.
*/

/** Running inside the native app shell, not a browser tab or the Tauri desktop app. */
export const isNative = (): boolean => Capacitor.isNativePlatform()

/** A blob as base64: the form Capacitor's Filesystem takes binary data in. */
export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const url = String(r.result)
      resolve(url.slice(url.indexOf(',') + 1))
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** Offers a file in the share sheet (Save to Files, AirDrop, a chat). False when the sheet is closed. */
export async function shareFile(name: string, blob: Blob): Promise<boolean> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')])
  const { uri } = await Filesystem.writeFile({ path: name, data: await toBase64(blob), directory: Directory.Cache })
  try {
    await Share.share({ files: [uri] })
    return true
  } catch (err) {
    if (/cancel/i.test((err as Error).message)) return false
    throw err
  }
}
