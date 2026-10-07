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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {/* Blank note */}
        <button
          type="button"
          onClick={() => void createFrom(undefined)}
          className={cn(
            'flex items-center gap-3 rounded-card border border-ink bg-panel p-3.5 text-left',
            'transition-colors hover:bg-raise/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ballpoint',
          )}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-panel">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">Blank note</span>
            <span className="block text-[13px] leading-snug text-muted">Type, or write with your pen</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={importing}
          className={cn(
            'flex items-center gap-3 rounded-card border border-lineSoft bg-panel p-3.5 text-left',
            'transition-colors hover:border-line hover:bg-raise/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ballpoint',
            importing && 'pointer-events-none opacity-60',
          )}
        >
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
            <FileUp className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold">Import PDF</span>
            <span className="block text-[13px] leading-snug text-muted">
              {importing ? importProgress || 'Importing…' : 'Mark up slides and handouts'}
            </span>
          </span>
        </button>
      </div>

      <p className="mb-1 mt-5 px-1 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-faint">Templates</p>
      <div className="grid grid-cols-1 gap-x-2 sm:grid-cols-2">
        {templates.map(({ tpl, Icon }) => (
          <button
            key={tpl.id}
            type="button"
            onClick={() => void createFrom(tpl)}
            className={cn(
              'flex items-center gap-3 rounded-control px-2.5 py-2.5 text-left',
              'transition-colors hover:bg-raise/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ballpoint',
            )}
          >
            <Icon className="size-[18px] shrink-0 text-muted" aria-hidden="true" />
            <span className="min-w-0">
              <span className="block text-[14px] font-medium">{tpl.name}</span>
              <span className="block truncate text-xs text-faint">{tpl.description}</span>
            </span>
          </button>
        ))}
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
      <p className="mt-4 text-center text-xs text-faint">
        <Kbd>Esc</Kbd> to cancel
      </p>
    </Modal>
  )
}

