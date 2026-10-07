import { useMemo } from 'react'
import { FileUp, FolderPlus, PenLine, Plus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '@/store/uiStore'
import { useNoteStore } from '@/store/noteStore'
import { usePageStore } from '@/store/pageStore'
import { Bituin } from '@/coach/Bituin'
import { displayTitle } from '@/utils/noteFilters'
import { pagesText, textPreview } from '@/utils/doc'
import { formatRelative } from '@/utils/dates'
import { catalogNumbers, formatCatalog } from '@/utils/catalog'
import { Kbd } from '../UI/Kbd'
import { shortcut } from '@/utils/keys'

/**
 * The editor pane with no note open (tablet and desktop). An empty library
 * gets the start list (first run); otherwise the notes to pick up again.
 */
export function EditorPlaceholder(): React.ReactNode {
  const notes = useNoteStore((s) => s.notes)
  const hydrated = useNoteStore((s) => s.hydrated)
  const live = useMemo(() => notes.filter((n) => !n.isDeleted && !n.isArchived), [notes])
  if (!hydrated) return <div className="h-full bg-canvas" />

  return (
    <div className="h-full overflow-y-auto bg-canvas">
      <div className="mx-auto flex max-w-[640px] flex-col gap-8 px-8 pb-12 pt-[12vh] animate-fade-in">
        {live.length === 0 ? <StartList /> : <PickUp />}
      </div>
    </div>
  )
}

/** First run: the three ways in, as real actions. */
export function StartList({ heading = true }: { heading?: boolean }): React.ReactNode {
  const openModal = useUIStore((s) => s.openModal)
  return (
    <section aria-labelledby={heading ? 'start-heading' : undefined}>
      {heading && (
        <div className="mb-5 flex items-center gap-3">
          <Bituin size={44} blink />
          <div>
            <h2 id="start-heading" className="text-[22px] font-bold leading-tight tracking-[-0.02em]">
              Start your first note
            </h2>
            <p className="text-sm text-muted">Everything stays on this device. No account, nothing uploaded.</p>
          </div>
        </div>
      )}
      <ol className="overflow-hidden rounded-card border border-lineSoft bg-panel">
        <StartRow
          icon={Plus}
          title="New note"
          body="Type, or switch to Write and use your pen. Pages grow as you go."
          kbd={shortcut('N')}
          onClick={() => openModal({ kind: 'new-note' })}
        />
        <StartRow
          icon={FileUp}
          title="Import a PDF to mark up"
          body="Slides and handouts keep their pages and work offline once imported."
          onClick={() => openModal({ kind: 'new-note' })}
        />
        <StartRow
          icon={FolderPlus}
          title="Add a folder for each class"
          body="BIO 101, HIST 12… notes land in the folder you have open."
          onClick={() => openModal({ kind: 'folder-editor' })}
        />
      </ol>
    </section>
  )
}

function StartRow({
  icon: Icon,
  title,
  body,
  kbd,
  onClick,
}: {
  icon: LucideIcon
  title: string
  body: string
  kbd?: string
  onClick: () => void
}): React.ReactNode {
  return (
    <li className="border-b border-lineSoft last:border-b-0">
      <button
        type="button"
        onClick={onClick}
        className="group flex w-full items-start gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-raise/60 focus-visible:bg-raise/60"
      >
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent" aria-hidden="true">
          <Icon size={16} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{title}</span>
          <span className="block text-[13px] leading-snug text-muted">{body}</span>
        </span>
        {kbd && <Kbd className="mt-1 hidden md:inline-flex">{kbd}</Kbd>}
      </button>
    </li>
  )
}

/** Returning: the four most recent notes. */
export function PickUp(): React.ReactNode {
  const notes = useNoteStore((s) => s.notes)
  const pagesByNote = usePageStore((s) => s.pagesByNote)
  const selectNote = useUIStore((s) => s.selectNote)
  const openModal = useUIStore((s) => s.openModal)
  const catalog = catalogNumbers(notes)
  const recent = useMemo(
    () =>
      notes
        .filter((n) => !n.isDeleted && !n.isArchived)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 4),
    [notes],
  )

  return (
    <>
      <section aria-labelledby="pickup-heading">
        <div className="mb-3 flex items-end justify-between gap-4">
          <h2 id="pickup-heading" className="text-[22px] font-bold leading-tight tracking-[-0.02em]">
            Pick up where you left off
          </h2>
          <button
            type="button"
            onClick={() => openModal({ kind: 'new-note' })}
            className="btn-primary h-9 shrink-0 rounded-control px-3.5 text-[13.5px] font-semibold [@media(pointer:coarse)]:h-11"
          >
            <PenLine size={15} aria-hidden="true" />
            New note
          </button>
        </div>
        <ul className="overflow-hidden rounded-card border border-lineSoft bg-panel">
          {recent.map((note) => (
            <li key={note.id} className="border-b border-lineSoft last:border-b-0">
              <button
                type="button"
                onClick={() => selectNote(note.id)}
                className="flex w-full items-baseline gap-3 px-4 py-3 text-left transition-colors hover:bg-raise/60 focus-visible:bg-raise/60"
              >
                <span className="w-12 shrink-0 text-[11.5px] font-medium tabular-nums text-faint">
                  {formatCatalog(catalog.get(note.id) ?? 0)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{displayTitle(note)}</span>
                  <span className="block truncate text-[13px] text-muted">
                    {textPreview(pagesText(pagesByNote[note.id] ?? []), 90) || 'No text yet'}
                  </span>
                </span>
                <time className="shrink-0 text-xs tabular-nums text-faint">{formatRelative(note.updatedAt)}</time>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  )
}
