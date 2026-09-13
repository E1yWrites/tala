import { Download, FileText, PencilLine } from 'lucide-react'
import { toast } from 'sonner'
import type { DocumentRecord } from '@/types/models'
import { FORMAT_LABEL } from '@/lib/documents/formats'
import { assetRepository } from '@/database/repositories/assetRepository'
import { downloadAsset } from '@/lib/documents/assets'
import { useNoteStore } from '@/store/noteStore'
import { Button } from '../../UI/Button'
import { confirmAction } from '../../NoteList/noteActions'

/* ---------------------------------------------------------------------------
   Banner above a document-backed note: what was imported, how Tala chose to
   represent it, and the escape hatches (download the original; switch a
   preserved-layout import to editable text without re-importing).
--------------------------------------------------------------------------- */

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function DocumentBar({ document, readOnly }: { document: DocumentRecord; readOnly: boolean }): React.ReactNode {
  const updateDocument = useNoteStore((s) => s.updateDocument)
  const note = useNoteStore((s) => s.notes.find((n) => n.id === document.noteId))
  const hasTextCopy = Boolean(note?.content && (note.content.content?.length ?? 0) > 0)

  const download = async (): Promise<void> => {
    const asset = await assetRepository.get(document.originalAssetId ?? document.assetId)
    if (!asset) {
      toast.error('The original file is missing from storage')
      return
    }
    downloadAsset(asset, document.source.fileName)
  }

  const switchToEditable = (): void => {
    confirmAction({
      title: 'Switch to editable text?',
      message:
        'The preserved layout view will be replaced by editable text converted at import time. The original file stays attached, so you can always download it.',
      confirmLabel: 'Switch',
      onConfirm: () => {
        const originalId = document.originalAssetId ?? document.assetId
        void updateDocument(document.id, { kind: 'original-only', assetId: originalId, importNote: 'Imported as editable content. The original file is attached.' })
      },
    })
  }

  return (
    <div
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-wobbly-md border border-lineSoft bg-raise/60 px-3 py-2"
      data-testid="document-bar"
    >
      <FileText size={14} className="shrink-0 text-ballpoint" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-xs text-muted">
        <span className="font-medium text-ink">{document.source.fileName}</span>
        <span className="mx-1.5 text-faint">·</span>
        {FORMAT_LABEL[document.source.format]} · {formatBytes(document.source.bytes)}
        {document.importNote && <span className="block text-[11px] text-faint">{document.importNote}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {document.kind === 'rendered-html' && hasTextCopy && !readOnly && (
          <Button size="sm" variant="ghost" onClick={switchToEditable}>
            <PencilLine size={12} />
            Switch to editable text
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => void download()}>
          <Download size={12} />
          Original
        </Button>
      </div>
    </div>
  )
}
