import { db } from '@/database/db'
import { settingsRepository } from '@/database/repositories/settingsRepository'
import { useNoteStore } from '@/store/noteStore'
import { useFolderStore } from '@/store/folderStore'
import { usePageStore } from '@/store/pageStore'
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore, applyThemeToDom } from '@/store/settingsStore'
import type { Note } from '@/types/models'
import { upgradePages } from './migrate'
import { markOnDisk } from './notes'
import { repairRefs } from './references'
import { keepSafetyCopy, settleSafetyCopy } from './safety'
import { requestPersistence } from './storage'
import { interruptStale, formatDuration } from './recordings'
import { loadStudy } from './study'
import { startInkIndexer } from './inkText'
import { restoreIfEvicted, startMirror } from './mirror'
import { startReminders } from './reminders'
import { toast } from 'sonner'

/**
 * Reads the light tables into the Zustand stores, repairing what an
 * interrupted write or an import left dangling. Blobs, PDFs and recordings are
 * never loaded here: they are fetched on demand.
 */
export async function load(): Promise<void> {
  const [notes, folders, tags, inkRecords, storedPages, settings] = await Promise.all([
    db.notes.toArray(),
    db.folders.toArray(),
    db.tags.toArray(),
    db.inkDocs.toArray(),
    db.pages.toArray(),
    settingsRepository.get(),
  ])

  // Ink is keyed by page id and lands before the debounced note-row touch-up,
  // so a reload in that window leaves handwriting with no note. Revive a
  // minimal note instead of dropping the strokes. (Page ids count as known, or
  // every page 2+ would be mistaken for an orphan.)
  const known = new Set([...notes.map((n) => n.id), ...storedPages.map((p) => p.id)])
  const now = Date.now()
  const revived: Note[] = inkRecords
    .filter((r) => !known.has(r.noteId) && r.doc.strokes.length > 0)
    .map((r) => ({
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
  const allNotes = [...notes, ...revived]

  // Every note needs a page 1 (revived notes, imports); referential repair.
  const upgraded = upgradePages(allNotes, storedPages)
  const refs = repairRefs(allNotes, folders, tags)
  const changedNotes = new Map([...revived, ...refs.notes].map((n) => [n.id, n]))
  if (changedNotes.size + refs.folders.length + upgraded.pages.length + upgraded.blobs.length > 0) {
    try {
      await db.transaction('rw', db.notes, db.folders, db.pages, db.blobs, async () => {
        await db.notes.bulkPut([...changedNotes.values()])
        await db.folders.bulkPut(refs.folders)
        await db.pages.bulkPut(upgraded.pages)
        await db.blobs.bulkPut(upgraded.blobs)
      })
    } catch (err) {
      console.error('[tala] library repair failed', err)
    }
  }
  const overlay = <T extends { id: string }>(rows: T[], fixed: T[]): T[] => [
    ...new Map([...rows, ...fixed].map((r) => [r.id, r])).values(),
  ]
  const finalNotes = overlay(allNotes, [...changedNotes.values()])
  const finalFolders = overlay(folders, refs.folders)
  const finalPages = overlay(storedPages, upgraded.pages)

  markOnDisk(finalNotes.map((n) => n.id))
  useNoteStore.getState().hydrate(finalNotes)
  useNoteStore.getState().hydrateInk(inkRecords)
  usePageStore.getState().hydrate(finalPages)
  useFolderStore.getState().hydrate(finalFolders)
  useTagStore.getState().hydrate(tags)
  applyThemeToDom(settings.theme)
  useSettingsStore.setState({ settings })
  await loadStudy().catch((err) => console.error('[tala] could not load study days', err))

  // An import/restore can wipe the folder or tag the user is looking at —
  // fall back to All Notes instead of lingering on a ghost view.
  const ui = useUIStore.getState()
  const view = ui.activeView
  if (
    (view.kind === 'folder' && !finalFolders.some((f) => f.id === view.refId)) ||
    (view.kind === 'tag' && !tags.some((t) => t.id === view.refId))
  ) {
    ui.setView({ kind: 'all' })
    if (useUIStore.getState().selectedNoteId !== null) useUIStore.getState().selectNote(null)
  }
}

/**
 * Boots the app behind the splash screen. Memoized so React StrictMode's
 * double-invoked effects can't run it twice.
 */
let bootPromise: Promise<void> | null = null

export function bootApp(): Promise<void> {
  bootPromise ??= (async () => {
    const copied = await keepSafetyCopy()
    // App Store app: iOS may have cleared the webview's storage while Tala was closed
    const recovered = await restoreIfEvicted().catch((err) => {
      console.error('[tala] could not restore the on-device copy', err)
      return false
    })
    await load()
    if (recovered) toast.success('Your notes were restored from Tala’s copy on this device.')
    startMirror()
    await settleSafetyCopy(copied)
    await announceInterruptedRecordings()
    void requestPersistence()
    startInkIndexer()
    startReminders()
  })()
  return bootPromise
}

/** A recording still marked live at boot means the app died mid-lecture: keep it, and say so. */
async function announceInterruptedRecordings(): Promise<void> {
  try {
    const fixed = await interruptStale()
    for (const r of fixed) {
      toast.message(`A recording was interrupted. ${formatDuration(r.durationMs)} was saved and is in that note.`)
    }
  } catch (err) {
    console.error('[tala] could not check for interrupted recordings', err)
  }
}

/** Re-reads everything into the stores (after import/restore). */
export async function hydrateAll(): Promise<void> {
  // Chain off an in-flight boot to prevent concurrent hydration races
  if (bootPromise) await bootPromise
  await load()
}
