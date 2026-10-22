import { useState } from 'react'
import { PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { dayKey } from '@/coach/study'
import { ISIP } from '@/isip/copy'
import { entryDay, read } from '@/isip/read'
import { addEntries, deleteEntries } from '@/library/isip'
import { chipLabel } from '@/library/workouts'
import { useUIStore } from '@/store/uiStore'
import { Modal } from '@/components/UI/Modal'
import { cn } from '@/utils/cn'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/** What a line will read as first, for the chip beside the field; `suggested` when Isip will ask. */
export function previewLine(text: string, now = Date.now()): { kind: string; label: string; suggested: boolean } | null {
  const line = text.trim()
  const r = line ? read({ text: line, day: entryDay(line, dayKey(now)), createdAt: now })[0] : undefined
  const label = r ? chipLabel(r.entry) : ''
  return r && label ? { kind: r.entry.kind, label, suggested: r.status === 'suggested' } : null
}

/** Saves each line of `text` as an Isip Entry, with an Undo. */
export function captureLine(text: string): void {
  const added = addEntries(text)
  if (added.length === 0) return
  toast.success(ISIP.capture.saved(added.length), {
    action: { label: ISIP.undo, onClick: () => deleteEntries(added.map((e) => e.id)) },
  })
}

/** The one Isip box: "P150 lunch gcash", "@ 2pm dentist", "bench 60x5x3", or just words. Enter saves; a pasted list saves a line each. */
export function QuickCapture({ className, autoFocus, onSaved }: { className?: string; autoFocus?: boolean; onSaved?: () => void }): React.ReactNode {
  const [text, setText] = useState('')
  const preview = previewLine(text)
  const narrow = useMediaQuery('(max-width: 479px)')

  return (
    <form
      className={cn(
        'flex items-center gap-2 rounded-card border border-lineSoft bg-panel px-3 focus-within:border-line',
        className,
      )}
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        captureLine(text)
        setText('')
        onSaved?.()
      }}
    >
      <PenLine size={16} className="shrink-0 text-faint" aria-hidden="true" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onPaste={(e) => {
          // A text field would join the lines; keep them apart
          const pasted = e.clipboardData.getData('text')
          if (!/\n/.test(pasted.trim())) return
          e.preventDefault()
          const el = e.currentTarget
          captureLine(text.slice(0, el.selectionStart ?? text.length) + pasted + text.slice(el.selectionEnd ?? text.length))
          setText('')
          onSaved?.()
        }}
        placeholder={narrow ? ISIP.capture.placeholderShort : ISIP.capture.placeholder}
        autoFocus={autoFocus}
        aria-label={ISIP.capture.label}
        enterKeyHint="done"
        autoComplete="off"
        className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
      />
      {preview && (
        <span className={cn(`entry-chip entry-chip-${preview.kind} shrink-0`, preview.suggested && 'entry-chip-suggested')}>{preview.label}</span>
      )}
    </form>
  )
}

/** The capture box on its own, from anywhere: Ctrl+Shift+Space, or Write on the phone's tab bar. */
export function CaptureModal(): React.ReactNode {
  const close = useUIStore((s) => s.closeModal)
  return (
    <Modal title={ISIP.capture.title} onClose={close} size="md" align="top">
      <QuickCapture autoFocus onSaved={close} />
    </Modal>
  )
}
