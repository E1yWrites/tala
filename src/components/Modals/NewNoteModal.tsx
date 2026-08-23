import { useMemo } from 'react'
import {
  BookOpen,
  FileText,
  GraduationCap,
  KanbanSquare,
  Lightbulb,
  ListChecks,
  NotebookPen,
  SquareCode,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { NoteTemplate } from '@/types/models'
import { TEMPLATES } from '@/data/templates'
import { useUIStore } from '@/store/uiStore'
import { useNoteStore } from '@/store/noteStore'
import { useTagStore } from '@/store/tagStore'
import { Modal } from '@/components/UI/Modal'
import { Kbd } from '@/components/UI/Kbd'
import { cn } from '@/utils/cn'

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  GraduationCap,
  Users,
  ListChecks,
  KanbanSquare,
  NotebookPen,
  BookOpen,
  Lightbulb,
  SquareCode,
}

export function NewNoteModal(): React.ReactNode {
  const createNote = useNoteStore((s) => s.createNote)
  const patchNote = useNoteStore((s) => s.patchNote)
  const ensureTags = useTagStore((s) => s.ensureTags)
  const closeAllModals = useUIStore((s) => s.closeAllModals)
  const setView = useUIStore((s) => s.setView)
  const selectNote = useUIStore((s) => s.selectNote)

  const templates = useMemo(
    () =>
      TEMPLATES.map((t) => ({
        tpl: t,
        Icon: TEMPLATE_ICONS[t.icon] ?? FileText,
      })),
    [],
  )

  async function createFrom(template?: NoteTemplate): Promise<void> {
    const ui = useUIStore.getState()
    const view = ui.activeView
    // Create inside the current folder when applicable
    const folderId = view.kind === 'folder' ? view.refId : null

    closeAllModals()

    const created = await createNote({
      title: '',
      content: template ? template.doc() : null,
      folderId,
    })
    if (template?.suggestedTags?.length) {
      const tags = await ensureTags(template.suggestedTags)
      if (tags.length > 0) {
        await patchNote(created.id, { tagIds: tags.map((t) => t.id) })
      }
    }

    // Make sure the new note is visible in the list
    const stays =
      view.kind === 'all' ||
      view.kind === 'recent' ||
      view.kind === 'home' ||
      (view.kind === 'folder' && view.refId === folderId)
    if (!stays) setView(folderId ? { kind: 'folder', refId: folderId } : { kind: 'all' })
    selectNote(created.id)
  }

  return (
    <Modal
      title="New note"
      subtitle="Start from a template or a blank page"
      onClose={closeAllModals}
      size="lg"
      initialFocus
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {/* Blank note */}
        <button
          type="button"
          onClick={() => void createFrom(undefined)}
          className={cn(
            'flex flex-col items-start gap-2 rounded-wobbly-sm border-2 border-line bg-panel p-3 text-left',
            'transition hover:border-accent/50 hover:bg-accent-soft/40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
          )}
        >
          <span className="grid size-8 place-items-center rounded-wobbly-sm bg-postit text-postit-ink border border-line shadow-sketch-sm">
            <FileText className="size-4" aria-hidden="true" />
          </span>
          <span className="text-[13px]">Blank note</span>
          <span className="text-xs leading-snug text-muted">Just start typing</span>
        </button>

        {templates.map(({ tpl, Icon }) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => void createFrom(tpl)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-wobbly-sm border-2 border-line bg-panel p-3 text-left',
              'transition hover:border-accent/50 hover:bg-accent-soft/40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
            )}
          >
            <span className="grid size-8 place-items-center rounded-wobbly-sm border border-dashed border-line bg-canvas text-accent">
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <span className="text-[13px]">{tpl.name}</span>
            <span className="text-xs leading-snug text-muted">{tpl.description}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-faint">
        Tip: press <Kbd>Esc</Kbd> to cancel
      </p>
    </Modal>
  )
}

