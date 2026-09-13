import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CheckSoft, Copy, Download, FileArchive } from 'lucide-react'
import { useNoteStore } from '@/store/noteStore'
import { useUIStore } from '@/store/uiStore'
import {
  noteToMarkdown,
  noteToPlainText,
  sanitizeFilename,
  downloadTextFile,
} from '@/utils/markdown'
import { Modal } from '@/components/UI/Modal'
import { Button } from '@/components/UI/Button'
import { downloadPackage } from '@/lib/package/download'

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
  const closeAllModals = useUIStore((s) => s.closeAllModals)
  const [copied, setCopied] = useState(false)
  const [packing, setPacking] = useState(false)
  const copiedTimer = useRef<number>(undefined)

  // Clear the "Copied" flip-back timer when the modal unmounts
  useEffect(() => () => window.clearTimeout(copiedTimer.current), [])

  const markdown = useMemo(() => (note ? noteToMarkdown(note) : ''), [note])
  const plain = useMemo(() => (note ? noteToPlainText(note) : ''), [note])

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
  const document = note.documentId ? useNoteStore.getState().documents[note.documentId] : undefined
  const sharePackage = async (): Promise<void> => {
    if (packing) return
    setPacking(true)
    try {
      await downloadPackage({ noteIds: [note.id], fileName: `${base}.tala.zip` })
    } finally {
      setPacking(false)
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
        <Button variant="outline" size="sm" disabled={packing} onClick={() => void sharePackage()}>
          <FileArchive className="size-3.5" />
          {packing ? 'Packing…' : 'Tala package (.zip)'}
        </Button>
      </div>
      <p className="mt-2 text-xs text-faint">
        The Tala package keeps handwriting{document ? ', the imported document and its annotations' : ''} intact and can be
        imported into any Tala.
      </p>

      <pre className="mt-3 max-h-[40vh] overflow-auto rounded-wobbly-md border-2 border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted">
        {markdown || '(empty note)'}
      </pre>
    </Modal>
  )
}
