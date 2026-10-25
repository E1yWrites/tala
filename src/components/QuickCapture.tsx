import { useId, useMemo, useState } from 'react'
import { ArrowUp, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { dayKey } from '@/coach/study'
import { formatDay } from '@/entries/parse'
import { ISIP } from '@/isip/copy'
import { entryDay, read } from '@/isip/read'
import { suggestions, usualLines } from '@/isip/usual'
import { useIsipStore } from '@/store/isipStore'
import { addEntries, deleteEntries } from '@/library/isip'
import { chipLabel } from '@/library/workouts'
import { useUIStore } from '@/store/uiStore'
import { Modal } from '@/components/UI/Modal'
import { cn } from '@/utils/cn'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/** What a line will read as first, for the chip beside the field; `suggested` when Isip will ask. */
export function previewLine(text: string, now = Date.now(), day = dayKey(now)): { kind: string; label: string; suggested: boolean } | null {
  const line = text.trim()
  const r = line ? read({ text: line, day: entryDay(line, day), createdAt: now })[0] : undefined
  const label = r ? chipLabel(r.entry) : ''
  return r && label ? { kind: r.entry.kind, label, suggested: r.status === 'suggested' } : null
}

/** Saves each line of `text` as an Isip Entry (for `day`, else today), with an Undo; `quiet` where the line shows up right above anyway (Today's thread). */
export function captureLine(text: string, day?: string, quiet = false): void {
  const now = Date.now()
  const added = addEntries(text, now, day ?? dayKey(now))
  if (added.length === 0 || quiet) return
  toast.success(ISIP.capture.saved(added.length), {
    action: { label: ISIP.undo, onClick: () => deleteEntries(added.map((e) => e.id)) },
  })
}

/** The one Isip box: "P150 lunch gcash", "@ 2pm dentist", "bench 60x5x3", or just words. Enter saves; a pasted list saves a line each. */
export function QuickCapture({
  className,
  autoFocus,
  onSaved,
  day,
  again = false,
  docked = false,
}: {
  className?: string
  autoFocus?: boolean
  onSaved?: () => void
  /** The day lines count for when no word in them says another; today when left out. */
  day?: string
  /** Offer the lines you usually write as one-tap chips (Today and the capture popup). */
  again?: boolean
  /** Today's composer at the foot of the view: a larger field with a send button, the usual lines above it. */
  docked?: boolean
}): React.ReactNode {
  const [text, setText] = useState('')
  const preview = previewLine(text, Date.now(), day)
  const narrow = useMediaQuery('(max-width: 479px)')
  const entries = useIsipStore((s) => s.entries)
  const listId = useId()
  // Learnt from your own lines: the browser's own suggestion list as you type, and the usual ones as chips
  const offers = useMemo(() => suggestions(entries, Date.now(), ISIP.capture.starters), [entries])
  const usual = useMemo(() => (again && !day ? usualLines(entries, Date.now()) : []), [again, day, entries])

  return (
    <div className={cn('flex flex-col gap-2', docked && 'flex-col-reverse', className)}>
    <form
      className={cn(
        'flex items-center gap-2 border bg-panel focus-within:border-line',
        docked ? 'rounded-[20px] border-line py-1.5 pl-4 pr-1.5 shadow-raise' : 'rounded-card border-lineSoft px-3',
      )}
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim()) return
        captureLine(text, day, docked)
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
          captureLine(text.slice(0, el.selectionStart ?? text.length) + pasted + text.slice(el.selectionEnd ?? text.length), day, docked)
          setText('')
          onSaved?.()
        }}
        placeholder={day ? ISIP.capture.forDay(formatDay(day)) : narrow ? ISIP.capture.placeholderShort : ISIP.capture.placeholder}
        autoFocus={autoFocus}
        aria-label={ISIP.capture.label}
        list={listId}
        enterKeyHint="done"
        autoComplete="off"
        className={cn('h-11 min-w-0 flex-1 bg-transparent outline-none placeholder:text-faint', docked ? 'capture-docked text-[15.5px]' : 'text-[14px]')}
      />
      {preview && (
        <span className={cn(`entry-chip entry-chip-${preview.kind} shrink-0`, preview.suggested && 'entry-chip-suggested')}>{preview.label}</span>
      )}
      {docked && (
        <button
          type="submit"
          aria-label={ISIP.capture.send}
          disabled={!text.trim()}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-fg transition-[background-color,opacity,transform] duration-150 ease-out hover:bg-accent-strong active:scale-[0.94] disabled:opacity-40"
        >
          <ArrowUp size={19} strokeWidth={2.4} aria-hidden="true" />
        </button>
      )}
      <datalist id={listId}>
        {offers.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </form>
    {usual.length > 0 && (
      <div role="group" aria-label={ISIP.capture.again} className="flex flex-wrap items-center gap-1.5 px-1">
        <span className="text-xs text-faint">{ISIP.capture.again}</span>
        {usual.map((line) => (
          <button
            key={line}
            type="button"
            onClick={() => {
              captureLine(line, undefined, docked)
              onSaved?.()
            }}
            aria-label={ISIP.capture.againLabel(line)}
            className="min-h-8 rounded-full border border-lineSoft bg-panel px-3 text-[13px] transition-[border-color,transform] duration-150 ease-out hover:border-line active:scale-[0.97] [@media(pointer:coarse)]:min-h-11"
          >
            {line}
          </button>
        ))}
      </div>
    )}
    </div>
  )
}

/** The capture box on its own, from anywhere: Ctrl+Shift+Space, or Write on the phone's tab bar. */
export function CaptureModal(): React.ReactNode {
  const close = useUIStore((s) => s.closeModal)
  return (
    <Modal title={ISIP.capture.title} onClose={close} size="md" align="top">
      <QuickCapture autoFocus again onSaved={close} />
    </Modal>
  )
}
