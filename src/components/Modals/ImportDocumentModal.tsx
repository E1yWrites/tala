import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckSoft, FileText, FileUp, LoaderCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ImportStrategy } from '@/types/models'
import { useUIStore } from '@/store/uiStore'
import { ACCEPTED_EXTENSIONS, extensionOf } from '@/lib/documents/formats'
import {
  describeImportError,
  importDocumentFile,
  ImportCancelledError,
  type ImportProgress,
  type ImportResult,
} from '@/lib/documents/importDocument'
import { Modal } from '@/components/UI/Modal'
import { Button } from '@/components/UI/Button'
import { cn } from '@/utils/cn'

/* ---------------------------------------------------------------------------
   Import PDF / Word / PowerPoint files as notes. Files can arrive pre-picked
   (drag & drop onto the app) or via the picker here. Office files get a
   strategy choice; the default "Automatic" explains, per file, what Tala
   decided and why.
--------------------------------------------------------------------------- */

const STRATEGIES: Array<{ id: ImportStrategy; label: string; hint: string }> = [
  { id: 'auto', label: 'Automatic', hint: 'Editable text when the conversion is faithful, otherwise the original layout. Recommended.' },
  { id: 'editable', label: 'Import as editable', hint: 'Always convert to Tala text you can edit. Tables and complex layouts become plain text.' },
  { id: 'preserve', label: 'Preserve appearance', hint: 'Keep the original layout as a read-only page view. The text stays searchable.' },
]

type RowState =
  | { status: 'queued' }
  | { status: 'running'; progress: ImportProgress }
  | { status: 'done'; result: ImportResult }
  | { status: 'failed'; error: string }
  | { status: 'cancelled' }

interface Row {
  file: File
  state: RowState
}

const acceptAttr = ACCEPTED_EXTENSIONS.join(',')

export function isSupportedDocumentFile(file: File): boolean {
  return (ACCEPTED_EXTENSIONS as readonly string[]).includes(extensionOf(file.name))
}

