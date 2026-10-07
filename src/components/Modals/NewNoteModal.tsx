import { useMemo, useRef, useState } from 'react'
import {
  BookOpen,
  FileText,
  FileUp,
  GraduationCap,
  KanbanSquare,
  Lightbulb,
  ListChecks,
  Pencil,
  SquareCode,
  Users,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import type { NoteTemplate } from '@/types/models'
import { TEMPLATES } from '@/data/templates'
import { useUIStore } from '@/store/uiStore'
import { createNote, patchNote } from '@/library/notes'
import { importPdf } from '@/library/pdfImport'
import { useTagStore } from '@/store/tagStore'
import { Modal } from '@/components/UI/Modal'
import { Kbd } from '@/components/UI/Kbd'
import { cn } from '@/utils/cn'

const TEMPLATE_ICONS: Record<string, LucideIcon> = {
  GraduationCap,
  Users,
  ListChecks,
  KanbanSquare,
  // templates.ts keys this slot 'NotebookPen'; render it as a plain pencil
  NotebookPen: Pencil,
  BookOpen,
  Lightbulb,
  SquareCode,
}

export function NewNoteModal(): React.ReactNode {
  const ensureTags = useTagStore((s) => s.ensureTags)
  const closeAllModals = useUIStore((s) => s.closeAllModals)
  const setView = useUIStore((s) => s.setView)
  const selectNote = useUIStore((s) => s.selectNote)

  const fileRef = useRef<HTMLInputElement | null>(null)
  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState('')

  const templates = useMemo(
    () =>
      TEMPLATES.map((t) => ({
        tpl: t,
        Icon: TEMPLATE_ICONS[t.icon] ?? FileText,
      })),
    [],
  )

  async function importPdfFile(file: File): Promise<void> {
    const view = useUIStore.getState().activeView
    const folderId = view.kind === 'folder' ? (view.refId ?? null) : null

    setImporting(true)
    try {
      const created = await importPdf(file, folderId, (current, total) => {
        setImportProgress(`Reading page ${current} of ${total}…`)
      })
      closeAllModals()
      setView(folderId ? { kind: 'folder', refId: folderId } : { kind: 'all' })
      selectNote(created.id)
    } catch (err) {
      console.error('[tala] failed to import PDF', err)
      toast.error('Could not import that PDF')
    } finally {
      setImporting(false)
      setImportProgress('')
    }
  }

  async function createFrom(template?: NoteTemplate): Promise<void> {
    const ui = useUIStore.getState()
    const view = ui.activeView
    // Create inside the current folder when applicable
    const folderId = view.kind === 'folder' ? (view.refId ?? null) : null

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
            'flex min-h-[110px] min-w-[160px] flex-col items-start gap-2 overflow-visible rounded-control border border-lineSoft bg-panel p-4 text-left',
            'transition hover:border-accent/50 hover:bg-accent-soft/40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center overflow-visible rounded-control bg-selected text-selected-ink border border-line shadow-rest">
            <FileText className="size-5" aria-hidden="true" />
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
              'flex min-h-[110px] min-w-[160px] flex-col items-start gap-2 overflow-visible rounded-control border border-lineSoft bg-panel p-4 text-left',
              'transition hover:border-accent/50 hover:bg-accent-soft/40 focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
            )}
          >
            <span className="grid size-8 shrink-0 place-items-center overflow-visible rounded-control border border-line bg-canvas text-accent">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span className="text-[13px]">{tpl.name}</span>
            <span className="text-xs leading-snug text-muted">{tpl.description}</span>
          </button>
        ))}
      <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className={cn(
            'flex min-h-[110px] min-w-[160px] flex-col items-start gap-2 overflow-visible rounded-control border border-line bg-canvas p-4 text-left text-accent',
            'transition hover:border-ballpoint/40 hover:bg-ballpoint-soft/50 hover:text-ballpoint focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none',
            importing && 'pointer-events-none opacity-60',
          )}
        >
          <span className="grid size-8 shrink-0 place-items-center overflow-visible rounded-control border border-line bg-canvas text-accent">
            <FileUp className="size-5" aria-hidden="true" />
          </span>
          <span className="text-[13px]">Import PDF</span>
          <span className="text-xs leading-snug text-muted">
            {importing ? importProgress || 'Importing…' : 'Annotate an existing document'}
          </span>
        </button>

        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          aria-hidden="true"
          tabIndex={-1}
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) void importPdfFile(file)
            e.target.value = ''
          }}
        />
      </div>
      <p className="mt-3 text-center text-xs text-faint">
        Tip: press <Kbd>Esc</Kbd> to cancel
      </p>
    </Modal>
  )
}

