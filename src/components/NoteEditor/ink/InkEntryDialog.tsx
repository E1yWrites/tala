import { useState } from 'react'
import { Modal } from '../../UI/Modal'
import { Button } from '../../UI/Button'
import { previewLine } from '@/components/QuickCapture'
import { cn } from '@/utils/cn'

const KINDS = [
  { prefix: 'P', label: '₱ Money', hint: '150 lunch gcash' },
  { prefix: '[ ] ', label: 'Task', hint: 'essay due fri' },
  { prefix: '@ ', label: 'Event', hint: 'thu 2pm dentist' },
] as const

/**
 * Lasso → "Turn into…": the handwriting stays what you see; this records what it
 * means as a typed line, so it counts in the roll-ups. No handwriting recognition.
 */
export function InkEntryDialog({ onClose, onSave }: { onClose: () => void; onSave: (line: string) => void }): React.ReactNode {
  const [prefix, setPrefix] = useState<string>(KINDS[0].prefix)
  const [text, setText] = useState('')
  const line = `${prefix}${text.trim()}`
  const preview = text.trim() ? previewLine(line, false) : null
  const kind = KINDS.find((k) => k.prefix === prefix)!

  return (
    <Modal onClose={onClose} ariaLabel="Turn handwriting into an entry" className="max-w-sm" standalone>
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault()
          if (preview) onSave(line)
        }}
      >
        <h2 className="text-xl font-bold leading-snug tracking-[-0.02em]">Turn into an entry</h2>
        <div role="radiogroup" aria-label="Kind" className="mt-3 flex gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k.prefix}
              type="button"
              role="radio"
              aria-checked={k.prefix === prefix}
              onClick={() => setPrefix(k.prefix)}
              className={cn(
                'rounded-control border px-2.5 py-1 text-xs font-semibold transition-colors',
                k.prefix === prefix ? 'border-accent bg-accent-soft text-accent-strong' : 'border-lineSoft text-muted hover:border-line',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex h-10 items-center rounded-card border border-lineSoft bg-canvas px-3 focus-within:border-ballpoint focus-within:ring-2 focus-within:ring-ballpoint/20">
          <span className="shrink-0 font-mono text-sm text-faint">{prefix.trim()}</span>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={kind.hint}
            autoFocus
            aria-label="What it says"
            className="ml-1.5 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </div>
        <p className="mt-2 min-h-[22px] text-xs text-faint">
          {preview ? <span className={`entry-chip entry-chip-${preview.kind} !ml-0`}>{preview.label}</span> : 'Type what you wrote; dates like “bukas” or “fri 2pm” work.'}
        </p>
        <div className="mt-3 flex justify-end gap-2">
          <Button size="sm" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" type="submit" disabled={!preview}>
            Save
          </Button>
        </div>
      </form>
    </Modal>
  )
}
