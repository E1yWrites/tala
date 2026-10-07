import Dexie from 'dexie'
import { toast } from 'sonner'
import { SAFETY_DB } from '@/database/db'
import { snapshotToZip } from '@/utils/exportImport'
import { dump } from './snapshot'

/*
  Dexie upgrades can't be undone and a PWA auto-updates, so before the first
  boot on the v4 schema the old library is copied, as a normal `.tala` zip,
  into a separate database. It is deleted after a few clean launches.
*/

const KEEP_BOOTS = 3

interface SafetyCopy {
  id: 'pre-v4'
  zip: Blob
  createdAt: number
  boots: number
}

function safetyDb(): Dexie {
  const d = new Dexie(SAFETY_DB)
  d.version(1).stores({ copies: 'id' })
  return d
}

/** Call before anything opens the main database. Returns true when a copy was made. */
export async function keepSafetyCopy(): Promise<boolean> {
  try {
    if (!(await Dexie.exists('tala'))) return false
    const old = new Dexie('tala')
    try {
      await old.open() // no schema declared: opens at the stored version, upgrades nothing
      if (old.verno >= 4) return false
      const zip = await snapshotToZip(await dump(old))
      const safety = safetyDb()
      try {
        const copy: SafetyCopy = { id: 'pre-v4', zip, createdAt: Date.now(), boots: 0 }
        await safety.table('copies').put(copy)
      } finally {
        safety.close()
      }
      return true
    } finally {
      old.close()
    }
  } catch (err) {
    // Never block boot on the safety net itself; the upgrade is additive.
    console.error('[tala] safety copy failed', err)
    return false
  }
}

/** Call after a successful boot: count it, expire the copy, tell the user once. */
export async function settleSafetyCopy(justCopied: boolean): Promise<void> {
  try {
    if (!(await Dexie.exists(SAFETY_DB))) return
    const safety = safetyDb()
    try {
      const copy = (await safety.table('copies').get('pre-v4')) as SafetyCopy | undefined
      if (!copy) return
      if (copy.boots + 1 >= KEEP_BOOTS && !justCopied) {
        await safety.delete()
        return
      }
      await safety.table('copies').put({ ...copy, boots: copy.boots + 1 })
      if (justCopied) {
        toast.info('Tala upgraded your library', {
          description: 'A safety copy of your old notes is kept for a few launches.',
          duration: 15000,
          action: { label: 'Download', onClick: () => void downloadSafetyCopy() },
        })
      }
    } finally {
      safety.close()
    }
  } catch (err) {
    console.error('[tala] safety copy bookkeeping failed', err)
  }
}

export async function downloadSafetyCopy(): Promise<void> {
  const safety = safetyDb()
  try {
    const copy = (await safety.table('copies').get('pre-v4')) as SafetyCopy | undefined
    if (!copy) return
    const url = URL.createObjectURL(copy.zip)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tala-before-upgrade.tala'
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  } finally {
    safety.close()
  }
}