export function ImportDocumentModal({ files: initialFiles }: { files?: File[] }): React.ReactNode {
  const closeAllModals = useUIStore((s) => s.closeAllModals)
  const selectNote = useUIStore((s) => s.selectNote)
  const setView = useUIStore((s) => s.setView)
  const [rows, setRows] = useState<Row[]>(() => (initialFiles ?? []).map((file) => ({ file, state: { status: 'queued' } })))
  const [strategy, setStrategy] = useState<ImportStrategy>('auto')
  const [running, setRunning] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const hasOffice = rows.some((r) => /\.(docx?|pptx?)$/i.test(r.file.name))
  const pending = rows.filter((r) => r.state.status === 'queued')
  const finished = rows.length > 0 && rows.every((r) => r.state.status === 'done' || r.state.status === 'failed' || r.state.status === 'cancelled')

  const addFiles = useCallback((list: FileList | File[] | null) => {
    if (!list) return
    const incoming = Array.from(list)
    const rejected = incoming.filter((f) => !isSupportedDocumentFile(f))
    if (rejected.length > 0) {
      toast.error(`Skipped ${rejected.length} unsupported file${rejected.length === 1 ? '' : 's'}`, {
        description: 'Tala imports PDF, DOCX, PPTX, DOC and PPT files.',
      })
    }
    const accepted = incoming.filter(isSupportedDocumentFile)
    if (accepted.length === 0) return
    setRows((prev) => [...prev, ...accepted.map((file) => ({ file, state: { status: 'queued' } as RowState }))])
  }, [])

  const updateRow = (index: number, state: RowState): void =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, state } : r)))

  const run = async (): Promise<void> => {
    if (running) return
    const ctl = new AbortController()
    abortRef.current = ctl
    setRunning(true)
    const ui = useUIStore.getState()
    const folderId = ui.activeView.kind === 'folder' ? (ui.activeView.refId ?? null) : null
    let lastNoteId: string | null = null
    let okCount = 0
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]!
      if (row.state.status !== 'queued') continue
      if (ctl.signal.aborted) {
        updateRow(i, { status: 'cancelled' })
        continue
      }
      try {
        const result = await importDocumentFile(row.file, {
          strategy,
          folderId,
          signal: ctl.signal,
          onProgress: (progress) => updateRow(i, { status: 'running', progress }),
        })
        updateRow(i, { status: 'done', result })
        lastNoteId = result.note.id
        okCount++
      } catch (err) {
        if (err instanceof ImportCancelledError) updateRow(i, { status: 'cancelled' })
        else {
          console.error('[tala] import failed', row.file.name, err)
          updateRow(i, { status: 'failed', error: describeImportError(err) })
        }
      }
    }
    setRunning(false)
    abortRef.current = null
    if (okCount === 1 && lastNoteId) {
      // Single import: jump straight into the new note
      closeAllModals()
      const view = useUIStore.getState().activeView
      if (view.kind !== 'all' && view.kind !== 'recent' && view.kind !== 'home' && view.kind !== 'folder') setView({ kind: 'all' })
      selectNote(lastNoteId)
      toast.success('Document imported')
    } else if (okCount > 1) {
      toast.success(`${okCount} documents imported`)
    }
  }

  const cancel = (): void => abortRef.current?.abort()

  // Esc while running cancels instead of closing (the store handles the close)
  useEffect(() => {
    if (!running) return
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        cancel()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [running])

  return (
    <Modal
      title="Import document"
      subtitle="PDF, Word or PowerPoint → a Tala note"
      onClose={running ? cancel : closeAllModals}
      size="md"
      dismissable={!running}
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptAttr}
        multiple
        hidden
        onChange={(e) => {
          addFiles(e.target.files)
          e.target.value = ''
        }}
        data-testid="import-file-input"
      />

      {/* Drop zone / picker */}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={running}
        onDragOver={(e) => {
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (!running) addFiles(e.dataTransfer.files)
        }}
        className={cn(
          'flex w-full flex-col items-center gap-1.5 rounded-wobbly-md border-2 border-dashed border-line bg-canvas px-4 py-5 text-center transition-colors',
          'hover:border-accent/60 hover:bg-accent-soft/30 disabled:opacity-60',
        )}
      >
        <FileUp className="size-6 text-ballpoint" aria-hidden="true" />
        <span className="text-[13px]">Choose files or drop them here</span>
        <span className="text-xs text-faint">.pdf · .docx · .pptx · .doc · .ppt</span>
      </button>

      {hasOffice && (
        <fieldset className="mt-3">
          <legend className="mb-1.5 text-xs font-medium text-muted">Word / PowerPoint files</legend>
          <div role="radiogroup" aria-label="Import strategy" className="grid gap-1.5">
            {STRATEGIES.map((s) => (
              <label
                key={s.id}
                className={cn(
                  'flex cursor-pointer items-start gap-2 rounded-wobbly-sm border px-2.5 py-2 text-left transition-colors',
                  strategy === s.id ? 'border-accent bg-accent-soft/40' : 'border-lineSoft hover:bg-raise',
                  running && 'pointer-events-none opacity-60',
                )}
              >
                <input
                  type="radio"
                  name="import-strategy"
                  value={s.id}
                  checked={strategy === s.id}
                  onChange={() => setStrategy(s.id)}
                  disabled={running}
                  className="mt-0.5 accent-[rgb(var(--c-accent))]"
                />
                <span className="min-w-0">
                  <span className="block text-[13px]">{s.label}</span>
                  <span className="block text-xs leading-snug text-muted">{s.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      {rows.length > 0 && (
        <ul className="mt-3 flex max-h-[38vh] flex-col gap-1.5 overflow-y-auto" aria-label="Files to import">
          {rows.map((row, i) => (
            <li key={`${row.file.name}-${i}`} className="rounded-wobbly-sm border border-lineSoft bg-panel px-2.5 py-2">
              <div className="flex items-center gap-2">
                <FileText size={14} className="shrink-0 text-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-[13px]" title={row.file.name}>
                  {row.file.name}
                </span>
                <RowStatus state={row.state} />
                {row.state.status === 'queued' && !running && (
                  <button
                    type="button"
                    aria-label={`Remove ${row.file.name}`}
                    onClick={() => setRows((prev) => prev.filter((_, j) => j !== i))}
                    className="grid size-6 place-items-center rounded-wobbly-sm text-faint hover:bg-raise hover:text-ink"
                  >
                    <X size={12} />
                  </button>
                )}
              </div>
              {row.state.status === 'running' && (
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-raise" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(row.state.progress.fraction * 100)}>
                  <div className="h-full bg-ballpoint transition-[width] duration-300" style={{ width: `${Math.max(4, row.state.progress.fraction * 100)}%` }} />
                </div>
              )}
              {row.state.status === 'done' && (
                <p className="mt-1 text-xs text-muted">{row.state.result.message}</p>
              )}
              {row.state.status === 'failed' && <p className="mt-1 text-xs text-accent">{row.state.error}</p>}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {running ? (
          <Button variant="outline" size="sm" onClick={cancel}>
            Cancel
          </Button>
        ) : finished ? (
          <Button variant="primary" size="sm" onClick={closeAllModals}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="ghost" size="sm" onClick={closeAllModals}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" disabled={pending.length === 0} onClick={() => void run()}>
              Import {pending.length > 1 ? `${pending.length} files` : ''}
            </Button>
          </>
        )}
      </div>
    </Modal>
  )
}

function RowStatus({ state }: { state: RowState }): React.ReactNode {
  switch (state.status) {
    case 'queued':
      return <span className="text-xs text-faint">Ready</span>
    case 'running':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-ballpoint">
          <LoaderCircle size={12} className="animate-spin" />
          {state.progress.message}
        </span>
      )
    case 'done':
      return (
        <span className="inline-flex items-center gap-1 text-xs text-ballpoint">
          <CheckSoft size={12} />
          Imported
        </span>
      )
    case 'failed':
      return <span className="text-xs text-accent">Failed</span>
    case 'cancelled':
      return <span className="text-xs text-faint">Cancelled</span>
  }
}
