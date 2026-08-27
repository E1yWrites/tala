import { noteRepository } from './repositories/noteRepository'
import { inkRepository } from './repositories/inkRepository'
import { folderRepository } from './repositories/folderRepository'
import { tagRepository } from './repositories/tagRepository'
import { settingsRepository } from './repositories/settingsRepository'
import { useNoteStore } from '@/store/noteStore'
import { useFolderStore } from '@/store/folderStore'
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore, applyThemeToDom } from '@/store/settingsStore'

/**
 * Boots the app: loads everything from IndexedDB into the Zustand stores.
 * Runs behind the splash screen — typically completes in well under 300ms.
 * Memoized so React StrictMode's double-invoked effects can't double-run.
 */
let bootPromise: Promise<void> | null = null

export function bootApp(): Promise<void> {
  bootPromise ??= doHydrate()
  return bootPromise
}

async function doHydrate(): Promise<void> {
  const [notes, inkRecords, folders, tags, settings] = await Promise.all([
    noteRepository.all(),
    // Eager: the editor needs ink the moment a note opens, not after a roundtrip
    inkRepository.all(),
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
      console.error('[tala] reference repair failed', err)
    }
  }

  useNoteStore.getState().hydrate(notes)
  useNoteStore.getState().hydrateInk(inkRecords)

  // Safety net: ink writes land before the debounced note-row touch-up, so a
  // reload in that window leaves orphaned handwriting. Materialize minimal
  // note rows for them instead of silently dropping the user's strokes.
  const knownIds = new Set(notes.map((n) => n.id))
  const orphans = inkRecords.filter((r) => !knownIds.has(r.noteId) && r.doc.strokes.length > 0)
  if (orphans.length > 0) {
    const now = Date.now()
    const revived = orphans.map((r) => ({
      id: r.noteId,
      title: '',
      content: null,
      ink: null,
      folderId: null,
      tagIds: [],
      isPinned: false,
      isFavorite: false,
      isArchived: false,
      isDeleted: false,
      deletedAt: null,
      createdAt: now,
      updatedAt: now,
    }))
    try {
      await noteRepository.bulkPut(revived)
      useNoteStore.getState().hydrate([...notes, ...revived])
    } catch (err) {
      console.error('[tala] failed to revive orphaned handwriting', err)
    }
  }

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
  // Chain off in-flight boot to prevent concurrent hydration races
  if (bootPromise) await bootPromise
  await doHydrate()
}
