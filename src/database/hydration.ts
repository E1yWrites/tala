import { db } from './db'
import { noteRepository } from './repositories/noteRepository'
import { folderRepository } from './repositories/folderRepository'
import { tagRepository } from './repositories/tagRepository'
import { settingsRepository } from './repositories/settingsRepository'
import { useNoteStore } from '@/store/noteStore'
import { useFolderStore } from '@/store/folderStore'
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore, applyThemeToDom } from '@/store/settingsStore'
import { seedDemoData } from '@/data/seed'

/**
 * Boots the app: loads everything from IndexedDB into the Zustand stores.
 * On very first run (no settings row), seeds demo content first.
 * Runs behind the splash screen — typically completes in well under 300ms.
 * Memoized so React StrictMode's double-invoked effects can't double-seed.
 */
let bootPromise: Promise<void> | null = null

export function bootApp(): Promise<void> {
  bootPromise ??= doHydrate()
  return bootPromise
}

async function doHydrate(): Promise<void> {
  const storedSettings = await db.settings.get('app')
  if (!storedSettings) {
    try {
      await seedDemoData()
    } catch (err) {
      console.error('[notely] seeding failed', err)
    }
  }

  const [notes, folders, tags, settings] = await Promise.all([
    noteRepository.all(),
    folderRepository.all(),
    tagRepository.all(),
    settingsRepository.get(),
  ])

  // Referential repair: imports/merges can leave notes pointing at folders or
  // tags that no longer exist. Null them out and persist the fix so the UI
  // never shows a "Set folder" ghost or dead tag chips.
  const folderIds = new Set(folders.map((f) => f.id))
  const tagIds = new Set(tags.map((t) => t.id))
  const broken = notes.filter(
    (n) =>
      (n.folderId !== null && !folderIds.has(n.folderId)) ||
      n.tagIds.some((id) => !tagIds.has(id)),
  )
  if (broken.length > 0) {
    const repaired = broken.map((n) => ({
      ...n,
      folderId: n.folderId !== null && folderIds.has(n.folderId) ? n.folderId : null,
      tagIds: n.tagIds.filter((id) => tagIds.has(id)),
    }))
    try {
      await noteRepository.bulkPut(repaired)
      const repairedById = new Map(repaired.map((n) => [n.id, n]))
      for (let i = 0; i < notes.length; i++) {
        const r = repairedById.get(notes[i]!.id)
        if (r) notes[i] = r
      }
    } catch (err) {
      console.error('[notely] reference repair failed', err)
    }
  }

  useNoteStore.getState().hydrate(notes)
  useFolderStore.getState().hydrate(folders)
  useTagStore.getState().hydrate(tags)
  applyThemeToDom(settings.theme)
  useSettingsStore.setState({ settings })

  // An import/restore can wipe the folder or tag the user is currently
  // viewing — fall back to All Notes instead of lingering on a ghost view.
  const view = useUIStore.getState().activeView
  if (
    (view.kind === 'folder' && !folders.some((f) => f.id === view.refId)) ||
    (view.kind === 'tag' && !tags.some((t) => t.id === view.refId))
  ) {
    useUIStore.getState().setView({ kind: 'all' })
    if (useUIStore.getState().selectedNoteId !== null) {
      useUIStore.getState().selectNote(null)
    }
  }
}

/** Re-reads everything from IndexedDB into the stores (used after import/restore). */
export async function hydrateAll(): Promise<void> {
  await doHydrate()
}
