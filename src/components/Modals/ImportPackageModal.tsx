import { useEffect, useRef, useState } from 'react'
import { FileArchive, LoaderCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useUIStore } from '@/store/uiStore'
import {
  importPackage,
  PackageError,
  readPackage,
  type ConflictPolicy,
  type ParsedPackage,
} from '@/lib/package/talaPackage'
import { hydrateAll } from '@/database/hydration'
import { Modal } from '@/components/UI/Modal'
import { Button } from '@/components/UI/Button'
import { cn } from '@/utils/cn'

/* ---------------------------------------------------------------------------
   Import a Tala package (.zip). The file is fully validated before anything
   is shown; the user then picks how to treat notes that already exist.
--------------------------------------------------------------------------- */

const POLICIES: Array<{ id: ConflictPolicy; label: string; hint: string }> = [
  { id: 'copy', label: 'Keep both', hint: 'Notes that already exist here are imported as copies. Nothing local changes.' },
  { id: 'overwrite', label: 'Replace existing', hint: 'Notes with the same id replace the local version (handwriting and documents included).' },
  { id: 'skip', label: 'Skip existing', hint: 'Only notes that are not already here are imported.' },
]

export function ImportPackageModal({ file: initialFile }: { file?: File }): React.ReactNode {
  const closeAllModals = useUIStore((s) => s.closeAllModals)
  const selectNote = useUIStore((s) => s.selectNote)
  const setView = useUIStore((s) => s.setView)
  const [file, setFile] = useState<File | null>(initialFile ?? null)
  const [parsed, setParsed] = useState<ParsedPackage | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [policy, setPolicy] = useState<ConflictPolicy>('copy')
  const [replaceLibrary, setReplaceLibrary] = useState(false)
  const [applySettings, setApplySettings] = useState(false)
  const [importing, setImporting] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!file) return
    let cancelled = false
    setReading(true)
    setParsed(null)
    setError(null)
    file
      .arrayBuffer()
      .then((buf) => readPackage(buf))
      .then((pkg) => {
        if (!cancelled) setParsed(pkg)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof PackageError ? err.message : `Could not read this package: ${err instanceof Error ? err.message : String(err)}`)
      })
      .finally(() => {
        if (!cancelled) setReading(false)
      })
    return () => {
      cancelled = true
    }
  }, [file])

  const run = async (): Promise<void> => {
    if (!parsed || importing) return
    setImporting(true)
    try {
      const result = await importPackage(parsed, {
        onConflict: policy,
        replaceLibrary: parsed.manifest.scope === 'library' && replaceLibrary,
        applySettings: parsed.manifest.scope === 'library' && applySettings,
      })
      await hydrateAll()
      window.dispatchEvent(new CustomEvent('tala:external-sync'))
      closeAllModals()
      const parts = [`${result.notes} note${result.notes === 1 ? '' : 's'}`]
      if (result.documents > 0) parts.push(`${result.documents} document${result.documents === 1 ? '' : 's'}`)
      if (result.copied > 0) parts.push(`${result.copied} imported as cop${result.copied === 1 ? 'y' : 'ies'}`)
      if (result.skipped > 0) parts.push(`${result.skipped} skipped`)
      toast.success('Package imported', { description: parts.join(' · ') })
      if (parsed.manifest.scope === 'note' && result.notes === 1 && result.firstNoteId) {
        setView({ kind: 'all' })
        selectNote(result.firstNoteId)
      }
    } catch (err) {
      console.error('[tala] package import failed', err)
      toast.error('Import failed', { description: err instanceof Error ? err.message : String(err) })
    } finally {
      setImporting(false)
    }
  }

  const summary = parsed
    ? [
        `${parsed.notes.length} note${parsed.notes.length === 1 ? '' : 's'}`,
        parsed.documents.length > 0 ? `${parsed.documents.length} document${parsed.documents.length === 1 ? '' : 's'}` : null,
        parsed.assets.length > 0 ? `${parsed.assets.length} file${parsed.assets.length === 1 ? '' : 's'} (${Math.round(parsed.assets.reduce((n, a) => n + a.bytes, 0) / 1024)} KB)` : null,
        parsed.folders.length > 0 ? `${parsed.folders.length} folder${parsed.folders.length === 1 ? '' : 's'}` : null,
        parsed.tags.length > 0 ? `${parsed.tags.length} tag${parsed.tags.length === 1 ? '' : 's'}` : null,
      ].filter(Boolean)
    : []

  return (
    <Modal title="Import Tala package" subtitle="A .zip exported from Tala" onClose={closeAllModals} size="md" dismissable={!importing}>
      <input
        ref={inputRef}
        type="file"
        accept=".zip,application/zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) setFile(f)
          e.target.value = ''
        }}
        data-testid="package-file-input"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={importing}
        className={cn(
          'flex w-full items-center gap-3 rounded-wobbly-md border-2 border-dashed border-line bg-canvas px-4 py-3 text-left transition-colors hover:border-accent/60 hover:bg-accent-soft/30 disabled:opacity-60',
        )}
      >
        <FileArchive className="size-6 shrink-0 text-ballpoint" aria-hidden="true" />
        <span className="min-w-0">
          <span className="block truncate text-[13px]">{file ? file.name : 'Choose a .zip package'}</span>
          <span className="block text-xs text-faint">{file ? `${Math.round(file.size / 1024)} KB` : 'Exported from Share → Tala package, or Settings → Export'}</span>
        </span>
      </button>

      {reading && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-muted">
          <LoaderCircle size={12} className="animate-spin" /> Checking package…
        </p>
      )}
      {error && <p className="mt-3 rounded-wobbly-sm border border-accent/40 bg-accent/[0.06] px-2.5 py-2 text-xs text-accent">{error}</p>}

      {parsed && (
        <div className="mt-3">
          <p className="text-xs text-muted">
            <span className="font-medium text-ink">{parsed.manifest.scope === 'library' ? 'Library backup' : 'Shared notes'}</span>
            <span className="mx-1.5 text-faint">·</span>
            {summary.join(' · ')}
            {parsed.manifest.exportedAt > 0 && (
              <>
                <span className="mx-1.5 text-faint">·</span>
                exported {new Date(parsed.manifest.exportedAt).toLocaleDateString()}
              </>
            )}
          </p>
          <ul className="mt-2 max-h-32 overflow-y-auto rounded-wobbly-sm border border-lineSoft bg-panel px-2.5 py-1.5 text-xs">
            {parsed.notes.slice(0, 50).map((n) => (
              <li key={n.id} className="truncate py-0.5">
                {n.title || 'Untitled'}
                {n.documentId && <span className="ml-1 text-faint">(document)</span>}
              </li>
            ))}
            {parsed.notes.length > 50 && <li className="py-0.5 text-faint">…and {parsed.notes.length - 50} more</li>}
          </ul>

          <fieldset className="mt-3">
            <legend className="mb-1.5 text-xs font-medium text-muted">If a note already exists here</legend>
            <div role="radiogroup" aria-label="Conflict policy" className="grid gap-1.5">
              {POLICIES.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    'flex cursor-pointer items-start gap-2 rounded-wobbly-sm border px-2.5 py-2 transition-colors',
                    policy === p.id ? 'border-accent bg-accent-soft/40' : 'border-lineSoft hover:bg-raise',
                    replaceLibrary && 'pointer-events-none opacity-50',
                  )}
                >
                  <input type="radio" name="conflict" value={p.id} checked={policy === p.id} onChange={() => setPolicy(p.id)} disabled={replaceLibrary} className="mt-0.5" />
                  <span>
                    <span className="block text-[13px]">{p.label}</span>
                    <span className="block text-xs leading-snug text-muted">{p.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {parsed.manifest.scope === 'library' && (
            <div className="mt-3 grid gap-1.5 text-xs">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={replaceLibrary} onChange={(e) => setReplaceLibrary(e.target.checked)} />
                Replace my whole library with this backup (erases current notes first)
              </label>
              {parsed.settings && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={applySettings} onChange={(e) => setApplySettings(e.target.checked)} />
                  Also restore settings from the backup
                </label>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={closeAllModals} disabled={importing}>
          Cancel
        </Button>
        <Button variant={replaceLibrary ? 'danger' : 'primary'} size="sm" disabled={!parsed || importing} onClick={() => void run()}>
          {importing ? 'Importing…' : replaceLibrary ? 'Replace library' : 'Import'}
        </Button>
      </div>
    </Modal>
  )
}
