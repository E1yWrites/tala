import { db } from '@/database/db'
import { backupToSnapshot, parseBackup, snapshotToBackup } from '@/utils/exportImport'
import { isNative, toBase64 } from '@/utils/native'
import { flush } from './notes'
import { dump, restore } from './snapshot'

/*
  iOS may clear a webview's storage (IndexedDB and localStorage together) when
  the device runs low on space. The App Store app keeps a copy of the library in
  its own Library folder, which iOS never clears and device backups include,
  and restores it at boot when the webview's storage comes back wiped.

  A library the user emptied by deleting notes is not "wiped": the localStorage
  marker survives that, so the copy is only read after a real eviction.
  Settings → Clear all data (wipe) deletes the copy before anything else.
  Lecture audio is not copied (as in backups).

    mirror/library.json   the rows, in backup.json's format
    mirror/blobs/<id>     each PDF / image once (blobs never change)
*/

const DIR = 'mirror'
const LIBRARY = `${DIR}/library.json`
const MARK = 'tala:mirrored'

async function files() {
  const m = await import('@capacitor/filesystem')
  return { Filesystem: m.Filesystem, Directory: m.Directory.Library, UTF8: m.Encoding.UTF8 }
}

/** Blob files already in the mirror (read once per launch). */
let written: Set<string> | null = null
let queue: Promise<void> = Promise.resolve()

async function write(): Promise<void> {
  const { Filesystem, Directory, UTF8 } = await files()
  await flush()
  const snapshot = await dump()
  written ??= new Set(
    (await Filesystem.readdir({ path: `${DIR}/blobs`, directory: Directory }).catch(() => ({ files: [] }))).files.map((f) => f.name),
  )
  const live = new Set(snapshot.blobs.map((b) => b.id))
  for (const b of snapshot.blobs) {
    if (written.has(b.id)) continue
    await Filesystem.writeFile({ path: `${DIR}/blobs/${b.id}`, data: await toBase64(b.data), directory: Directory, recursive: true })
    written.add(b.id)
  }
  // Rows last, so they never name a blob the mirror doesn't have; via a temp file, so a kill mid-write keeps the old copy
  await Filesystem.writeFile({ path: `${DIR}/library.tmp`, data: JSON.stringify(snapshotToBackup(snapshot)), directory: Directory, encoding: UTF8, recursive: true })
  await Filesystem.deleteFile({ path: LIBRARY, directory: Directory }).catch(() => {})
  await Filesystem.rename({ from: `${DIR}/library.tmp`, to: LIBRARY, directory: Directory })
  // Deleted PDFs must not linger in the copy
  for (const id of [...written].filter((id) => !live.has(id))) {
    await Filesystem.deleteFile({ path: `${DIR}/blobs/${id}`, directory: Directory }).catch(() => {})
    written.delete(id)
  }
  try {
    localStorage.setItem(MARK, String(Date.now()))
  } catch {
    // no marker: the next boot with an empty library would restore the copy, which is the safe side
  }
}

/** Copies the library into the app's folder. One copy at a time; failures are logged, never shown. */
export function writeMirror(): Promise<void> {
  if (!isNative()) return Promise.resolve()
  queue = queue.then(write).catch((err) => console.error('[tala] library mirror failed', err))
  return queue
}

/** Keeps the copy current: whenever the app goes to the background, and once now. */
export function startMirror(): void {
  if (!isNative()) return
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void writeMirror()
  })
  window.addEventListener('pagehide', () => void writeMirror())
  void writeMirror()
}

/** At boot: if iOS wiped the webview's storage, put the library back from the copy. True when it did. */
export async function restoreIfEvicted(): Promise<boolean> {
  if (!isNative()) return false
  try {
    if (localStorage.getItem(MARK)) return false
  } catch {
    return false
  }
  if ((await db.notes.count()) > 0) return false
  const { Filesystem, Directory, UTF8 } = await files()
  const json = await Filesystem.readFile({ path: LIBRARY, directory: Directory, encoding: UTF8 }).catch(() => null)
  if (!json || typeof json.data !== 'string') return false
  const backup = parseBackup(json.data)
  backup.blobData = []
  for (const { id, type } of backup.blobs ?? []) {
    const f = await Filesystem.readFile({ path: `${DIR}/blobs/${id}`, directory: Directory }).catch(() => null)
    if (!f) continue
    const data = typeof f.data === 'string' ? await (await fetch(`data:${type || 'application/octet-stream'};base64,${f.data}`)).blob() : f.data
    backup.blobData.push({ id, data })
  }
  await restore(backupToSnapshot(backup), 'replace')
  return true
}

/** Clear all data (wipe): the copy goes too. */
export async function deleteMirror(): Promise<void> {
  if (!isNative()) return
  const { Filesystem, Directory } = await files()
  await Filesystem.rmdir({ path: DIR, directory: Directory, recursive: true }).catch(() => {})
  written = null
  try {
    localStorage.removeItem(MARK)
  } catch {
    // nothing to forget
  }
}
