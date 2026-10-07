import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckSoft, Copy, Download } from 'lucide-react'
import { useNoteStore } from '@/store/noteStore'
import { useNotePages } from '@/store/pageStore'
import { useUIStore } from '@/store/uiStore'
import {
  noteToMarkdown,
  noteToPlainText,
  sanitizeFilename,
  downloadBlob,
  downloadTextFile,
} from '@/utils/markdown'
import { exportNotePdf } from '@/library/pdfExport'
import { Modal } from '@/components/UI/Modal'
import { Button } from '@/components/UI/Button'

/** navigator.clipboard is unavailable on http:// origins — fall back gracefully. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

/** Copy / download the current note as Markdown or plain text. */
export function ShareModal({ noteId }: { noteId: string }): React.ReactNode {
  const note = useNoteStore((s) => s.notes.find((n) => n.id === noteId))
  const pages = useNotePages(noteId)
  const closeAllModals = useUIStore((s) => s.closeAllModals)
  const [copied, setCopied] = useState(false)
  const [exporting, setExporting] = useState(false)
  const copiedTimer = useRef<number>(undefined)

  // Clear the "Copied" flip-back timer when the modal unmounts
  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const markdown = useMemo(() => (note ? noteToMarkdown(note, pages) : ''), [note, pages])
  const plain = useMemo(() => (note ? noteToPlainText(note, pages) : ''), [note, pages])

  if (!note) {
    return (
      <Modal title="Share" onClose={closeAllModals} size="sm">
        <p className="p-4 text-xs text-muted">This note no longer exists.</p>
      </Modal>
    )
  }

  async function handleCopy(): Promise<void> {
    const ok = await copyText(markdown)
    if (!ok) {
      toast.error('Copy failed', { description: 'Use the .md download instead.' })
      return
    }
    setCopied(true)
    window.clearTimeout(copiedTimer.current)
    copiedTimer.current = window.setTimeout(() => setCopied(false), 1600)
  }

  const base = sanitizeFilename(note.title)

  async function handlePdf(): Promise<void> {
    setExporting(true)
    try {
      downloadBlob(`${base}.pdf`, await exportNotePdf(noteId))
    } catch (err) {
      console.error('[tala] PDF export failed', err)
      toast.error('Could not export the PDF')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Modal
      title="Share or export"
      subtitle={note.title || 'Untitled'}
      onClose={closeAllModals}
      size="md"
    >
      <div className="flex flex-wrap gap-2">
        <Button variant="primary" size="sm" onClick={() => void handleCopy()}>
          {copied ? <CheckSoft className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? 'Copied' : 'Copy Markdown'}
        </Button>
        <Button variant="outline" size="sm" disabled={exporting} onClick={() => void handlePdf()}>
          <Download className="size-3.5" />
          {exporting ? 'Making PDF…' : 'PDF with handwriting'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadTextFile(`${base}.md`, markdown, 'text/markdown')}
        >
          <Download className="size-3.5" />
          .md file
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadTextFile(`${base}.txt`, plain, 'text/plain')}
        >
          <Download className="size-3.5" />
          .txt file
        </Button>
      </div>

      <p className="mt-2 text-xs text-faint">
        The PDF keeps handwriting as crisp vector lines. Typed text is exported as plain text and may wrap
        differently than on screen.
      </p>

      <pre className="mt-3 max-h-[40vh] overflow-auto rounded-card border border-lineSoft bg-canvas p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
        {markdown || '(empty note)'}
      </pre>
    </Modal>
  )
}
