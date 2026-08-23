import { FolderInput } from 'lucide-react'
import { toast } from 'sonner'
import { useFolderStore } from '@/store/folderStore'
import { useNoteStore } from '@/store/noteStore'
import { useUIStore } from '@/store/uiStore'
import { Modal } from '@/components/UI/Modal'
import { cn } from '@/utils/cn'

/** Move a note into a folder (or out to "No folder"). */
export function MoveNoteModal({ noteId }: { noteId: string }): React.ReactNode {
  const folders = useFolderStore((s) => s.folders)
  const note = useNoteStore((s) => s.notes.find((n) => n.id === noteId))
  const patchNote = useNoteStore((s) => s.patchNote)
  const closeAllModals = useUIStore((s) => s.closeAllModals)

  if (!note) {
    return (
      <Modal title="Move note" onClose={closeAllModals} size="sm">
        <p className="p-4 text-xs text-muted">This note no longer exists.</p>
      </Modal>
    )
  }

  async function move(folderId: string | null): Promise<void> {
    await patchNote(noteId, { folderId })
    const name = folderId ? (folders.find((f) => f.id === folderId)?.name ?? 'folder') : 'No folder'
    toast.success(`Moved to “${name}”`)
    closeAllModals()
  }

  return (
    <Modal title="Move note" subtitle={note.title || 'Untitled'} onClose={closeAllModals} size="sm">
      <div className="max-h-[46vh] space-y-1 overflow-y-auto">
        <MoveRow
          label="No folder"
          active={note.folderId === null}
          onClick={() => void move(null)}
        />
        {folders.map((f) => (
          <MoveRow
            key={f.id}
            label={f.name}
            active={note.folderId === f.id}
            onClick={() => void move(f.id)}
          />
        ))}
        {folders.length === 0 && (
          <p className="px-2 py-3 text-center text-[11px] text-faint">
            Create a folder first — use the + button in the sidebar or the command palette (Ctrl K).
          </p>
        )}
      </div>
    </Modal>
  )
}

function MoveRow({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.ReactNode {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-wobbly-sm px-3 py-2 text-left transition',
        active ? 'bg-postit text-postit-ink' : 'hover:bg-canvas',
      )}
    >
      <FolderInput className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate text-[13px]">{label}</span>
      {active && <span className="ml-auto text-xs">Current</span>}
    </button>
  )
}
