import { toast } from 'sonner'
import type { Note } from '@/types/models'
import { useNoteStore } from '@/store/noteStore'
import { useTagStore } from '@/store/tagStore'
import { useUIStore } from '@/store/uiStore'
import { useSettingsStore } from '@/store/settingsStore'
import { displayTitle } from '@/utils/noteFilters'
import type { MenuItem } from '../UI/DropdownMenu'

export interface NoteActionContext {
  /** Which surface the menu lives in — affects which actions make sense */
  surface: 'live' | 'archive' | 'trash'
}

/** Opens the app-wide confirmation dialog (hosted by ModalHost). */
export function confirmAction(payload: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
}): void {
  useUIStore.getState().openModal({ kind: 'confirm', ...payload })
}

/**
 * Deletes notes permanently and then prunes tags left with zero references,
 * so the sidebar never accumulates ghost tags. All destructive callers
 * (list menu, trash banner, empty-trash) go through here.
 *
 * Resolves `false` when the delete failed (the store already restored the
 * rows and showed an error toast) so callers never celebrate a failure.
 */
export async function deleteForeverAndPrune(ids: string[]): Promise<boolean> {
  await useNoteStore.getState().deleteForever(ids)
  const gone = useNoteStore
    .getState()
    .notes.every((n) => !ids.includes(n.id))
  if (!gone) return false
  try {
    await useTagStore.getState().pruneUnused()
  } catch (err) {
    console.error('[notely] tag prune failed', err)
  }
  return true
}

/**
 * Builds the context/kebab menu for a note row.
 * Centralized so list rows, grid cards and the editor share identical actions.
 */
export function buildNoteMenu(note: Note, ctx: NoteActionContext): MenuItem[] {
  const { patchNote, trashNotes, restoreNote, duplicateNote } =
    useNoteStore.getState()
  const openModal = useUIStore.getState().openModal
  const { confirmBeforeDelete } = useSettingsStore.getState().settings

  if (ctx.surface === 'trash') {
    return [
      {
        id: 'restore',
        label: 'Restore note',
        onSelect: () => {
          restoreNote(note.id)
          toast.success('Note restored')
        },
      },
      {
        id: 'delete-forever',
        label: 'Delete forever',
        danger: true,
        onSelect: () =>
          confirmAction({
            title: 'Delete forever?',
            message: `“${displayTitle(note)}” will be permanently deleted. This cannot be undone.`,
            confirmLabel: 'Delete forever',
            onConfirm: () => {
              void deleteForeverAndPrune([note.id]).then((ok) => {
                if (ok) toast.success('Note deleted forever')
              })
            },
          }),
      },
    ]
  }

  const items: MenuItem[] = [
    {
      id: 'pin',
      label: note.isPinned ? 'Unpin' : 'Pin to top',
      onSelect: () => patchNote(note.id, { isPinned: !note.isPinned }),
    },
    {
      id: 'favorite',
      label: note.isFavorite ? 'Remove from favorites' : 'Add to favorites',
      onSelect: () => patchNote(note.id, { isFavorite: !note.isFavorite }),
    },
    {
      id: 'move-folder',
      label: 'Move to folder…',
      onSelect: () => openModal({ kind: 'move-note', noteId: note.id }),
    },
    {
      id: 'tags',
      label: 'Edit tags…',
      onSelect: () => openModal({ kind: 'tag-editor', noteId: note.id }),
    },
    {
      id: 'duplicate',
      label: 'Duplicate',
      onSelect: () => {
        duplicateNote(note.id)
        toast.success('Note duplicated')
      },
    },
  ]

  if (ctx.surface === 'live') {
    items.push(
      {
        id: 'archive',
        label: 'Archive',
        onSelect: () => {
          patchNote(note.id, { isArchived: true })
          toast.success('Note archived')
        },
      },
      {
        id: 'trash',
        label: 'Move to trash',
        danger: true,
        onSelect: () => {
          const doTrash = (): void => {
            trashNotes([note.id])
            toast.success('Note moved to trash')
          }
          // Trashing is recoverable; only confirm when the user asked for it
          if (!confirmBeforeDelete) return doTrash()
          confirmAction({
            title: 'Move to trash?',
            message: `“${displayTitle(note)}” will be moved to the trash. You can restore it later.`,
            confirmLabel: 'Move to trash',
            onConfirm: doTrash,
          })
        },
      },
    )
  } else {
    items.push({
      id: 'unarchive',
      label: 'Remove from archive',
      onSelect: () => {
        patchNote(note.id, { isArchived: false })
        toast.success('Note moved back to All Notes')
      },
    })
  }

  return items
}
