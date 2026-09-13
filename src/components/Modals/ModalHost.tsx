import type { ModalIntent } from '@/types/models'
import { useUIStore } from '@/store/uiStore'
import { ConfirmDialog } from '@/components/UI/ConfirmDialog'
import { NewNoteModal } from './NewNoteModal'
import { SearchModal } from './SearchModal'
import { CommandPalette } from './CommandPalette'
import { ShareModal } from './ShareModal'
import { FolderEditorModal } from './FolderEditorModal'
import { MoveNoteModal } from './MoveNoteModal'
import { TagEditorModal } from './TagEditorModal'
import { ProfilePictureModal } from './ProfilePictureModal'
import { ImportDocumentModal } from './ImportDocumentModal'
import { ImportPackageModal } from './ImportPackageModal'

function ModalFor({ intent }: { intent: ModalIntent }): React.ReactNode {
  switch (intent.kind) {
    case 'confirm':
      return (
        <ConfirmDialog
          open
          title={intent.title}
          message={intent.message}
          confirmLabel={intent.confirmLabel}
          danger={intent.danger}
          onConfirm={() => {
            useUIStore.getState().closeModal()
            void intent.onConfirm()
          }}
          onCancel={() => useUIStore.getState().closeModal()}
        />
      )
    case 'new-note':
      return <NewNoteModal />
    case 'palette':
      return <CommandPalette />
    case 'search':
      return <SearchModal />
    case 'share':
      return <ShareModal noteId={intent.noteId} />
    case 'import-document':
      return <ImportDocumentModal files={intent.files} />
    case 'import-package':
      return <ImportPackageModal file={intent.file} />
    case 'folder-editor':
      return <FolderEditorModal folderId={intent.folderId ?? null} />
    case 'move-note':
      return <MoveNoteModal noteId={intent.noteId} />
    case 'tag-editor':
      return <TagEditorModal noteId={intent.noteId} />
    case 'profile-picture':
      return <ProfilePictureModal onClose={() => useUIStore.getState().closeModal()} />
    default:
      return null
  }
}

/** Renders every open modal; later entries stack above earlier ones. */
export function ModalHost(): React.ReactNode {
  const stack = useUIStore((s) => s.modalStack)
  if (stack.length === 0) return null
  return (
    <>
      {stack.map((entry) => (
        <ModalFor key={entry.id} intent={entry.intent} />
      ))}
    </>
  )
}
