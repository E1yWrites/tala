import { useState } from 'react'
import { PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { dayKey } from '@/coach/study'
import { parseTyped } from '@/entries/parse'
import { chipLabel } from '@/library/workouts'
import { appendLine } from '@/library/journal'
import { useUIStore } from '@/store/uiStore'
import { cn } from '@/utils/cn'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/** What a captured line will become, for the chip beside the field. `journal`: it is going into today's journal page. */
export function previewLine(text: string, journal = true): { kind: string; label: string } | null {
  const entry = text.trim() ? parseTyped(text, dayKey(Date.now()), undefined, journal) : null
  const label = entry ? chipLabel(entry) || 'Task' : ''
  return entry && label ? { kind: entry.kind, label } : null
}

/** Writes a line into today's journal page and offers to open it. */
export function captureLine(text: string): void {
  const { noteId, pageId } = appendLine(text)
  toast.success('Written in today’s page', {
    action: { label: 'Open', onClick: () => useUIStore.getState().selectNote(noteId, pageId) },
  })
}

/** One line into today's journal: "P150 lunch gcash", "@ 2pm dentist", "[ ] essay due fri", or just words. */
export function QuickCapture({ className }: { className?: string }): React.ReactNode {
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
      }}
    >
      <PenLine size={16} className="shrink-0 text-faint" aria-hidden="true" />
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={narrow ? 'Write it down…  P150 lunch · @ 2pm' : 'Write it down…  P150 lunch · @ 2pm dentist · [ ] essay fri'}
        aria-label="Write a line in today’s journal page"
        enterKeyHint="done"
        autoComplete="off"
        className="h-11 min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint"
      />
      {preview && <span className={`entry-chip entry-chip-${preview.kind} shrink-0`}>{preview.label}</span>}
    </form>
  )
}
