import { FileText } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { EmptyState } from '../UI/EmptyState'

/** Shown in the editor pane when no note is selected (desktop/tablet). */
export function EditorPlaceholder(): React.ReactNode {
  const openModal = useUIStore((s) => s.openModal)
  return (
    <div className="flex h-full items-center justify-center">
      <EmptyState
        icon={FileText}
        title="No note selected"
        description="Pick a note from the list, or create a new one to start writing."
        action={
          <button
            type="button"
            onClick={() => openModal({ kind: 'new-note' })}
            className="text-sm text-ballpoint underline decoration-ballpoint/40 decoration-wavy underline-offset-4 transition-colors hover:text-accent hover:decoration-accent"
          >
            Create a new note
          </button>
        }
      />
    </div>
  )
}
