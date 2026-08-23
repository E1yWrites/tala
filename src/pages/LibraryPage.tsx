import { NoteListPanel } from '@/components/NoteList/NoteListPanel'
import type { ViewRef } from '@/types/models'

/**
 * Generic library view — powers All Notes, Favorites, Pinned, Recent,
 * Archive, Trash, folder and tag views. Each named page below is a preset.
 */
export function LibraryPage({ view }: { view: ViewRef }): React.ReactNode {
  return <NoteListPanel view={view} />
}

export function AllNotesPage(): React.ReactNode {
  return <LibraryPage view={{ kind: 'all' }} />
}

export function FavoritesPage(): React.ReactNode {
  return <LibraryPage view={{ kind: 'favorites' }} />
}

export function PinnedPage(): React.ReactNode {
  return <LibraryPage view={{ kind: 'pinned' }} />
}

export function ArchivePage(): React.ReactNode {
  return <LibraryPage view={{ kind: 'archive' }} />
}

export function TrashPage(): React.ReactNode {
  return <LibraryPage view={{ kind: 'trash' }} />
}
